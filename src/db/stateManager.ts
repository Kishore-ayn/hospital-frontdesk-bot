import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";

let db: SqlJsDatabase | null = null;
let dbPath: string = "";
let SQL: any = null;

export interface ConversationState {
  phoneNumber: string;
  clientId: string;
  currentStep: string;
  userData: Record<string, unknown>;
  lastUpdated: number;
}

/**
 * Initialize SQLite database (sql.js)
 * sql.js runs in-memory but can persist to disk
 */
export async function initializeDatabase(dbPathOverride?: string): Promise<void> {
  try {
    // Initialize sql.js
    if (!SQL) {
      SQL = await initSqlJs();
    }

    dbPath = dbPathOverride || path.join(process.cwd(), "db", "conversations.db");

    // Ensure db directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Load existing database or create new one
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
      console.log("✅ Loaded existing database from", dbPath);
    } else {
      db = new SQL.Database();
      console.log("✅ Created new database at", dbPath);
    }

    // Create tables if they don't exist
    if (!db) {
      throw new Error("Failed to initialize database instance");
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS conversation_states (
        phoneNumber TEXT PRIMARY KEY,
        clientId TEXT NOT NULL,
        currentStep TEXT NOT NULL DEFAULT 'main_menu',
        userData TEXT NOT NULL DEFAULT '{}',
        lastUpdated INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escalations (
        ticketId TEXT PRIMARY KEY,
        phoneNumber TEXT NOT NULL,
        clientId TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        data TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_escalations_client ON escalations(clientId);
      CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations(status);
      CREATE INDEX IF NOT EXISTS idx_conversation_client ON conversation_states(clientId);
    `);

    // Persist to disk
    await persistDatabase();
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}

/**
 * Persist database to disk
 */
async function persistDatabase(): Promise<void> {
  if (!db || !dbPath) return;

  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    console.error("Failed to persist database:", error);
  }
}

/**
 * Get or create conversation state
 */
export function getConversationState(
  phoneNumber: string,
  clientId: string
): ConversationState {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }

  try {
    const stmt = db.prepare(
      "SELECT * FROM conversation_states WHERE phoneNumber = ?"
    );
    stmt.bind([phoneNumber]);

    let row: any = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();

    if (row) {
      return {
        phoneNumber: row.phoneNumber,
        clientId: row.clientId,
        currentStep: row.currentStep,
        userData: JSON.parse(row.userData),
        lastUpdated: row.lastUpdated,
      };
    }

    // Create new state
    const newState: ConversationState = {
      phoneNumber,
      clientId,
      currentStep: "main_menu",
      userData: {},
      lastUpdated: Date.now(),
    };

    saveConversationState(newState);
    return newState;
  } catch (error) {
    console.error("Error getting conversation state:", error);
    throw error;
  }
}

/**
 * Save conversation state
 */
export function saveConversationState(state: ConversationState): void {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }

  try {
    const now = Date.now();
    const userDataJson = JSON.stringify(state.userData);

    // Check if exists
    const checkStmt = db.prepare(
      "SELECT phoneNumber FROM conversation_states WHERE phoneNumber = ?"
    );
    checkStmt.bind([state.phoneNumber]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (exists) {
      // Update
      const updateStmt = db.prepare(`
        UPDATE conversation_states
        SET clientId = ?, currentStep = ?, userData = ?, lastUpdated = ?
        WHERE phoneNumber = ?
      `);
      updateStmt.bind([
        state.clientId,
        state.currentStep,
        userDataJson,
        now,
        state.phoneNumber,
      ]);
      updateStmt.step();
      updateStmt.free();
    } else {
      // Insert
      const insertStmt = db.prepare(`
        INSERT INTO conversation_states (phoneNumber, clientId, currentStep, userData, lastUpdated, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertStmt.bind([
        state.phoneNumber,
        state.clientId,
        state.currentStep,
        userDataJson,
        now,
        now,
      ]);
      insertStmt.step();
      insertStmt.free();
    }

    // Persist to disk
    persistDatabase().catch((err) =>
      console.error("Failed to persist after save:", err)
    );
  } catch (error) {
    console.error("Error saving conversation state:", error);
    throw error;
  }
}

/**
 * Create escalation record
 */
export function createEscalation(
  ticketId: string,
  phoneNumber: string,
  clientId: string,
  type: string,
  data: Record<string, unknown>
): void {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }

  try {
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO escalations (ticketId, phoneNumber, clientId, type, status, data, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([ticketId, phoneNumber, clientId, type, "open", JSON.stringify(data), now, now]);
    stmt.step();
    stmt.free();

    // Persist to disk
    persistDatabase().catch((err) =>
      console.error("Failed to persist after create escalation:", err)
    );
  } catch (error) {
    console.error("Error creating escalation:", error);
    throw error;
  }
}

/**
 * Get escalation by ticket ID
 */
export function getEscalation(ticketId: string) {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }

  try {
    const stmt = db.prepare("SELECT * FROM escalations WHERE ticketId = ?");
    stmt.bind([ticketId]);

    let row: any = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();

    if (row) {
      return {
        ...row,
        data: JSON.parse(row.data),
      };
    }

    return null;
  } catch (error) {
    console.error("Error getting escalation:", error);
    throw error;
  }
}

/**
 * Update escalation status
 */
export function updateEscalationStatus(ticketId: string, status: string): void {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }

  try {
    const stmt = db.prepare(
      "UPDATE escalations SET status = ?, updatedAt = ? WHERE ticketId = ?"
    );
    stmt.bind([status, Date.now(), ticketId]);
    stmt.step();
    stmt.free();

    // Persist to disk
    persistDatabase().catch((err) =>
      console.error("Failed to persist after status update:", err)
    );
  } catch (error) {
    console.error("Error updating escalation status:", error);
    throw error;
  }
}

/**
 * Get database instance
 */
export function getDatabase(): SqlJsDatabase | null {
  return db;
}

/**
 * Close database connection and persist
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await persistDatabase();
    db.close();
    db = null;
  }
}
