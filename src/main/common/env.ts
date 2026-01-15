import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3000/oauth2callback"),
  QMS_SHEET_ID: z.string().optional(),
  QMS_SHEET_RELEASE_TAB: z.string().optional(),
  QMS_SHEET_VV_TAB: z.string().optional(),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  LLM_TIMEOUT_MS: z
    .preprocess(
      (value) => (value === undefined ? "30000" : value),
      z
        .string()
        .transform((value) => Number(value))
        .refine((value) => !Number.isNaN(value) && value > 0, {
          message: "LLM_TIMEOUT_MS must be a positive number",
        })
    ),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  STRICT_ENV_VALIDATION: z
    .enum(["true", "false"])
    .default("false"),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function getEnv(): Env {
  if (validatedEnv) return validatedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missingVars = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.error("Environment validation failed:\n" + missingVars);

    const isProduction = process.env.NODE_ENV === "production";
    const strictMode = process.env.STRICT_ENV_VALIDATION === "true";
    if (isProduction || strictMode) {
      throw new Error("Environment validation failed in production mode");
    }

    return {
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI:
        process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:3000/oauth2callback",
      LOG_LEVEL: "info",
      LLM_TIMEOUT_MS: 30000,
      NODE_ENV: "development",
      STRICT_ENV_VALIDATION: "false",
      QMS_SHEET_ID: process.env.QMS_SHEET_ID,
      QMS_SHEET_RELEASE_TAB: process.env.QMS_SHEET_RELEASE_TAB,
      QMS_SHEET_VV_TAB: process.env.QMS_SHEET_VV_TAB,
    };
  }

  validatedEnv = result.data;
  return validatedEnv;
}
