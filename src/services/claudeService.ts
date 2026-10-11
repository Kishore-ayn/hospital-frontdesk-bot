/**
 * Claude API Service
 * Handles LLM-powered responses for free-text questions
 * Constrained to only answer from FAQ content with strict grounding
 */

import axios from "axios";

export interface ClaudeResponse {
  content: string;
  confident: boolean; // Whether Claude is confident in the answer
  escalate: boolean; // Whether to escalate to human instead
}

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "mock-key-placeholder";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-3-haiku-20240307"; // Smaller, faster model

/**
 * System prompt that constrains Claude to only answer from FAQ
 */
function buildSystemPrompt(faqContent: string): string {
  return `You are a helpful hospital front-desk assistant. Your role is to answer patient questions ONLY using the provided FAQ document below. 

IMPORTANT RULES:
1. Only answer questions that can be answered from the FAQ content provided
2. If the question is not covered in the FAQ, clearly say "I don't have that information" and suggest they contact the front desk
3. Never make up medical information or provide medical advice
4. Always be respectful and professional
5. Keep answers concise and WhatsApp-friendly (short messages)

If you cannot confidently answer from the FAQ, respond with: "I'm not sure about that. Please speak with our front desk team for assistance."

---
FAQ CONTENT:
${faqContent}
---

Now answer the patient's question based ONLY on the above FAQ. If not in FAQ, say so clearly.`;
}

/**
 * Send message to Claude API and get response
 * Mock implementation for now; real API call when credentials are ready
 */
export async function askClaude(
  userQuestion: string,
  faqContent: string
): Promise<ClaudeResponse> {
  // Mock implementation - return mock response
  if (CLAUDE_API_KEY === "mock-key-placeholder") {
    return handleMockClaude(userQuestion, faqContent);
  }

  try {
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: CLAUDE_MODEL,
        max_tokens: 500,
        system: buildSystemPrompt(faqContent),
        messages: [
          {
            role: "user",
            content: userQuestion,
          },
        ],
      },
      {
        headers: {
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
        },
      }
    );

    const content =
      response.data.content[0]?.text ||
      "Unable to process your question at this time.";
    const escalate =
      content.toLowerCase().includes("front desk") ||
      content.toLowerCase().includes("not sure");

    return {
      content: content.trim(),
      confident: !escalate,
      escalate: escalate,
    };
  } catch (error) {
    console.error("Claude API error:", error);
    return {
      content:
        "I'm temporarily unable to process your question. Please try again or contact the front desk.",
      confident: false,
      escalate: true,
    };
  }
}

/**
 * Mock Claude implementation for development
 * Returns sensible responses based on common patterns
 */
function handleMockClaude(
  userQuestion: string,
  faqContent: string
): ClaudeResponse {
  const question = userQuestion.toLowerCase().trim();

  // Handle greetings and simple interactions
  const greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "namaste"];
  if (greetings.some(greeting => question === greeting || question.startsWith(greeting + " "))) {
    return {
      content: "Hello! How can I assist you today?",
      confident: true,
      escalate: false,
    };
  }

  // Handle thanks and similar
  const thanks = ["thank", "thanks", "thank you"];
  if (thanks.some(thank => question === thank || question.startsWith(thank + " "))) {
    return {
      content: "You're welcome!",
      confident: true,
      escalate: false,
    };
  }

  // Handle bye/goodbye
  const goodbyes = ["bye", "goodbye", "see you"];
  if (goodbyes.some(gb => question === gb || question.startsWith(gb + " "))) {
    return {
      content: "Goodbye! Have a great day.",
      confident: true,
      escalate: false,
    };
  }

  // Check if question is about something in FAQ
  const faqLower = faqContent.toLowerCase();

  // Keywords that indicate escalation should happen
  const escalationKeywords = [
    "medical advice",
    "diagnosis",
    "prescription",
    "emergency",
    "severe",
    "pain",
    "blood",
  ];

  if (escalationKeywords.some((kw) => question.includes(kw))) {
    return {
      content:
        "I'm not able to help with medical concerns. Please speak with our medical staff immediately or call our emergency line. Would you like me to connect you with the front desk?",
      confident: false,
      escalate: true,
    };
  }

  // Questions about visiting hours
  if (
    question.includes("visiting") ||
    question.includes("hours") ||
    question.includes("timing")
  ) {
    if (faqLower.includes("visiting")) {
      return {
        content:
          "Visiting hours vary by ward. General ward is 9 AM - 5 PM on weekdays. For specific timings, please select 'Visiting Hours' from the menu or ask the front desk.",
        confident: true,
        escalate: false,
      };
    }
  }

  // Questions about parking
  if (question.includes("parking")) {
    if (faqLower.includes("parking")) {
      return {
        content:
          "Yes, we have complimentary parking available for patients and visitors. Please ask the staff at the entrance for parking directions.",
        confident: true,
        escalate: false,
      };
    }
  }

  // Questions about documents/admission
  if (question.includes("document") || question.includes("admission")) {
    if (faqLower.includes("document") || faqLower.includes("admission")) {
      return {
        content:
          "Please bring ID proof, insurance card (if applicable), and any previous medical records for admission.",
        confident: true,
        escalate: false,
      };
    }
  }

  // Default: escalate to front desk
  return {
    content:
      "I don't have information about that. Could you please speak with our front desk team? They'll be happy to assist you.",
    confident: false,
    escalate: true,
  };
}

/**
 * Process free-text question and decide whether to respond or escalate
 */
export async function processUserQuestion(
  userQuestion: string,
  faqContent: string
): Promise<{
  message: string;
  shouldEscalate: boolean;
}> {
  try {
    const claudeResponse = await askClaude(userQuestion, faqContent);

    if (claudeResponse.escalate) {
      return {
        message: claudeResponse.content,
        shouldEscalate: true,
      };
    }

    return {
      message: claudeResponse.content,
      shouldEscalate: false,
    };
  } catch (error) {
    console.error("Error processing question:", error);
    return {
      message:
        "I'm unable to process your question right now. Please try again or contact the front desk.",
      shouldEscalate: true,
    };
  }
}

/**
 * Format Claude response for WhatsApp
 */
export function formatClaudeResponse(
  message: string,
  shouldEscalate: boolean
): string {
  let formatted = `💭 ${message}`;

  if (shouldEscalate) {
    formatted += "\n\n📞 Options: Reply '5' to talk to front desk or '8' to return to main menu";
  } else {
    formatted += "\n\n📌 Reply 'menu' or '8' to return to main menu.";
  }

  return formatted;
}
