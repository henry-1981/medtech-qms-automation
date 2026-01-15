import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { createChildLogger } from "../common";

const logger = createChildLogger("SignatureStore");

export function addSignature(
  requestId: string,
  userId: string,
  role: string,
  meaning: string
): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO signatures (id, request_id, user_id, role, meaning, signed_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    uuidv4(),
    requestId,
    userId,
    role,
    meaning,
    new Date().toISOString()
  );

  logger.info({ requestId, userId, role }, "Signature recorded");
}

export interface SignatureRow {
  requestId: string;
  userId: string;
  role: string;
  meaning: string;
  signedAt: string;
}

export function listSignatures(limit: number = 100): SignatureRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT request_id, user_id, role, meaning, signed_at FROM signatures ORDER BY signed_at DESC LIMIT ?"
    )
    .all(limit) as Array<{
    request_id: string;
    user_id: string;
    role: string;
    meaning: string;
    signed_at: string;
  }>;

  return rows.map((row) => ({
    requestId: row.request_id,
    userId: row.user_id,
    role: row.role,
    meaning: row.meaning,
    signedAt: row.signed_at,
  }));
}
