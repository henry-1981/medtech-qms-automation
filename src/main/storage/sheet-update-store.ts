import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { createChildLogger } from "../common";

const logger = createChildLogger("SheetUpdateStore");

export type SheetUpdateType = "RELEASE" | "VV";

export interface SheetUpdateRecord {
  id: string;
  requestId?: string;
  sheetType: SheetUpdateType;
  status: "SUCCESS" | "FAILED";
  correlationId?: string;
  error?: string;
  createdAt: string;
}

export function recordSheetUpdate(record: Omit<SheetUpdateRecord, "id" | "createdAt">): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO sheet_updates (id, request_id, sheet_type, status, correlation_id, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    uuidv4(),
    record.requestId || null,
    record.sheetType,
    record.status,
    record.correlationId || null,
    record.error || null,
    new Date().toISOString()
  );

  logger.info({ sheetType: record.sheetType, status: record.status }, "Sheet update recorded");
}
