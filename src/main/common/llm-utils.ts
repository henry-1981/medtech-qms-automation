import { AgentError } from "./errors";
import { createChildLogger } from "./logger";

const logger = createChildLogger("LLMUtils");

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      logger.warn({ context, timeoutMs }, "LLM timeout");
      reject(new AgentError(`LLM 호출 타임아웃 (${context})`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
