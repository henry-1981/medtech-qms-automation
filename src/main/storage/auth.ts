import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getDb } from "./db";
import { createChildLogger } from "../common";
import { recordSecurityEvent } from "./security-store";

const logger = createChildLogger("AuthStore");

const DATA_DIR = path.join(os.homedir(), ".medtech-qms");
const ADMIN_PASSWORD_PATH = path.join(DATA_DIR, "admin-initial.txt");
const DEFAULT_BCRYPT_ROUNDS = 10;

function getSaltRounds(): number {
  const envRounds = Number(process.env.QMS_BCRYPT_ROUNDS);
  if (!Number.isNaN(envRounds) && envRounds >= 4 && envRounds <= 15) {
    return envRounds;
  }
  return DEFAULT_BCRYPT_ROUNDS;
}

export type UserRole = "ADMIN" | "QA" | "RA" | "DEV" | "VIEWER";

export interface UserRecord {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface SessionInfo {
  token: string;
  user: UserRecord;
  createdAt: string;
  expiresAt: string;
}

const sessions = new Map<string, SessionInfo>();

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

function getInitialAdminPassword(): string {
  if (process.env.QMS_ADMIN_PASSWORD) {
    return process.env.QMS_ADMIN_PASSWORD;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(ADMIN_PASSWORD_PATH)) {
    return fs.readFileSync(ADMIN_PASSWORD_PATH, "utf-8").trim();
  }

  const generated = crypto.randomBytes(12).toString("hex");
  fs.writeFileSync(ADMIN_PASSWORD_PATH, generated, { mode: 0o600 });
  logger.warn(`Admin password saved to ${ADMIN_PASSWORD_PATH}`);
  return generated;
}

function validateUserInput(username: string, password: string): string | null {
  if (!username || username.length < 3 || username.length > 32) {
    return "USERNAME_INVALID";
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return "USERNAME_INVALID";
  }
  const passwordCheck = validatePassword(password);
  if (passwordCheck) {
    return passwordCheck;
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return "PASSWORD_TOO_SHORT";
  }
  if (!/[A-Z]/.test(password) && !/[a-z]/.test(password)) {
    return "PASSWORD_WEAK";
  }
  if (!/\d/.test(password)) {
    return "PASSWORD_WEAK";
  }
  return null;
}

export function seedDefaultAdmin(): void {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as {
    count: number;
  };

  if (row.count === 0) {
    const id = uuidv4();
    const initialPassword = getInitialAdminPassword();
    const hash = bcrypt.hashSync(initialPassword, getSaltRounds());
    db.prepare(
      "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(id, "admin", hash, "ADMIN", new Date().toISOString());
    logger.warn("Default admin created. Use QMS_ADMIN_PASSWORD or admin-initial.txt");
  }
}

export function createUser(
  username: string,
  password: string,
  role: UserRole
): UserRecord {
  const validationError = validateUserInput(username, password);
  if (validationError) {
    throw new Error(`INVALID_USER_INPUT:${validationError}`);
  }

  const db = getDb();
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, getSaltRounds());
  const createdAt = new Date().toISOString();

  db.prepare(
    "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, username, hash, role, createdAt);

  return { id, username, role, createdAt };
}

export function listUsers(): UserRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, username, role, created_at FROM users ORDER BY created_at DESC")
    .all() as Array<{ id: string; username: string; role: UserRole; created_at: string }>;

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  }));
}

export function login(
  username: string,
  password: string
): SessionInfo | null {
  const db = getDb();
  const now = Date.now();
  const lockWindowStart = new Date(now - LOCK_WINDOW_MS).toISOString();

  const failedCount = db
    .prepare(
      "SELECT COUNT(*) as count FROM login_attempts WHERE username = ? AND success = 0 AND created_at >= ?"
    )
    .get(username, lockWindowStart) as { count: number };

  if (failedCount.count >= MAX_FAILED_ATTEMPTS) {
    recordLoginAttempt(username, false, "LOCKED");
    recordSecurityEvent("LOGIN_LOCKED", username, "Too many failed attempts");
    return null;
  }

  const row = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username) as
    | { id: string; username: string; password_hash: string; role: UserRole; created_at: string }
    | undefined;

  if (!row) {
    recordLoginAttempt(username, false, "USER_NOT_FOUND");
    return null;
  }

  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) {
    recordLoginAttempt(username, false, "BAD_PASSWORD");
    return null;
  }

  recordLoginAttempt(username, true, "SUCCESS");

  const token = uuidv4();
  const user: UserRecord = {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  };

  const createdAt = new Date().toISOString();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();

  const session: SessionInfo = {
    token,
    user,
    createdAt,
    expiresAt,
  };

  db.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).run(token, user.id, createdAt, expiresAt);

  sessions.set(token, session);

  return session;
}

export function logout(token: string): void {
  const db = getDb();
  sessions.delete(token);
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getSession(token: string | null): SessionInfo | null {
  if (!token) return null;

  const cached = sessions.get(token) || null;
  if (cached && new Date(cached.expiresAt).getTime() > Date.now()) {
    return cached;
  }

  const db = getDb();
  const row = db
    .prepare(
      "SELECT sessions.token, sessions.created_at, sessions.expires_at, users.id as user_id, users.username, users.role, users.created_at as user_created_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?"
    )
    .get(token) as
    | {
        token: string;
        created_at: string;
        expires_at: string;
        user_id: string;
        username: string;
        role: UserRole;
        user_created_at: string;
      }
    | undefined;

  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    recordSecurityEvent("SESSION_EXPIRED", row.username, "Expired session removed");
    return null;
  }

  const session: SessionInfo = {
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      username: row.username,
      role: row.role,
      createdAt: row.user_created_at,
    },
  };

  sessions.set(token, session);
  return session;
}

export function requireRole(
  token: string | null,
  roles: UserRole[]
): SessionInfo {
  const session = getSession(token);
  if (!session) {
    throw new Error("AUTH_REQUIRED");
  }
  if (!roles.includes(session.user.role)) {
    throw new Error("ACCESS_DENIED");
  }
  return session;
}

export function cleanupExpiredSessions(): number {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  const expiredRows = db
    .prepare("SELECT token FROM sessions WHERE expires_at <= ?")
    .all(nowIso) as Array<{ token: string }>;

  const result = db
    .prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .run(nowIso);

  expiredRows.forEach((row) => {
    sessions.delete(row.token);
  });

  sessions.forEach((session, token) => {
    if (new Date(session.expiresAt).getTime() <= nowMs) {
      sessions.delete(token);
    }
  });

  return result.changes || 0;
}

function recordLoginAttempt(username: string, success: boolean, reason: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO login_attempts (id, username, success, reason, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(uuidv4(), username, success ? 1 : 0, reason, new Date().toISOString());
}

export function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): void {
  const db = getDb();
  const row = db
    .prepare("SELECT id, password_hash, username FROM users WHERE id = ?")
    .get(userId) as { id: string; password_hash: string; username: string } | undefined;

  if (!row) {
    throw new Error("USER_NOT_FOUND");
  }

  const ok = bcrypt.compareSync(currentPassword, row.password_hash);
  if (!ok) {
    throw new Error("INVALID_PASSWORD");
  }

  const passwordCheck = validatePassword(newPassword);
  if (passwordCheck) {
    throw new Error(`INVALID_PASSWORD:${passwordCheck}`);
  }

  const hash = bcrypt.hashSync(newPassword, getSaltRounds());
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
  recordSecurityEvent("PASSWORD_CHANGED", row.username, "User password updated");
}
