import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { createChildLogger } from "../common";

const logger = createChildLogger("CacheStore");

export interface CachedFile {
  id: string;
  fileId?: string;
  fileName: string;
  hash: string;
  path: string;
  updatedAt: string;
  source: "drive" | "manual";
}

export function upsertCachedFile(file: Omit<CachedFile, "id">): CachedFile {
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM cached_files WHERE file_id = ? OR path = ?")
    .get(file.fileId || "", file.path) as CachedFile | undefined;

  if (existing) {
    db.prepare(
      "UPDATE cached_files SET file_name = ?, hash = ?, path = ?, updated_at = ?, source = ? WHERE id = ?"
    ).run(file.fileName, file.hash, file.path, file.updatedAt, file.source, existing.id);

    return { ...existing, ...file } as CachedFile;
  }

  const id = uuidv4();
  db.prepare(
    "INSERT INTO cached_files (id, file_id, file_name, hash, path, updated_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, file.fileId || null, file.fileName, file.hash, file.path, file.updatedAt, file.source);

  logger.info({ fileName: file.fileName }, "Cached file saved");

  return { id, ...file };
}

export function listCachedFiles(): CachedFile[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM cached_files ORDER BY updated_at DESC")
    .all() as CachedFile[];
}

export function getCachedFileById(id: string): CachedFile | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM cached_files WHERE id = ?")
    .get(id) as CachedFile | undefined;
  return row || null;
}
