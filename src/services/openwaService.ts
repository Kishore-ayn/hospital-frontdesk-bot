/**
 * OpenWA WhatsApp Service
 * Handles sending messages via OpenWA API
 */

import axios from "axios";

export interface OpenWaSendTextResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a text message via OpenWA API
 * @param sessionId - OpenWA session ID from inbound webhook
 * @param chatId - Recipient's WhatsApp JID (e.g., "81033349312515@lid" or "919XXXXXXXXX@c.us")
 * @param text - Message text to send
 * @returns Result object with success status and optionally messageId or error
 */
export async function sendOpenWaText(
  sessionId: string,
  chatId: string,
  text: string
): Promise<OpenWaSendTextResult> {
  try {
    const baseUrl = process.env.OPENWA_BASE_URL;
    const apiKey = process.env.OPENWA_API_KEY;

    if (!baseUrl) {
      console.error("[OPENWA OUTBOUND] Missing OPENWA_BASE_URL environment variable");
      return { success: false, error: "Missing OPENWA_BASE_URL" };
    }

    if (!apiKey) {
      console.error("[OPENWA OUTBOUND] Missing OPENWA_API_KEY environment variable");
      return { success: false, error: "Missing OPENWA_API_KEY" };
    }

    const url = `${baseUrl}/api/sessions/${sessionId}/messages/send-text`;

    console.log(`[OPENWA OUTBOUND] Sending message to ${chatId} via session ${sessionId}`);
    console.log(`[OPENWA OUTBOUND] URL: ${url}`);

    const response = await axios.post(
      url,
      {
        chatId,
        text,
      },
      {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      }
    );

    if (response.status >= 200 && response.status < 300) {
      const data = response.data as { messageId?: string };
      console.log(
        `[OPENWA OUTBOUND] ✅ Message sent successfully. MessageId: ${data.messageId}`
      );
      return { success: true, messageId: data.messageId };
    } else {
      console.error(
        `[OPENWA OUTBOUND] ❌ Failed to send message. Status: ${response.status}, Data:`,
        response.data
      );
      return {
        success: false,
        error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
      };
    }
  } catch (error) {
    const err = error as any;
    console.error("[OPENWA OUTBOUND] ❌ Error sending message:", err.message);

    // Extract useful error info
    let errorMessage = err.message;
    if (err.response) {
      errorMessage = `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`;
    }

    return { success: false, error: errorMessage };
  }
}