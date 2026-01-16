import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";
import http from "http";
import url from "url";
import fs from "fs";
import path from "path";
import os from "os";
import { shell } from "electron";
import { z } from "zod";
import { DriveConnectionError, createChildLogger, getEnv } from "../common";

const logger = createChildLogger("AuthService");

const SECURE_DIR = path.join(os.homedir(), ".medtech-qms");
if (!fs.existsSync(SECURE_DIR)) {
  fs.mkdirSync(SECURE_DIR, { recursive: true, mode: 0o700 });
}

const TOKEN_PATH = path.join(SECURE_DIR, "oauth-token.json");

const tokenSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expiry_date: z.number().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});

export class AuthService {
  private oauth2Client: OAuth2Client;
  public readonly isConfigured: boolean;

  constructor() {
    const env = getEnv();

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      this.isConfigured = false;
      this.oauth2Client = new google.auth.OAuth2(
        "dummy_client_id",
        "dummy_client_secret",
        "http://localhost:3000/oauth2callback"
      );
      return;
    }

    this.isConfigured = true;
    this.oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    );

    this.oauth2Client.on("tokens", (tokens) => {
      if (tokens.refresh_token || tokens.access_token) {
        try {
          const existing = fs.existsSync(TOKEN_PATH)
            ? JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"))
            : {};
          const merged = { ...existing, ...tokens };
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged), { mode: 0o600 });
          logger.info("OAuth token refreshed and saved");
        } catch (e) {
          logger.error({ error: e }, "Failed to persist OAuth token refresh");
        }
      }
    });
  }

  async getAuthenticatedClient(): Promise<OAuth2Client> {
    if (!this.isConfigured) {
      throw new DriveConnectionError("AuthService is not configured. Missing client credentials.");
    }

    if (fs.existsSync(TOKEN_PATH)) {
      try {
        const rawToken = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
        const result = tokenSchema.safeParse(rawToken);

        if (result.success) {
          this.oauth2Client.setCredentials(result.data);
          logger.info("Loaded existing OAuth token");
          return this.oauth2Client;
        }

        logger.warn("Token file schema invalid, re-authenticating");
      } catch (e) {
        logger.error({ error: e }, "Token file parse failed");
      }
    }

    return this.authorizeNewUser();
  }

  private async authorizeNewUser(): Promise<OAuth2Client> {
    if (!this.isConfigured) {
      throw new DriveConnectionError("AuthService is not configured.");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close();
        reject(new DriveConnectionError("OAuth timeout after 5 minutes"));
      }, 5 * 60 * 1000);

      const server = http
        .createServer(async (req, res) => {
          try {
            if (req.url && req.url.indexOf("/oauth2callback") > -1) {
              const qs = new url.URL(
                req.url,
                "http://localhost:3000"
              ).searchParams;
              res.end(
                "Authentication successful! You can close this window and return to the app."
              );

              clearTimeout(timeout);
              server.close();

              const code = qs.get("code");
              if (!code) {
                reject(new DriveConnectionError("No auth code received"));
                return;
              }

              const { tokens } = await this.oauth2Client.getToken(code);
              this.oauth2Client.setCredentials(tokens);

              fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens), {
                mode: 0o600,
              });
              logger.info("OAuth token saved");

              resolve(this.oauth2Client);
            }
          } catch (e) {
            clearTimeout(timeout);
            logger.error({ error: e }, "OAuth callback failed");
            reject(new DriveConnectionError("OAuth callback failed", e));
          }
        })
        .listen(3000, () => {
          const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: "offline",
            scope: [
              "https://www.googleapis.com/auth/drive",
              "https://www.googleapis.com/auth/spreadsheets",
            ],
          });
          logger.info("Opening OAuth URL in browser");
          shell.openExternal(authUrl);
        });

      server.on("error", (err) => {
        clearTimeout(timeout);
        reject(new DriveConnectionError("OAuth server failed to start", err));
      });
    });
  }

  async revokeToken(): Promise<void> {
    if (!this.isConfigured) return;
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
      logger.info("OAuth token revoked");
    }
  }
}
