import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import { createChildLogger } from "../common";

const logger = createChildLogger("Database");

const DATA_DIR = path.join(os.homedir(), ".medtech-qms");
const DEFAULT_DB_PATH = path.join(DATA_DIR, "qms.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

let db: Database.Database | null = null;

function resolveDbPath(): string {
  if (process.env.QMS_DB_PATH) {
    return process.env.QMS_DB_PATH;
  }
  return DEFAULT_DB_PATH;
}

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = resolveDbPath();
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      final_verdict TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      role TEXT NOT NULL,
      verdict TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS synthesis (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      required_documents TEXT NOT NULL,
      next_steps TEXT NOT NULL,
      blockers TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signatures (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      meaning TEXT NOT NULL,
      signed_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      username TEXT,
      detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sheet_updates (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      sheet_type TEXT NOT NULL,
      status TEXT NOT NULL,
      correlation_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sop_versions (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      version INTEGER NOT NULL,
      hash TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cached_files (
      id TEXT PRIMARY KEY,
      file_id TEXT,
      file_name TEXT NOT NULL,
      hash TEXT NOT NULL,
      path TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source TEXT NOT NULL
    );
  `);

  logger.info("Database schema initialized");
}
