
import dotenv from "dotenv";
dotenv.config();
import express, { Express, Request, Response } from "express";
import { initializeDatabase } from "./db/stateManager";
import { handleIncomingMessage } from "./webhooks/messageHandler";
import { initializeGoogleSheets } from "./services/googleSheetsService";
import { startEscalationProcessor } from "./services/escalationService";

// Load environment variables


const app: Express = express();
const port = process.env.PORT || 5000;
const dbPath = process.env.DB_PATH;

// Middleware
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.2.0",
  });
});

// Webhook endpoint for incoming AiSensy messages
app.post("/webhook/whatsapp", handleIncomingMessage);

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Hospital WhatsApp Bot",
    version: "0.2.0",
    status: "running",
    phase: "Phase 2 - Google Sheets + Claude + Escalation Notifications",
    endpoints: {
      health: "GET /health",
      webhook: "POST /webhook/whatsapp",
      config: "GET /api/config/:clientId (future)",
      admin: "GET /admin (future)",
    },
  });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    console.log("Initializing database...");
    await initializeDatabase(dbPath);
    console.log("✅ Database initialized");

    // Validate and load client configs
    console.log("Loading client configurations...");
    const { getAllClientConfigs } = require("./config/configLoader");
    const configs = getAllClientConfigs();
    console.log(`✅ Loaded ${configs.length} client config(s)`);

    configs.forEach((config: any) => {
      console.log(`   - ${config.clientId}: ${config.hospitalName}`);

      // Initialize Google Sheets for this client
      try {
        initializeGoogleSheets(config.googleSheets);
      } catch (error) {
        console.warn(
          `⚠️  Failed to initialize Google Sheets for ${config.clientId}:`,
          error
        );
      }
    });

    // Start escalation notification processor
    if (configs.length > 0 && configs[0].escalationChannel) {
      const webhookUrl = configs[0].escalationChannel.webhookUrl;
      if (webhookUrl) {
        console.log("Starting escalation notification processor...");
        startEscalationProcessor(webhookUrl);
        console.log("✅ Escalation processor started");
      }
    }

    // Start Express server
    app.listen(port, () => {
      console.log(`\n🚀 Server is running on port ${port}`);
      console.log(`📨 Webhook endpoint: POST http://localhost:${port}/webhook/whatsapp`);
      console.log(`💚 Health check: GET http://localhost:${port}/health`);
      console.log(`\n📚 Phase 2 Features:`);
      console.log(`   ✅ Google Sheets integration (doctor availability, report status)`);
      console.log(`   ✅ Claude API fallback for free-text questions`);
      console.log(`   ✅ Escalation notifications via webhook`);
      console.log(
        `\n📝 API Documentation:\n   - All hospital-specific data is loaded from /clients/*.json`
      );
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n🛑 Shutting down...");
      const { closeDatabase } = require("./db/stateManager");
      await closeDatabase();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
