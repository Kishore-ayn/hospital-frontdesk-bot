import { ClientConfig } from "../config/configLoader";

export interface MenuOption {
  number: number;
  label: string;
  key: string;
  description?: string;
}

export interface MenuState {
  currentStep: string; // 'main_menu', 'waiting_for_ward', etc.
  selectedOption?: number;
  userData?: Record<string, unknown>;
}

const MAIN_MENU_OPTIONS: MenuOption[] = [
  {
    number: 1,
    key: "visiting_hours",
    label: "Visiting Hours",
    description: "Check ward-wise visiting hours",
  },
  {
    number: 2,
    key: "doctor_availability",
    label: "Doctor Availability",
    description: "Check doctor schedule and OPD timings",
  },
  {
    number: 3,
    key: "report_status",
    label: "My Report Status",
    description: "Track your lab/medical report",
  },
  {
    number: 4,
    key: "billing_info",
    label: "Bill / Payment Info",
    description: "Get billing and payment assistance",
  },
  {
    number: 5,
    key: "talk_to_frontdesk",
    label: "Talk to Front Desk",
    description: "Escalate to a human representative",
  },
];

/**
 * Generate main menu message
 */
export function generateMainMenu(config: ClientConfig): string {
  const menuText = MAIN_MENU_OPTIONS.map(
    (opt) => `${opt.number}. ${opt.label}`
  ).join("\n");

  return `🏥 Welcome to ${config.hospitalName}!\n\nHow can we assist you today?\n\n${menuText}\n\nPlease reply with the number of your choice (1-5).`;
}

/**
 * Handle visiting hours menu option
 */
export function handleVisitingHours(config: ClientConfig): string {
  const hours = config.visitingHours;
  let response = "📅 Visiting Hours:\n\n";

  for (const [ward, info] of Object.entries(hours)) {
    response += `${ward.toUpperCase()}\n`;
    response += `⏰ ${info.startTime} - ${info.endTime}\n`;
    response += `📆 ${info.daysOpen}\n`;
    if (info.specialNotes) {
      response += `ℹ️ ${info.specialNotes}\n`;
    }
    response += "\n";
  }

  response += "📌 Need more info? Reply 'menu' to return to main menu.";
  return response;
}

/**
 * Handle bill/payment info menu option
 */
export function handleBillingInfo(config: ClientConfig): string {
  return `💰 Bill & Payment Info\n\n${config.billingSupportMessage}\n\n📌 Need more help? Reply 'menu' to return to main menu or option 5 to talk to our team.`;
}

/**
 * Handle escalation (Talk to Front Desk)
 */
export function handleEscalation(config: ClientConfig, userPhone: string): {
  userMessage: string;
  escalationData: Record<string, unknown>;
} {
  return {
    userMessage: `Thank you for reaching out! Our front desk team will respond shortly. Please stand by.\n\nYour ticket ID: ${generateTicketId()}`,
    escalationData: {
      clientId: config.clientId,
      userPhone,
      timestamp: new Date().toISOString(),
      ticketId: generateTicketId(),
      type: "manual_escalation",
    },
  };
}

/**
 * Generate a unique ticket ID for escalations
 */
function generateTicketId(): string {
  return `TKT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

/**
 * Get menu option by number
 */
export function getMenuOptionByNumber(number: number): MenuOption | null {
  return MAIN_MENU_OPTIONS.find((opt) => opt.number === number) || null;
}

/**
 * Check if message is a valid menu choice
 */
export function isValidMenuChoice(text: string): boolean {
  const num = parseInt(text.trim(), 10);
  return num >= 1 && num <= MAIN_MENU_OPTIONS.length;
}

/**
 * Return to main menu
 */
export function returnToMainMenu(config: ClientConfig): string {
  return generateMainMenu(config);
}
