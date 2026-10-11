import { ClientConfig } from "../config/configLoader";
import {
  searchDoctor,
  getPatientReports,
  formatDoctorAvailability,
  formatReportStatus,
} from "../services/googleSheetsService";
import {
  processUserQuestion,
  formatClaudeResponse,
} from "../services/claudeService";

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
  {
    number: 6,
    key: "total_departments",
    label: "Total Available Departments",
    description: "Get count of all available departments/wards",
  },
  {
    number: 7,
    key: "return_to_menu",
    label: "Return to Main Menu",
    description: "Go back to the main menu options",
  },
];

/**
 * Generate main menu message
 */
export function generateMainMenu(config: ClientConfig): string {
  const menuText = MAIN_MENU_OPTIONS.map(
    (opt) => `${opt.number}. ${opt.label}`
  ).join("\n");

  return `🏥 Welcome to ${config.hospitalName}!\n\nHow can we assist you today?\n\n${menuText}\n\nPlease reply with the number of your choice (1-${MAIN_MENU_OPTIONS.length}).`;
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

  response += "📌 Need more info? Reply 'menu' or '7' to return to main menu.";
  return response;
}

/**
 * Handle bill/payment info menu option
 */
export function handleBillingInfo(config: ClientConfig): string {
  return `💰 Bill & Payment Info\n\n${config.billingSupportMessage}\n\n📌 Need more help? Reply 'menu' or '7' to return to main menu or option 5 to talk to our team.`;
}

/**
 * Handle escalation (Talk to Front Desk)
 */
export function handleEscalation(config: ClientConfig, userPhone: string): {
  userMessage: string;
  escalationData: Record<string, unknown>;
} {
  return {
    userMessage: `Thank you for reaching out! Our front desk team will respond shortly. Please stand by.\n\nYour ticket ID: ${generateTicketId()}\n\n📌 Reply 'menu' or '7' to return to main menu.`,
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
 * Handle doctor availability lookup
 */
export async function handleDoctorAvailability(
  doctorName: string,
  config: ClientConfig
): Promise<string> {
  const doctor = await searchDoctor(doctorName, config.googleSheets);

  if (!doctor) {
    return `❌ Doctor "${doctorName}" not found in our system.

Please provide the correct doctor name or check:
1. Visit our hospital website for the full doctor list
2. Call our reception desk
3. Or try option 5 to speak with front desk

📌 Reply 'menu' or '7' to return to main menu.`;
  }

  return formatDoctorAvailability(doctor);
}

/**
 * Handle report status lookup
 */
export async function handleReportStatus(
  patientId: string,
  config: ClientConfig
): Promise<string> {
  const reports = await getPatientReports(patientId, config.googleSheets);
  return formatReportStatus(reports);
}

/**
 * Handle free-text questions (phase 2 feature)
 */
export async function handleFreeTextQuestion(
  userMessage: string,
  config: ClientConfig
): Promise<{
  message: string;
  shouldEscalate: boolean;
}> {
  // Use Claude API to answer from FAQ
  const response = await processUserQuestion(
    userMessage,
    config.faqContent
  );

  return {
    message: formatClaudeResponse(response.message, response.shouldEscalate),
    shouldEscalate: response.shouldEscalate,
  };
}

/**
 * Handle total departments menu option
 */
export function handleTotalDepartments(config: ClientConfig): string {
  const wards = Object.keys(config.visitingHours);
  return `🏥 Total Available Departments: ${wards.length}\n\nDepartments: ${wards.map(w => w.toUpperCase()).join(', ')}\n\n📌 Reply 'menu' or '7' to return to main menu.`;
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
