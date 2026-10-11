import { GoogleSpreadsheet } from 'google-spreadsheet';
import { promises as fs } from 'fs';
import path from 'path';
import { JWT } from 'google-auth-library';

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

export interface HospitalService {
  name: string;
  description?: string;
}

export interface VisitingHour {
  startTime: string;
  endTime: string;
  daysOpen: string;
  specialNotes?: string;
}

export interface Department {
  name: string;
  description?: string;
}

export interface InsuranceCompany {
  name: string;
  description?: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  doctorScheduleSheet: string;
  reportStatusSheet: string;
  hospitalServiceSheet: string;
  visitingHoursSheet: string;
  departmentsSheet: string;
  insuranceCompaniesSheet: string;
}

/**
 * Load service account credentials from JSON file
 */
async function loadCredentials(): Promise<any> {
  const keyFilePath = path.resolve(process.env.GOOGLE_SHEETS_KEY_FILE || './credentials/google-service-account.json');
  try {
    const data = await fs.readFile(keyFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to load Google Sheets credentials from ${keyFilePath}: ${err.message}`);
    } else {
      throw new Error(`Failed to load Google Sheets credentials from ${keyFilePath}: ${String(err)}`);
    }
  }
}

/**
 * Initialize Google Sheets connection
 * Authenticates with Google Sheets API using service account
 */
export async function initializeGoogleSheets(
  config: GoogleSheetsConfig
): Promise<void> {
  try {
    const credentials = await loadCredentials();

    // Create JWT auth client from service account credentials
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Initialize Google Spreadsheet with auth client
    const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);

    // Load sheet properties to verify access
    await doc.loadInfo();

    console.log(
      `✅ Google Sheets service initialized successfully\n` +
      `   Spreadsheet ID: ${config.spreadsheetId}\n` +
      `   Title: ${doc.title}\n` +
      `   Doctor Sheet: ${config.doctorScheduleSheet}\n` +
      `   Reports Sheet: ${config.reportStatusSheet}`
    );
  } catch (err) {
    if (err instanceof Error) {
      console.error('❌ Failed to initialize Google Sheets service:', err);
    } else {
      console.error('❌ Failed to initialize Google Sheets service:', String(err));
    }
    throw err;
  }
}

/**
 * Get doctor by name (case-insensitive partial match) from Google Sheets
 */
export async function searchDoctor(doctorName: string, config: GoogleSheetsConfig): Promise<Doctor | null> {
  try {
    const credentials = await loadCredentials();

    // Create JWT auth client from service account credentials
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex.find(s => s.title === (config.doctorScheduleSheet || 'Doctor Schedule'));
    if (!sheet) throw new Error('Doctor schedule sheet not found');

    // Load header row to get column names
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();
/*
    const searchTerm = doctorName.toLowerCase().trim();
    for (const row of rows) {
      // Access cell values using the get method
      const name = (row.get('name') ?? '').toLowerCase();
      const id = (row.get('doctor_id') ?? '').toLowerCase();
      if (name.includes(searchTerm) || id.includes(searchTerm.replace(/\s+/g, '-'))) {
        return {
          name: row.get('name') ?? '',
          specialty: row.get('specialty') ?? '',
          opdDays: ((row.get('opd_days') ?? '').split(',').map((d: string) => d.trim()).filter(Boolean)),
          opdTiming: row.get('opd_timing') ?? '',
          nextAvailable: row.get('next_available') ?? ''
        };
      }
    }
*/
      const searchTerm = doctorName.toLowerCase().trim();

      console.log("\n🔍 DOCTOR SEARCH DEBUG");
      console.log("Search input:", JSON.stringify(doctorName));
      console.log("Normalized search:", JSON.stringify(searchTerm));
      console.log("Rows found:", rows.length);

      for (const row of rows) {
        const name = String(row.get("name") ?? "").trim();
        const id = String(row.get("doctor_id") ?? "").trim();

        console.log("Checking doctor:");
        console.log("  name:", JSON.stringify(name));
        console.log("  id:", JSON.stringify(id));
        console.log(
          "  name match:",
          name.toLowerCase().includes(searchTerm)
        );
        console.log(
          "  id match:",
          id.toLowerCase().includes(searchTerm.replace(/\s+/g, "-"))
        );

        if (
          name.toLowerCase().includes(searchTerm) ||
          id.toLowerCase().includes(searchTerm.replace(/\s+/g, "-"))
        ) {
          console.log("✅ DOCTOR MATCH FOUND:", name);

          return {
            name,
            specialty: String(row.get("specialty") ?? ""),
            opdDays: String(row.get("opd_days") ?? "")
              .split(",")
              .map((d: string) => d.trim())
              .filter(Boolean),
            opdTiming: String(row.get("opd_timing") ?? ""),
            nextAvailable: String(row.get("next_available") ?? ""),
          };
        }
      }

      console.log("❌ NO DOCTOR MATCH FOUND");
        
    return null;
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error searching doctor:', err);
    } else {
      console.error('Error searching doctor:', String(err));
    }
    return null;
  }
}

/**
 * Get all doctors from Google Sheets
 */
export async function getAllDoctors(config: GoogleSheetsConfig): Promise<Doctor[]> {
  try {
    const credentials = await loadCredentials();

    // Create JWT auth client from service account credentials
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex.find(s => s.title === (config.doctorScheduleSheet || 'Doctor Schedule'));
    if (!sheet) throw new Error('Doctor schedule sheet not found');

    // Load header row to get column names
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    return rows.map(row => ({
      name: row.get('name') ?? '',
      specialty: row.get('specialty') ?? '',
      opdDays: ((row.get('opd_days') ?? '').split(',').map((d: string) => d.trim()).filter(Boolean)),
      opdTiming: row.get('opd_timing') ?? '',
      nextAvailable: row.get('next_available') ?? ''
    }));
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error getting all doctors:', err);
    } else {
      console.error('Error getting all doctors:', String(err));
    }
    return [];
  }
}

/**
 * Get reports for patient (by patient ID) from Google Sheets
 */
export async function getPatientReports(patientId: string, config: GoogleSheetsConfig): Promise<ReportStatus[]> {
  try {
    const credentials = await loadCredentials();

    // Create JWT auth client from service account credentials
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex.find(s => s.title === (config.reportStatusSheet || 'Report Status'));
    if (!sheet) throw new Error('Report status sheet not found');

    // Load header row to get column names
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    return rows
      .filter(row => (row.get('patient_id') ?? '').toLowerCase() === patientId.toLowerCase())
      .map(row => ({
        patientId: row.get('patient_id') ?? '',
        reportType: row.get('report_type') ?? '',
        status: (row.get('status') ?? 'pending') as 'pending' | 'ready' | 'collected',
        collectionDate: row.get('collection_date') ?? undefined,
        readyDate: row.get('ready_date') ?? undefined,
        location: row.get('location') ?? undefined
      }));
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error getting patient reports:', err);
    } else {
      console.error('Error getting patient reports:', String(err));
    }
    return [];
  }
}

/**
 * Format doctor availability for WhatsApp message (unchanged from mock version)
 */
export function formatDoctorAvailability(doctor: Doctor): string {
  return `👨‍⚕️ ${doctor.name}
Specialty: ${doctor.specialty}

🏥 OPD Timing: ${doctor.opdTiming}
📅 Available: ${doctor.opdDays.join(", ")}

⏰ Next Available: ${doctor.nextAvailable}

📌 Reply 'menu' or '9' to return to main menu or option 5 to schedule an appointment.`;
}

/**
 * Format report status for WhatsApp message (unchanged from mock version)
 */
export function formatReportStatus(reports: ReportStatus[]): string {
  if (reports.length === 0) {
    return `❌ No reports found for this patient ID.

Please verify the patient ID or call our lab at the hospital reception.

📌 Reply 'menu' or '9' to return to main menu.`;
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

  message += "📌 Reply 'menu' or '9' to return to main menu.";
  return message;
}

/**
 * Get all hospital services from Google Sheets
 */
export async function getHospitalServices(config: GoogleSheetsConfig): Promise<HospitalService[]> {
  try {
    const credentials = await loadCredentials();

    // Create JWT auth client from service account credentials
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex.find(s => s.title === (config.hospitalServiceSheet || 'Hospital Services'));
    if (!sheet) throw new Error('Hospital services sheet not found');

    // Load header row to get column names
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    return rows.map(row => ({
      name: row.get('name') ?? '',
      description: row.get('description') ?? undefined,
    }));
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error getting hospital services:', err);
    } else {
      console.error('Error getting hospital services:', String(err));
    }
    return [];
  }
}

/**
 * Get visiting hours from Google Sheets
 */
export async function getVisitingHours(config: GoogleSheetsConfig): Promise<Record<string, VisitingHour>> {
  try {
    const credentials = await loadCredentials();

    // Create JWT auth client from service account credentials
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex.find(s => s.title === (config.visitingHoursSheet || 'Visiting Hours'));
    if (!sheet) throw new Error('Visiting hours sheet not found');

    // Load header row to get column names
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    // Convert rows to visiting hours object
    const visitingHours: Record<string, VisitingHour> = {};
    for (const row of rows) {
      const wardName = row.get('ward') ?? '';
      if (wardName) {
        visitingHours[wardName] = {
          startTime: row.get('startTime') ?? '',
          endTime: row.get('endTime') ?? '',
          daysOpen: row.get('daysOpen') ?? '',
          specialNotes: row.get('specialNotes') ?? undefined
        };
      }
    }

    return visitingHours;
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error getting visiting hours:', err);
    } else {
      console.error('Error getting visiting hours:', String(err));
    }
    return {};
  }
}

/**
 * Get all departments from Google Sheets
 */
export async function getDepartments(config: GoogleSheetsConfig): Promise<Department[]> {
  try {
    const credentials = await loadCredentials();

    // Create JWT auth client from service account credentials
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex.find(s => s.title === (config.departmentsSheet || 'Departments'));
    if (!sheet) throw new Error('Departments sheet not found');

    // Load header row to get column names
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    return rows.map(row => ({
      name: row.get('name') ?? '',
      description: row.get('description') ?? undefined,
    }));
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error getting departments:', err);
    } else {
      console.error('Error getting departments:', String(err));
    }
    return [];
  }
}

/**
 * Get all insurance companies from Google Sheets
 */
export async function getInsuranceCompanies(config: GoogleSheetsConfig): Promise<InsuranceCompany[]> {
  try {
    const credentials = await loadCredentials();

    // Create JWT auth client from service account credentials
    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.spreadsheetId, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex.find(s => s.title === (config.insuranceCompaniesSheet || 'Insurance Companies'));
    if (!sheet) throw new Error('Insurance companies sheet not found');

    // Load header row to get column names
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    return rows.map(row => ({
      name: row.get('name') ?? '',
      description: row.get('description') ?? undefined,
    }));
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error getting insurance companies:', err);
    } else {
      console.error('Error getting insurance companies:', String(err));
    }
    return [];
  }
}

function getStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    ready: "✅",
    pending: "⏳",
    collected: "📦",
  };
  return emojis[status] || "❓";
}