import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { createChildLogger } from "../common";

const logger = createChildLogger("SecurityStore");

export type SecurityEventType = "LOGIN_LOCKED" | "SESSION_EXPIRED" | "PASSWORD_CHANGED";

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  username?: string;
  detail?: string;
  createdAt: string;
}

export function recordSecurityEvent(
  type: SecurityEventType,
  username?: string,
  detail?: string
): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO security_events (id, type, username, detail, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(uuidv4(), type, username || null, detail || null, new Date().toISOString());
  logger.info({ type, username }, "Security event recorded");
}

export function listSecurityEvents(limit: number = 100): SecurityEvent[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, type, username, detail, created_at FROM security_events ORDER BY created_at DESC LIMIT ?"
    )
    .all(limit) as Array<{
    id: string;
    type: SecurityEventType;
    username: string | null;
    detail: string | null;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    username: row.username || undefined,
    detail: row.detail || undefined,
    createdAt: row.created_at,
  }));
}
