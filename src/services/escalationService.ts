/**
 * Escalation Notification Service
 * Handles sending escalation notifications to external services
 * Supports Slack, WhatsApp groups, and other webhooks
 */

import axios from "axios";
import { getEscalation } from "../db/stateManager";

export interface EscalationNotification {
  ticketId: string;
  phoneNumber: string;
  clientId: string;
  hospitalName: string;
  reason: string;
  timestamp: string;
}

/**
 * Send escalation notification to webhook
 */
export async function notifyEscalation(
  notification: EscalationNotification,
  webhookUrl: string,
  notificationType: "slack" | "whatsapp" | "webhook" = "webhook"
): Promise<boolean> {
  try {
    if (!webhookUrl) {
      console.warn("No webhook URL configured for escalations");
      return false;
    }

    const payload = formatPayload(notification, notificationType);

    const response = await axios.post(webhookUrl, payload, {
      timeout: 5000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(
      `✅ Escalation notification sent to ${webhookUrl}`,
      response.status
    );
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error("Failed to send escalation notification:", error);
    // Don't throw - escalation should still be recorded even if notification fails
    return false;
  }
}

/**
 * Format notification payload based on service type
 */
function formatPayload(
  notification: EscalationNotification,
  type: "slack" | "whatsapp" | "webhook"
): unknown {
  switch (type) {
    case "slack":
      return formatSlackPayload(notification);
    case "whatsapp":
      return formatWhatsAppPayload(notification);
    default:
      return formatGenericPayload(notification);
  }
}

/**
 * Format for Slack webhook
 */
function formatSlackPayload(notification: EscalationNotification): unknown {
  return {
    text: `🚨 New Escalation: ${notification.hospitalName}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🚨 New Patient Escalation",
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Ticket ID:*\n${notification.ticketId}`,
          },
          {
            type: "mrkdwn",
            text: `*Hospital:*\n${notification.hospitalName}`,
          },
          {
            type: "mrkdwn",
            text: `*Patient Phone:*\n${notification.phoneNumber}`,
          },
          {
            type: "mrkdwn",
            text: `*Time:*\n${notification.timestamp}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Reason:*\n${notification.reason}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View in Dashboard",
            },
            url: `https://yourdomain.com/tickets/${notification.ticketId}`,
          },
        ],
      },
    ],
  };
}

/**
 * Format for WhatsApp group webhook (e.g., via twilio or custom service)
 */
function formatWhatsAppPayload(notification: EscalationNotification): unknown {
  const message = `🚨 *NEW ESCALATION*
🏥 *Hospital:* ${notification.hospitalName}
📞 *Patient:* ${notification.phoneNumber}
🎫 *Ticket:* ${notification.ticketId}
⏰ *Time:* ${notification.timestamp}
📝 *Message:* Patient has requested to speak with front desk

Please respond ASAP!`;

  return {
    messaging_product: "whatsapp",
    to: "group_id", // This should come from config
    type: "text",
    text: {
      preview_url: false,
      body: message,
    },
  };
}

/**
 * Format for generic webhook
 */
function formatGenericPayload(notification: EscalationNotification): unknown {
  return {
    event: "escalation.created",
    data: {
      ticketId: notification.ticketId,
      phoneNumber: notification.phoneNumber,
      clientId: notification.clientId,
      hospitalName: notification.hospitalName,
      reason: notification.reason,
      timestamp: notification.timestamp,
      status: "open",
    },
  };
}

/**
 * Send batch escalation report (useful for admin dashboard)
 */
export async function sendEscalationReport(
  clientId: string,
  hospitalName: string,
  webhookUrl: string,
  escalationIds: string[]
): Promise<boolean> {
  try {
    const escalations = escalationIds
      .map((id) => getEscalation(id))
      .filter((e) => e !== null);

    const payload = {
      event: "escalation.report",
      hospital: hospitalName,
      clientId,
      totalTickets: escalations.length,
      openTickets: escalations.filter((e: any) => e.status === "open").length,
      tickets: escalations,
      generatedAt: new Date().toISOString(),
    };

    const response = await axios.post(webhookUrl, payload, {
      timeout: 5000,
    });

    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error("Failed to send escalation report:", error);
    return false;
  }
}

/**
 * Queue escalation for later delivery (in case webhook fails temporarily)
 * Can be persisted to database for robust delivery
 */
export interface EscalationQueue {
  ticketId: string;
  notification: EscalationNotification;
  retryCount: number;
  nextRetry: number;
}

const escalationQueue: Map<string, EscalationQueue> = new Map();

export function queueEscalation(
  ticketId: string,
  notification: EscalationNotification,
  retryCount: number = 0
): void {
  escalationQueue.set(ticketId, {
    ticketId,
    notification,
    retryCount,
    nextRetry: Date.now() + 60000, // Retry in 1 minute
  });
}

export function getQueuedEscalation(ticketId: string): EscalationQueue | null {
  return escalationQueue.get(ticketId) || null;
}

export function removeFromQueue(ticketId: string): void {
  escalationQueue.delete(ticketId);
}

export function getQueuedEscalations(): EscalationQueue[] {
  return Array.from(escalationQueue.values()).filter(
    (item) => item.nextRetry <= Date.now()
  );
}

/**
 * Process queued escalations (should be called periodically)
 */
export async function processQueuedEscalations(
  webhookUrl: string
): Promise<void> {
  const queued = getQueuedEscalations();

  for (const item of queued) {
    const success = await notifyEscalation(item.notification, webhookUrl);

    if (success) {
      removeFromQueue(item.ticketId);
      console.log(`✅ Queued escalation ${item.ticketId} delivered`);
    } else if (item.retryCount < 3) {
      // Retry up to 3 times
      item.retryCount++;
      item.nextRetry = Date.now() + 60000 * item.retryCount; // Exponential backoff
      console.log(
        `⏳ Escalation ${item.ticketId} queued for retry #${item.retryCount}`
      );
    } else {
      removeFromQueue(item.ticketId);
      console.error(`❌ Escalation ${item.ticketId} failed after 3 retries`);
    }
  }
}

/**
 * Start periodic escalation queue processor
 */
export function startEscalationProcessor(
  webhookUrl: string,
  intervalMs: number = 30000 // Every 30 seconds
): NodeJS.Timer {
  console.log("🔄 Starting escalation notification processor");

  return setInterval(() => {
    processQueuedEscalations(webhookUrl).catch((error) =>
      console.error("Escalation processor error:", error)
    );
  }, intervalMs);
}
