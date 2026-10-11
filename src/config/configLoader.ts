import fs from "fs";
import path from "path";

export interface ClientConfig {
  clientId: string;
  hospitalName: string;
  whatsappNumber: string;
  aisensy: {
    projectId: string;
    apiKey: string;
  };
  googleSheets: {
    spreadsheetId: string;
    doctorScheduleSheet: string;
    reportStatusSheet: string;
  };
  visitingHours: Record<
    string,
    {
      startTime: string;
      endTime: string;
      daysOpen: string;
      specialNotes?: string;
    }
  >;
  faqContent: string;
  billingSupportMessage: string;
  escalationChannel: {
    type: string;
    groupId: string;
    webhookUrl: string;
  };
}

const configCache: Map<string, ClientConfig> = new Map();

/**
 * Normalize WhatsApp number for comparison
 * Removes +, spaces, dashes, and other non-digit characters except leading +
 * Examples:
 *   "+91 98765 43210" -> "+919876543210"
 *   "919876543210" -> "+919876543210" (adds + if missing and starts with country code)
 *   "+919876543210" -> "+919876543210" (unchanged)
 */
function normalizeWhatsAppNumber(number: string): string {
  if (!number) return "";

  // Remove all non-digit characters
  const digitsOnly = number.replace(/\D/g, '');

  // If number starts with country code (assuming 1-3 digits) and no +, add +
  // This is a simple heuristic - in practice, WhatsApp numbers should have country code
  if (digitsOnly.length >= 10 && !number.startsWith('+')) {
    // Assuming country code is first 1-3 digits, rest is subscriber number
    // For India (+91), this would be: first 2 digits + remaining digits
    // But we'll just add + to the front for simplicity
    return '+' + digitsOnly;
  }

  // If already has +, return as-is (after cleaning)
  if (number.startsWith('+')) {
    return '+' + digitsOnly;
  }

  // Fallback: return digits only
  return digitsOnly;
}

/**
 * Load client config by client ID
 * Identifier can be: client ID, WhatsApp number, or AiSensy project ID
 */
export function loadClientConfig(identifier: string): ClientConfig {
  // Check cache first
  if (configCache.has(identifier)) {
    return configCache.get(identifier)!;
  }

  // Load all client configs from clients directory
  const clientsDir = path.join(process.cwd(), "clients");
  const files = fs.readdirSync(clientsDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const configPath = path.join(clientsDir, file);
    const content = fs.readFileSync(configPath, "utf-8");
    const config: ClientConfig = JSON.parse(content);

    // Cache by multiple identifiers (including normalized WhatsApp number)
    configCache.set(config.clientId, config);
    configCache.set(config.whatsappNumber, config);
    configCache.set(normalizeWhatsAppNumber(config.whatsappNumber), config);
    configCache.set(config.aisensy.projectId, config);

    // Return if this is the one we're looking for
    // Try exact match and normalized match for WhatsApp number
    if (
      config.clientId === identifier ||
      config.whatsappNumber === identifier ||
      normalizeWhatsAppNumber(config.whatsappNumber) === identifier ||
      config.aisensy.projectId === identifier
    ) {
      return config;
    }
  }

  throw new Error(`Client config not found for identifier: ${identifier}`);
}

/**
 * Get all client configs
 */
export function getAllClientConfigs(): ClientConfig[] {
  const clientsDir = path.join(process.cwd(), "clients");
  const files = fs.readdirSync(clientsDir).filter((f) => f.endsWith(".json"));

  return files.map((file) => {
    const configPath = path.join(clientsDir, file);
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content) as ClientConfig;
  });
}

/**
 * Validate client config structure
 */
export function validateConfig(config: unknown): config is ClientConfig {
  if (!config || typeof config !== "object") return false;
  const cfg = config as Record<string, unknown>;

  const requiredFields = [
    "clientId",
    "hospitalName",
    "whatsappNumber",
    "aisensy",
    "googleSheets",
    "visitingHours",
    "faqContent",
    "billingSupportMessage",
    "escalationChannel",
  ];

  return requiredFields.every((field) => field in cfg);
}
