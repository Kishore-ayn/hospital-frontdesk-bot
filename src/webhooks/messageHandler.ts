import { Request, Response } from "express";
import { loadClientConfig, ClientConfig } from "../config/configLoader";
import {
  getConversationState,
  saveConversationState,
  createEscalation,
  ConversationState,
  initializeDatabase,
} from "../db/stateManager";
import {
  generateMainMenu,
  handleVisitingHours,
  handleBillingInfo,
  handleEscalation,
  isValidMenuChoice,
  getMenuOptionByNumber,
  returnToMainMenu,
  handleDoctorAvailability,
  handleReportStatus,
  handleFreeTextQuestion,
  handleTotalDepartments,
  handleTotalDoctors,
  handleHospitalServices,
  handleInsuranceCompanies,
} from "../menu/menuFlow";
import { notifyEscalation } from "../services/escalationService";
import { sendOpenWaText } from "../services/openwaService";

// OpenWA webhook payload interfaces
export interface OpenWAInboundMessage {
  event: string;
  timestamp?: string;
  sessionId?: string;
  idempotencyKey?: string;
  deliveryId?: string;
  data: {
    id?: string;
    from: string; // WhatsApp JID (e.g., "919XXXXXXXXX@c.us" or "1203...@g.us")
    to: string; // Bot's WhatsApp JID
    body?: string;
    type?: string; // "text", "image", etc.
    timestamp?: number;
    fromMe?: boolean;
    isGroup?: boolean;
    kind?: string;
    author?: string;
    isStatusBroadcast?: boolean;
    contact?: {
      pushName?: string;
      name?: string;
    };
    quotedMessage?: {
      id?: string;
      body?: string;
    };
  };
}

// Internal normalized message interface
export interface IncomingMessage {
  from: string; // Normalized phone number (without @c.us/@g.us suffix)
  message: string;
  messageId?: string;
  timestamp?: number;
  isGroup?: boolean;
  author?: string;
}

export interface AiSensyInboundMessage {
  from: string; // Phone number
  message: string;
  projectId?: string; // Can help identify the client
  timestamp?: number;
}

export interface BotResponse {
  to: string;
  message: string;
  type: "text" | "menu" | "escalation";
  ticketId?: string;
}

/**
 * Extract phone number from WhatsApp JID
 * Examples:
 *   "919XXXXXXXXX@c.us" -> "919XXXXXXXXX"
 *   "1203...@g.us" -> "1203..."
 *   "919XXXXXXXXX" -> "919XXXXXXXXX" (already normalized)
 */
function normalizeJidToPhoneNumber(jid: string): string {
  if (!jid) return "";

  // Remove @c.us, @g.us, or @lid suffixes
  return jid.replace(/@(c|g|lid)\.us$/, '');
}

/**
 * Adapt OpenWA webhook payload to internal message format
 * Returns null if the payload should be ignored (non-text, group, fromMe, etc.)
 */
function adaptOpenWaPayload(payload: OpenWAInboundMessage): IncomingMessage | null {
  // Only process message.received events
  if (payload.event !== "message.received") {
    console.log(`[OPENWA] Ignoring non-message.received event: ${payload.event}`);
    return null;
  }

  const data = payload.data;

  // Safety checks for required fields
  if (!data || !data.from || data.body === undefined) {
    console.log("[OPENWA] Ignoring payload with missing required fields (from or body)");
    return null;
  }

  // Ignore messages sent by the bot itself
  if (data.fromMe === true) {
    console.log("[OPENWA] Ignoring fromMe message (sent by bot)");
    return null;
  }

  // Only process text messages for now
  if (data.type !== "text") {
    console.log(`[OPENWA] Ignoring non-text message type: ${data.type}`);
    return null;
  }

  // Ignore group messages (for now)
  if (data.isGroup === true) {
    console.log("[OPENWA] Ignoring group message");
    return null;
  }

  // Extract and normalize phone number from JID
  const fromPhoneNumber = normalizeJidToPhoneNumber(data.from);

  if (!fromPhoneNumber) {
    console.log("[OPENWA] Failed to normalize phone number from JID:", data.from);
    return null;
  }

  // Return normalized message
  return {
    from: fromPhoneNumber,
    message: data.body,
    messageId: data.id,
    timestamp: data.timestamp,
    isGroup: data.isGroup || false,
    author: data.author ? normalizeJidToPhoneNumber(data.author) : undefined
  };
}

/**
 * Handle incoming WhatsApp message from OpenWA webhook
 */
export async function handleIncomingMessage(
  req: Request,
  res: Response
): Promise<void> {
  try {
    console.log("========== OPENWA WEBHOOK PAYLOAD ==========");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("============================================");

    // Parse as OpenWA payload
    const openwaPayload = req.body as OpenWAInboundMessage;

    // Adapt OpenWA payload to internal message format
    const internalMessage = adaptOpenWaPayload(openwaPayload);
    if (!internalMessage) {
      // Payload was ignored (non-text, group, fromMe, etc.) - acknowledge with 200
      res.status(200).json({ success: true });
      return;
    }

    // Identify client using the bot's WhatsApp number (from OpenWA payload data.to)
    let config: ClientConfig;
    try {
      const botJid = openwaPayload.data.to;
      if (!botJid) {
        throw new Error("Bot JID (data.to) not found in OpenWA payload");
      }
      const botPhoneNumber = normalizeJidToPhoneNumber(botJid);
      config = loadClientConfig(botPhoneNumber);
      console.log(`[OPENWA] Loaded client config for bot number: ${botPhoneNumber}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `Failed to load client config by bot WhatsApp number, falling back to first client: ${errorMessage}`
      );
      const configs = require("../config/configLoader").getAllClientConfigs();
      if (configs.length === 0) {
        throw new Error("No client configs found");
      }
      config = configs[0];
      console.log(`[OPENWA] Using first client config as fallback: ${config.clientId}`);
    }

    // Initialize database to ensure it's ready for conversation state operations
    await initializeDatabase();

    // Get or create conversation state
    const state = getConversationState(internalMessage.from, config.clientId);

    // Process message and generate response
    const response = await processUserMessage(
      internalMessage.message.trim(),
      state,
      config
    );

    // Update state
    state.currentStep = response.nextStep;
    state.userData = response.userData;
    saveConversationState(state);

    // If escalation, create ticket and send notification
    if (response.escalation) {
      const { userMessage, escalationData } = response.escalation;
      const ticketId = escalationData.ticketId as string;

      createEscalation(
        ticketId,
        internalMessage.from,
        config.clientId,
        escalationData.type as string,
        escalationData
      );

      // Send notification to external service
      if (config.escalationChannel && config.escalationChannel.webhookUrl) {
        notifyEscalation(
          {
            ticketId,
            phoneNumber: internalMessage.from,
            clientId: config.clientId,
            hospitalName: config.hospitalName,
            reason: "Patient requested to speak with front desk",
            timestamp: new Date().toISOString(),
          },
          config.escalationChannel.webhookUrl,
          config.escalationChannel.type as "slack" | "whatsapp" | "webhook"
        ).catch((err) =>
          console.error("Failed to send escalation notification:", err)
        );
      }

      // Send WhatsApp response via OpenWA
      if (openwaPayload.sessionId) {
        const whatsappResult = await sendOpenWaText(
          openwaPayload.sessionId,
          openwaPayload.data.from,
          userMessage
        );

        if (!whatsappResult.success) {
          console.error("[OPENWA OUTBOUND] Failed to send escalation response:", whatsappResult.error);
        }
      } else {
        console.warn("[OPENWA OUTBOUND] Missing sessionId, cannot send WhatsApp response");
      }

      res.json({
        success: true,
        response: {
          to: internalMessage.from,
          message: userMessage,
          type: "escalation",
          ticketId,
        },
      });

      // Log escalation for staff notification
      console.log(`[ESCALATION] Ticket: ${ticketId}, User: ${internalMessage.from}`);
      return;
    }

    // Send response
    // Send WhatsApp response via OpenWA
    if (openwaPayload.sessionId) {
      const whatsappResult = await sendOpenWaText(
        openwaPayload.sessionId,
        openwaPayload.data.from,
        response.message
      );

      if (!whatsappResult.success) {
        console.error("[OPENWA OUTBOUND] Failed to send response:", whatsappResult.error);
      }
    } else {
      console.warn("[OPENWA OUTBOUND] Missing sessionId, cannot send WhatsApp response");
    }

    res.json({
      success: true,
      response: {
        to: internalMessage.from,
        message: response.message,
        type: "text",
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error handling message:", errorMessage);
    res.status(500).json({ error: "Internal server error" });
  }
}

interface ProcessingResult {
  message: string;
  nextStep: string;
  userData: Record<string, unknown>;
  escalation?: {
    userMessage: string;
    escalationData: Record<string, unknown>;
  };
}

/**
 * Process user message and determine response
 */
async function processUserMessage(
  userMessage: string,
  state: ConversationState,
  config: ClientConfig
): Promise<ProcessingResult> {
  const userData = state.userData || {};

  // Handle "menu" command to return to main menu
  if (userMessage.toLowerCase() === "menu") {
    return {
      message: returnToMainMenu(config),
      nextStep: "main_menu",
      userData: {},
    };
  }

  // Handle main menu
  if (state.currentStep === "main_menu") {
    // First check if it's a valid menu choice
    if (isValidMenuChoice(userMessage)) {
      const choice = parseInt(userMessage.trim(), 10);
      const option = getMenuOptionByNumber(choice);

      if (!option) {
        return {
          message: generateMainMenu(config),
          nextStep: "main_menu",
          userData,
        };
      }

      // Route to appropriate handler
      switch (option.key) {
        case "visiting_hours":
          return {
            message: await handleVisitingHours(config),
            nextStep: "waiting_for_menu_action",
            userData,
          };

        case "doctor_availability":
          return {
            message: `👨‍⚕️ Doctor Availability\n\nPlease enter the doctor's name you want to check availability for:\n\n(Type 'menu' or '10' to return to main menu)`,
            nextStep: "waiting_for_doctor_name",
            userData,
          };

        case "report_status":
          return {
            message: `🏥 Report Status\n\nPlease provide your Patient ID:\n\n(Type 'menu' or '10' to return to main menu)`,
            nextStep: "waiting_for_patient_id",
            userData,
          };

        case "billing_info":
          return {
            message: handleBillingInfo(config),
            nextStep: "waiting_for_menu_action",
            userData,
          };

        case "talk_to_frontdesk":
          const escalation = handleEscalation(config, state.phoneNumber);
          return {
            message: escalation.userMessage,
            nextStep: "escalated",
            userData,
            escalation: {
              userMessage: escalation.userMessage,
              escalationData: escalation.escalationData,
            },
          };
        case "total_departments":
          return {
            message: await handleTotalDepartments(config),
            nextStep: "waiting_for_menu_action",
            userData,
          }

        case "total_doctors":
          return {
            message: await handleTotalDoctors(config),
            nextStep: "waiting_for_menu_action",
            userData,
          }
        case "hospital_services":
          return {
            message: await handleHospitalServices(config),
            nextStep: "waiting_for_menu_action",
            userData,
          }
        case "insurance_companies":
          return {
            message: await handleInsuranceCompanies(config),
            nextStep: "waiting_for_menu_action",
            userData,
          }

        case "return_to_menu":
          return {
            message: returnToMainMenu(config),
            nextStep: "main_menu",
            userData,
          };

        default:
          return {
            message: generateMainMenu(config),
            nextStep: "main_menu",
            userData,
          };
      }
    } else {
      // Not a valid menu choice - treat as free-text question
      console.log(`[DEBUG] Processing free-text question: "${userMessage}" for state: ${state.currentStep}`);
      const freeTextResponse = await handleFreeTextQuestion(
        userMessage,
        config
      );
      console.log(`[DEBUG] Free-text response: shouldEscalate=${freeTextResponse.shouldEscalate}`);

      if (freeTextResponse.shouldEscalate) {
        // Instead of auto-escalating, show AI response and give user a choice
        const uncertainMessage = `🤔 I'm not completely sure about this answer. Would you like to:\n1. Raise a ticket for our hospital team to reachyou\n2. Get response from AI.\nReply 'menu' or '9' to return to main menu`;
        return {
          message: uncertainMessage,
          nextStep: "waiting_for_clarification_choice",
          userData: {
            ...userData,
            aiResponse: uncertainMessage,
            originalQuestion: userMessage
          }
        };
      }

      return {
        message: freeTextResponse.message,
        nextStep: "main_menu",
        userData,
      };
    }
  }

  // Handle waiting_for_menu_action (after visiting hours or billing info)
  if (state.currentStep === "waiting_for_menu_action") {
    // First check if it's a valid menu choice
    if (isValidMenuChoice(userMessage)) {
      const choice = parseInt(userMessage.trim(), 10);
      const option = getMenuOptionByNumber(choice);

      if (!option) {
        return {
          message: generateMainMenu(config),
          nextStep: "main_menu",
          userData,
        };
      }

      // Route to appropriate handler
      switch (option.key) {
        case "visiting_hours":
          return {
            message: await handleVisitingHours(config),
            nextStep: "waiting_for_menu_action",
            userData,
          };

        case "doctor_availability":
          return {
            message: `👨‍⚕️ Doctor Availability\n\nPlease enter the doctor's name you want to check availability for:\n\n(Type 'menu' or '10' to return to main menu)`,
            nextStep: "waiting_for_doctor_name",
            userData,
          };

        case "report_status":
          return {
            message: `🏥 Report Status\n\nPlease provide your Patient ID:\n\n(Type 'menu' or '10' to return to main menu)`,
            nextStep: "waiting_for_patient_id",
            userData,
          };

        case "billing_info":
          return {
            message: handleBillingInfo(config),
            nextStep: "waiting_for_menu_action",
            userData,
          };

        case "talk_to_frontdesk":
          const escalation = handleEscalation(config, state.phoneNumber);
          return {
            message: escalation.userMessage,
            nextStep: "escalated",
            userData,
            escalation: {
              userMessage: escalation.userMessage,
              escalationData: escalation.escalationData,
            },
          };
        case "total_departments":
          return {
            message: await handleTotalDepartments(config),
            nextStep: "waiting_for_menu_action",
            userData,
          }

        case "total_doctors":
          return {
            message: await handleTotalDoctors(config),
            nextStep: "waiting_for_menu_action",
            userData,
          }
        case "hospital_services":
          return {
            message: await handleHospitalServices(config),
            nextStep: "waiting_for_menu_action",
            userData,
          }
        case "insurance_companies":
          return {
            message: await handleInsuranceCompanies(config),
            nextStep: "waiting_for_menu_action",
            userData,
          }

        case "return_to_menu":
          return {
            message: returnToMainMenu(config),
            nextStep: "main_menu",
            userData,
          };

        default:
          return {
            message: generateMainMenu(config),
            nextStep: "main_menu",
            userData,
          };
      }
    }
    // If not a valid menu choice, fall through to free-text handling below
  }

  // Handle waiting for doctor name
  if (state.currentStep === "waiting_for_doctor_name") {
    // Handle "menu" command to return to main menu
    if (userMessage.toLowerCase() === "menu") {
      return {
        message: returnToMainMenu(config),
        nextStep: "main_menu",
        userData,
      };
    }

    // Handle valid menu choices to return to main menu
    if (isValidMenuChoice(userMessage)) {
      return {
        message: returnToMainMenu(config),
        nextStep: "main_menu",
        userData,
      };
    }

    // Process as doctor name
    const doctorMessage = await handleDoctorAvailability(userMessage, config);
    return {
      message: doctorMessage,
      nextStep: "main_menu",
      userData,
    };
  }

  // Handle waiting for patient ID
  if (state.currentStep === "waiting_for_patient_id") {
    // Handle "menu" command to return to main menu
    if (userMessage.toLowerCase() === "menu") {
      return {
        message: returnToMainMenu(config),
        nextStep: "main_menu",
        userData,
      };
    }

    // Handle valid menu choices to return to main menu
    if (isValidMenuChoice(userMessage)) {
      return {
        message: returnToMainMenu(config),
        nextStep: "main_menu",
        userData,
      };
    }

    // Process as patient ID
    const reportMessage = await handleReportStatus(userMessage, config);
    return {
      message: reportMessage,
      nextStep: "main_menu",
      userData,
    };
  }

  // Handle waiting for clarification choice (when AI is uncertain)
  if (state.currentStep === "waiting_for_clarification_choice") {
    // Handle "menu" command to return to main menu
    if (userMessage.toLowerCase() === "menu") {
      return {
        message: returnToMainMenu(config),
        nextStep: "main_menu",
        userData,
      };
    }

    const choice = userMessage.trim();
    if (choice === "1") {
      // User chose to raise a ticket
      const escalation = handleEscalation(config, state.phoneNumber);
      return {
        message: escalation.userMessage,
        nextStep: "escalated",
        userData,
        escalation: {
          userMessage: escalation.userMessage,
          escalationData: escalation.escalationData,
        },
      };
    } else if (choice === "2") {
      // User chose to get AI response again
      return {
        message: (state.userData?.aiResponse as string) || "I'm not sure how to help with that. Please try rephrasing your question.",
        nextStep: "main_menu",
        userData,
      };
    } else if (choice === "8") {
      // User chose to return to main menu
      return {
        message: returnToMainMenu(config),
        nextStep: "main_menu",
        userData,
      };
    } else {
      // Invalid choice, show options again
      const uncertainMessage = `🤔 I'm not completely sure about this answer. Would you like to:\n1. Raise a ticket for our hospital team to reachyou\n2. Get response from AI.\nReply 'menu' or '9' to return to main menu`;
      return {
        message: uncertainMessage,
        nextStep: "waiting_for_clarification_choice",
        userData: state.userData
      };
    }
  }

  // Handle free-text questions (fallback for any other message)
  // This is where Claude API kicks in
  if (state.currentStep === "main_menu" || state.currentStep === "waiting_for_menu_action") {
    // Try to process as free-text question using Claude
    const freeTextResponse = await handleFreeTextQuestion(
      userMessage,
      config
    );

    if (freeTextResponse.shouldEscalate) {
      // Instead of auto-escalating, show AI response and give user a choice
      const uncertainMessage = `🤔 I'm not completely sure about this answer. Would you like to:\n1. Raise a ticket for our hospital team to reachyou\n2. Get response from AI.\nReply 'menu' or '9' to return to main menu`;
      return {
        message: uncertainMessage,
        nextStep: "waiting_for_clarification_choice",
        userData: {
          ...userData,
          aiResponse: uncertainMessage,
          originalQuestion: userMessage
        }
      };
    }

    return {
      message: freeTextResponse.message,
      nextStep: "main_menu",
      userData,
    };
  }

  // Default: return to menu
  return {
    message: returnToMainMenu(config),
    nextStep: "main_menu",
    userData: {},
  };
}
