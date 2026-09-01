import { Request, Response } from "express";
import { loadClientConfig, ClientConfig } from "../config/configLoader";
import {
  getConversationState,
  saveConversationState,
  createEscalation,
  ConversationState,
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
} from "../menu/menuFlow";
import { notifyEscalation } from "../services/escalationService";

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
 * Handle incoming WhatsApp message from AiSensy webhook
 */
export async function handleIncomingMessage(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const payload = req.body as AiSensyInboundMessage;

    // Validate payload
    if (!payload.from || !payload.message) {
      res.status(400).json({ error: "Missing required fields: from, message" });
      return;
    }

    // Identify client - can be improved to use projectId, webhookId, or receiving WhatsApp number
    // For now, we'll use the receiving WhatsApp number from the config or default to first client
    let config: ClientConfig;
    try {
      // Try to find by project ID first
      if (payload.projectId) {
        config = loadClientConfig(payload.projectId);
      } else {
        // Fallback to first available client (should be improved for production)
        const configs = require("../config/configLoader").getAllClientConfigs();
        if (configs.length === 0) {
          throw new Error("No client configs found");
        }
        config = configs[0];
      }
    } catch (error) {
      console.error("Failed to load client config:", error);
      res
        .status(404)
        .json({ error: "Client not found for this webhook endpoint" });
      return;
    }

    // Get or create conversation state
    const state = getConversationState(payload.from, config.clientId);

    // Process message and generate response
    const response = await processUserMessage(
      payload.message.trim(),
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
        payload.from,
        config.clientId,
        escalationData.type as string,
        escalationData
      );

      // Send notification to external service
      if (config.escalationChannel && config.escalationChannel.webhookUrl) {
        notifyEscalation(
          {
            ticketId,
            phoneNumber: payload.from,
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

      res.json({
        success: true,
        response: {
          to: payload.from,
          message: userMessage,
          type: "escalation",
          ticketId,
        },
      });

      // Log escalation for staff notification
      console.log(`[ESCALATION] Ticket: ${ticketId}, User: ${payload.from}`);
      return;
    }

    // Send response
    res.json({
      success: true,
      response: {
        to: payload.from,
        message: response.message,
        type: "text",
      },
    });
  } catch (error) {
    console.error("Error handling message:", error);
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
            message: handleVisitingHours(config),
            nextStep: "waiting_for_menu_action",
            userData,
          };

        case "doctor_availability":
          return {
            message: `👨‍⚕️ Doctor Availability\n\nPlease enter the doctor's name you want to check availability for:\n\n(Type 'menu' to return to main menu)`,
            nextStep: "waiting_for_doctor_name",
            userData,
          };

        case "report_status":
          return {
            message: `🏥 Report Status\n\nPlease provide your:\n• Patient ID, or\n• Registered phone number\n\n(Type 'menu' to return to main menu)`,
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
        // Auto-escalate if Claude can't handle it
        const escalation = handleEscalation(config, state.phoneNumber);
        return {
          message: freeTextResponse.message,
          nextStep: "escalated",
          userData,
          escalation: {
            userMessage: escalation.userMessage,
            escalationData: escalation.escalationData,
          },
        };
      }

      return {
        message: freeTextResponse.message,
        nextStep: "main_menu",
        userData,
      };
    }
  }

  // Handle waiting for doctor name
  if (state.currentStep === "waiting_for_doctor_name") {
    const doctorMessage = await handleDoctorAvailability(userMessage);
    return {
      message: doctorMessage,
      nextStep: "main_menu",
      userData,
    };
  }

  // Handle waiting for patient ID
  if (state.currentStep === "waiting_for_patient_id") {
    const reportMessage = handleReportStatus(userMessage);
    return {
      message: reportMessage,
      nextStep: "main_menu",
      userData,
    };
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
      // Auto-escalate if Claude can't handle it
      const escalation = handleEscalation(config, state.phoneNumber);
      return {
        message: freeTextResponse.message,
        nextStep: "escalated",
        userData,
        escalation: {
          userMessage: escalation.userMessage,
          escalationData: escalation.escalationData,
        },
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
