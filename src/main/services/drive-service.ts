import { google, drive_v3 } from "googleapis";
import type { OAuth2Client } from "googleapis-common";
import fs from "fs";
import { DriveQueryError, createChildLogger } from "../common";

const logger = createChildLogger("DriveService");

function escapeQueryString(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class DriveService {
  private drive: drive_v3.Drive;

  constructor(authClient: OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth: authClient });
  }

  async findFolderId(folderName: string, parentId?: string | null): Promise<string | null> {
    const escapedName = escapeQueryString(folderName);
    let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`;

    if (parentId) {
      const escapedParentId = escapeQueryString(parentId);
      query += ` and '${escapedParentId}' in parents`;
    }

    try {
      const res = await this.drive.files.list({
        q: query,
        fields: "files(id, name)",
      });
      return res.data.files?.[0]?.id || null;
    } catch (e) {
      logger.error({ error: e, folderName, parentId }, "Failed to find folder");
      throw new DriveQueryError(`Failed to find folder: ${folderName}`, e);
    }
  }

  async listFiles(folderId: string): Promise<drive_v3.Schema$File[]> {
    const escapedId = escapeQueryString(folderId);

    try {
      const res = await this.drive.files.list({
        q: `'${escapedId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType, webViewLink, createdTime)",
        orderBy: "createdTime desc",
      });
      return res.data.files || [];
    } catch (e) {
      logger.error({ error: e, folderId }, "Failed to list files");
      throw new DriveQueryError(`Failed to list files in folder`, e);
    }
  }

  async downloadFile(fileId: string, destPath: string): Promise<string> {
    const dest = fs.createWriteStream(destPath);

    return new Promise((resolve, reject) => {
      this.drive.files
        .get({ fileId, alt: "media" }, { responseType: "stream" })
        .then((res) => {
          res.data
            .on("end", () => {
              logger.info({ fileId, destPath }, "File downloaded");
              resolve(destPath);
            })
            .on("error", (err) => {
              logger.error({ error: err, fileId }, "Download stream error");
              reject(new DriveQueryError("File download failed", err));
            })
            .pipe(dest);
        })
        .catch((err) => {
          logger.error({ error: err, fileId }, "Download request failed");
          reject(new DriveQueryError("File download request failed", err));
        });
    });
  }
}
