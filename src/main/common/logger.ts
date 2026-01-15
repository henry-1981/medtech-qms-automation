import pino from "pino";
import path from "path";
import fs from "fs";
import os from "os";

const LOG_DIR = path.join(os.homedir(), ".medtech-qms", "logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFile = path.join(
  LOG_DIR,
  `qms-${new Date().toISOString().split("T")[0]}.log`
);

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    targets: [
      {
        target: "pino-pretty",
        options: { colorize: true },
        level: "info",
      },
      {
        target: "pino/file",
        options: { destination: logFile },
        level: "debug",
      },
    ],
  },
});

export const createChildLogger = (module: string) =>
  logger.child({ module });
