import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { initializeDatabase } from "./db/stateManager";
import { handleIncomingMessage } from "./webhooks/messageHandler";

// Load environment variables
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5000;
const dbPath = process.env.DB_PATH;

// Middleware
app.use(express.json());

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  });
});

// Webhook endpoint for incoming AiSensy messages
app.post("/webhook/whatsapp", handleIncomingMessage);

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({
    name: "Hospital WhatsApp Bot",
    version: "0.1.0",
    status: "running",
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

    // Validate client configs
    console.log("Loading client configurations...");
    const { getAllClientConfigs } = require("./config/configLoader");
    const configs = getAllClientConfigs();
    console.log(`✅ Loaded ${configs.length} client config(s)`);

    configs.forEach((config: any) => {
      console.log(`   - ${config.clientId}: ${config.hospitalName}`);
    });

    // Start Express server
    app.listen(port, () => {
      console.log(`\n🚀 Server is running on port ${port}`);
      console.log(
        `📨 Webhook endpoint: POST http://localhost:${port}/webhook/whatsapp`
      );
      console.log(`💚 Health check: GET http://localhost:${port}/health`);
      console.log(
        `\n📚 API Documentation:\n   - All hospital-specific data is loaded from /clients/*.json`
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
