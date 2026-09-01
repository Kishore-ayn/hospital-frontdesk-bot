/**
 * Google Sheets Service
 * Handles doctor availability and report status lookups
 * Currently uses mock data; can be swapped for real Google Sheets API
 */

export interface Doctor {
  name: string;
  specialty: string;
  opdDays: string[]; // e.g., ["Monday", "Wednesday", "Friday"]
  opdTiming: string; // e.g., "10:00 AM - 1:00 PM"
  nextAvailable: string; // e.g., "Monday 10:00 AM"
}

export interface ReportStatus {
  patientId: string;
  reportType: string; // e.g., "Blood Test", "X-Ray", "ECG"
  status: "pending" | "ready" | "collected";
  collectionDate?: string;
  readyDate?: string;
  location?: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  doctorScheduleSheet: string;
  reportStatusSheet: string;
}

/**
 * Mock doctor data (would come from Google Sheets in production)
 */
const MOCK_DOCTORS: Record<string, Doctor> = {
  "dr-rajesh": {
    name: "Dr. Rajesh Kumar",
    specialty: "General Physician",
    opdDays: ["Monday", "Wednesday", "Friday"],
    opdTiming: "10:00 AM - 1:00 PM",
    nextAvailable: "Today 10:00 AM",
  },
  "dr-priya": {
    name: "Dr. Priya Sharma",
    specialty: "Pediatrician",
    opdDays: ["Monday", "Tuesday", "Thursday", "Friday"],
    opdTiming: "2:00 PM - 5:00 PM",
    nextAvailable: "Today 2:00 PM",
  },
  "dr-vikram": {
    name: "Dr. Vikram Singh",
    specialty: "Orthopedic Surgeon",
    opdDays: ["Tuesday", "Thursday", "Saturday"],
    opdTiming: "11:00 AM - 2:00 PM",
    nextAvailable: "Tomorrow 11:00 AM",
  },
  "dr-anita": {
    name: "Dr. Anita Gupta",
    specialty: "Cardiologist",
    opdDays: ["Monday", "Wednesday"],
    opdTiming: "9:00 AM - 12:00 PM",
    nextAvailable: "Monday 9:00 AM",
  },
};

/**
 * Mock report data (would come from Google Sheets in production)
 */
const MOCK_REPORTS: Record<string, ReportStatus[]> = {
  "PAT001": [
    {
      patientId: "PAT001",
      reportType: "Blood Test",
      status: "ready",
      collectionDate: "2026-08-30",
      readyDate: "2026-09-01",
      location: "Lab Counter, Ground Floor",
    },
    {
      patientId: "PAT001",
      reportType: "X-Ray Chest",
      status: "pending",
      collectionDate: "2026-08-31",
    },
  ],
  "PAT002": [
    {
      patientId: "PAT002",
      reportType: "ECG",
      status: "collected",
      collectionDate: "2026-09-01",
      location: "Cardiology Department",
    },
  ],
};

/**
 * Get doctor by name (case-insensitive partial match)
 */
export function searchDoctor(doctorName: string): Doctor | null {
  const searchTerm = doctorName.toLowerCase().trim();

  for (const [key, doctor] of Object.entries(MOCK_DOCTORS)) {
    if (
      doctor.name.toLowerCase().includes(searchTerm) ||
      key.includes(searchTerm.replace(/\s+/g, "-"))
    ) {
      return doctor;
    }
  }

  return null;
}

/**
 * Get all doctors
 */
export function getAllDoctors(): Doctor[] {
  return Object.values(MOCK_DOCTORS);
}

/**
 * Get reports for patient (by patient ID or phone number)
 */
export function getPatientReports(patientId: string): ReportStatus[] {
  // In production, this would query Google Sheets
  // For now, return mock data or empty array
  return MOCK_REPORTS[patientId] || [];
}

/**
 * Format doctor availability for WhatsApp message
 */
export function formatDoctorAvailability(doctor: Doctor): string {
  return `👨‍⚕️ ${doctor.name}
Specialty: ${doctor.specialty}

🏥 OPD Timing: ${doctor.opdTiming}
📅 Available: ${doctor.opdDays.join(", ")}

⏰ Next Available: ${doctor.nextAvailable}

📌 Reply 'menu' to return to main menu or option 5 to schedule an appointment.`;
}

/**
 * Format report status for WhatsApp message
 */
export function formatReportStatus(reports: ReportStatus[]): string {
  if (reports.length === 0) {
    return `❌ No reports found for this patient ID.

Please verify the patient ID or call our lab at the hospital reception.

📌 Reply 'menu' to return to main menu.`;
  }

  let message = "📋 Your Report Status:\n\n";

  reports.forEach((report, index) => {
    message += `Report ${index + 1}: ${report.reportType}\n`;
    message += `Status: ${getStatusEmoji(report.status)} ${report.status.toUpperCase()}\n`;

    if (report.readyDate) {
      message += `Ready Date: ${report.readyDate}\n`;
    }
    if (report.location) {
      message += `Location: ${report.location}\n`;
    }

    message += "\n";
  });

  message += "📌 Reply 'menu' to return to main menu.";
  return message;
}

function getStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    ready: "✅",
    pending: "⏳",
    collected: "📦",
  };
  return emojis[status] || "❓";
}

/**
 * Initialize Google Sheets connection
 * In production, this would authenticate with Google Sheets API
 */
export async function initializeGoogleSheets(
  config: GoogleSheetsConfig
): Promise<void> {
  // TODO: Implement real Google Sheets API connection
  // For now, just validate config structure
  if (!config.spreadsheetId || !config.doctorScheduleSheet) {
    throw new Error("Invalid Google Sheets configuration");
  }

  console.log(
    "✅ Google Sheets service initialized (using mock data for now)"
  );
  console.log(`   Spreadsheet ID: ${config.spreadsheetId}`);
  console.log(`   Doctor Sheet: ${config.doctorScheduleSheet}`);
  console.log(`   Reports Sheet: ${config.reportStatusSheet}`);
}
