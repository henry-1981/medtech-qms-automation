import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { createChildLogger } from "../common";

const logger = createChildLogger("VersionStore");

export interface SopVersion {
  id: string;
  fileId: string;
  fileName: string;
  version: number;
  hash: string;
  source: "drive" | "manual";
  createdAt: string;
}

export function getLatestVersion(fileId: string): SopVersion | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM sop_versions WHERE file_id = ? ORDER BY version DESC LIMIT 1"
    )
    .get(fileId) as SopVersion | undefined;
  return row || null;
}

export function createVersion(
  fileId: string,
  fileName: string,
  hash: string,
  source: "drive" | "manual"
): SopVersion {
  const db = getDb();
  const latest = getLatestVersion(fileId);
  const version = latest ? latest.version + 1 : 1;

  const record: SopVersion = {
    id: uuidv4(),
    fileId,
    fileName,
    version,
    hash,
    source,
    createdAt: new Date().toISOString(),
  };

  db.prepare(
    "INSERT INTO sop_versions (id, file_id, file_name, version, hash, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    record.id,
    record.fileId,
    record.fileName,
    record.version,
    record.hash,
    record.source,
    record.createdAt
  );

  logger.info({ fileId, version }, "SOP version recorded");

  return record;
}
