import { google, sheets_v4 } from "googleapis";
import type { OAuth2Client } from "googleapis-common";
import { createChildLogger, getEnv } from "../common";

const logger = createChildLogger("SheetsService");

export class SheetsService {
  private sheets: sheets_v4.Sheets;

  constructor(authClient: OAuth2Client) {
    this.sheets = google.sheets({ version: "v4", auth: authClient });
  }

  async appendRow(
    sheetId: string,
    sheetName: string,
    values: (string | number | boolean | null)[]
  ): Promise<void> {
    const range = `${sheetName}!A1`;
    logger.info({ sheetName }, "Appending row to sheet");

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [values],
      },
    });
  }

  async appendReleaseRow(values: (string | number | boolean | null)[]): Promise<void> {
    const env = getEnv();
    if (!env.QMS_SHEET_ID || !env.QMS_SHEET_RELEASE_TAB) {
      throw new Error("SHEET_CONFIG_MISSING");
    }
    await this.appendRow(env.QMS_SHEET_ID, env.QMS_SHEET_RELEASE_TAB, values);
  }

  async appendVvRow(values: (string | number | boolean | null)[]): Promise<void> {
    const env = getEnv();
    if (!env.QMS_SHEET_ID || !env.QMS_SHEET_VV_TAB) {
      throw new Error("SHEET_CONFIG_MISSING");
    }
    await this.appendRow(env.QMS_SHEET_ID, env.QMS_SHEET_VV_TAB, values);
  }
}
