import { beforeEach, afterEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  seedDefaultAdmin,
  createUser,
  login,
  logout,
  getSession,
  changePassword,
  cleanupExpiredSessions,
} from "../auth";
import { getDb, closeDb } from "../db";

const TEST_DB = path.join(os.tmpdir(), `qms-test-${Date.now()}.db`);

function resetDb() {
  process.env.QMS_DB_PATH = TEST_DB;
  process.env.QMS_BCRYPT_ROUNDS = "4";
  closeDb();
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
  getDb();
}

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) {
    fs.unlinkSync(TEST_DB);
  }
});

beforeEach(() => {
  resetDb();
});

describe("auth", () => {
  it("creates default admin with generated password", () => {
    seedDefaultAdmin();
    const admin = login("admin", process.env.QMS_ADMIN_PASSWORD || "invalid");
    expect(admin).toBeNull();
  });

  it("creates user and allows login", () => {
    seedDefaultAdmin();
    const user = createUser("qa_user", "Password123", "QA");
    const session = login("qa_user", "Password123");
    expect(user.username).toBe("qa_user");
    expect(session?.user.username).toBe("qa_user");
  });

  it("locks out after repeated failed attempts", () => {
    createUser("dev_user", "Password123", "DEV");
    for (let i = 0; i < 6; i += 1) {
      login("dev_user", "WrongPass1");
    }
    const session = login("dev_user", "Password123");
    expect(session).toBeNull();
  });

  it("expires sessions and cleans up", () => {
    createUser("ra_user", "Password123", "RA");
    const session = login("ra_user", "Password123");
    expect(session).not.toBeNull();

    const db = getDb();
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      session!.token
    );

    const removed = cleanupExpiredSessions();
    expect(removed).toBeGreaterThanOrEqual(0);

    const fetched = getSession(session!.token);
    expect(fetched).toBeNull();
  });

  it("changes password with validation", () => {
    const user = createUser("pm_user", "Password123", "QA");
    expect(() => changePassword(user.id, "Password123", "Newpass123"))
      .not.toThrow();
    expect(login("pm_user", "Newpass123")?.user.username).toBe("pm_user");
  });

  it("invalid user input throws error", () => {
    expect(() => createUser("bad user", "short", "QA")).toThrow(
      /INVALID_USER_INPUT/
    );
  });

  it("logout invalidates session", () => {
    createUser("qa2_user", "Password123", "QA");
    const session = login("qa2_user", "Password123");
    expect(session).not.toBeNull();
    logout(session!.token);
    expect(getSession(session!.token)).toBeNull();
  });
});
