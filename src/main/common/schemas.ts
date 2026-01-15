import { z } from "zod";
import { createChildLogger } from "./logger";

const logger = createChildLogger("SchemaParser");

const MAX_LOG_LENGTH = 2048;

export const raAnalysisResultSchema = z.object({
  verdict: z.enum(["PASS", "WARNING", "CRITICAL_BLOCK"]),
  risk_category: z.enum([
    "WELLNESS_VIOLATION",
    "CLASS_UPGRADE_RISK",
    "SAFE",
  ]),
  reason: z.string(),
  recommendation: z.string(),
  referenced_sop: z.string().optional(),
});

export type RAAnalysisResult = z.infer<typeof raAnalysisResultSchema>;

export const documentExtractionSchema = z.object({
  requiredDocuments: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([]),
});

export type DocumentExtraction = z.infer<typeof documentExtractionSchema>;

function truncateContent(content: string, maxLength: number = MAX_LOG_LENGTH): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + "...(truncated)";
}

export function parseJsonSafely<T>(
  content: string,
  schema: z.ZodSchema<T>,
  context?: string
): T | null {
  try {
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}") + 1;

    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      logger.warn(
        { context, contentLength: content.length },
        "No JSON object found in content"
      );
      return null;
    }

    const jsonString = content.substring(jsonStart, jsonEnd);
    const parsed = JSON.parse(jsonString);
    const result = schema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }

    logger.warn(
      {
        context,
        validationErrors: result.error.issues,
        truncatedContent: truncateContent(jsonString),
      },
      "Schema validation failed"
    );
    return null;
  } catch (e) {
    logger.warn(
      {
        context,
        error: e instanceof Error ? e.message : String(e),
        truncatedContent: truncateContent(content),
      },
      "JSON parse failed"
    );
    return null;
  }
}
