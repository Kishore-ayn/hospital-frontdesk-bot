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

    // Cache by multiple identifiers
    configCache.set(config.clientId, config);
    configCache.set(config.whatsappNumber, config);
    configCache.set(config.aisensy.projectId, config);

    // Return if this is the one we're looking for
    if (
      config.clientId === identifier ||
      config.whatsappNumber === identifier ||
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
