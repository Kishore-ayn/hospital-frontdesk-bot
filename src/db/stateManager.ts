import Database from "better-sqlite3";
import path from "path";

let db: Database.Database;

export interface ConversationState {
  phoneNumber: string;
  clientId: string;
  currentStep: string;
  userData: Record<string, unknown>;
  lastUpdated: number;
}

/**
 * Initialize SQLite database
 */
export function initializeDatabase(dbPath?: string): Database.Database {
  const finalDbPath = dbPath || path.join(process.cwd(), "db", "conversations.db");

  // Ensure db directory exists
  const dbDir = path.dirname(finalDbPath);
  if (!require("fs").existsSync(dbDir)) {
    require("fs").mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(finalDbPath);

  // Create tables if they don't exist
  db.exec(`
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

  return db;
}

/**
 * Get or create conversation state
 */
export function getConversationState(
  phoneNumber: string,
  clientId: string
): ConversationState {
  const stmt = db.prepare(
    "SELECT * FROM conversation_states WHERE phoneNumber = ? AND clientId = ?"
  );
  const row = stmt.get(phoneNumber, clientId) as any;

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
}

/**
 * Save conversation state
 */
export function saveConversationState(state: ConversationState): void {
  const stmt = db.prepare(`
    INSERT INTO conversation_states (phoneNumber, clientId, currentStep, userData, lastUpdated, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(phoneNumber) DO UPDATE SET
      currentStep = ?,
      userData = ?,
      lastUpdated = ?
  `);

  const now = Date.now();
  const userDataJson = JSON.stringify(state.userData);

  stmt.run(
    state.phoneNumber,
    state.clientId,
    state.currentStep,
    userDataJson,
    now,
    now,
    state.currentStep,
    userDataJson,
    now
  );
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
  const stmt = db.prepare(`
    INSERT INTO escalations (ticketId, phoneNumber, clientId, type, status, data, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  stmt.run(ticketId, phoneNumber, clientId, type, "open", JSON.stringify(data), now, now);
}

/**
 * Get escalation by ticket ID
 */
export function getEscalation(ticketId: string) {
  const stmt = db.prepare("SELECT * FROM escalations WHERE ticketId = ?");
  const row = stmt.get(ticketId) as any;

  if (row) {
    return {
      ...row,
      data: JSON.parse(row.data),
    };
  }

  return null;
}

/**
 * Update escalation status
 */
export function updateEscalationStatus(ticketId: string, status: string): void {
  const stmt = db.prepare(
    "UPDATE escalations SET status = ?, updatedAt = ? WHERE ticketId = ?"
  );
  stmt.run(status, Date.now(), ticketId);
}

/**
 * Get database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}
