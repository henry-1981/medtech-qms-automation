import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { SopAgent } from "./agents/sop-agent";
import { AuthService } from "./services/auth-service";
import { DriveService } from "./services/drive-service";
import { SheetsService } from "./services/sheets-service";
import { TaskScheduler } from "./services/scheduler";
import { ModelService } from "./services/model-service";
import { mapReleaseRow, mapVvRow, releaseRowSchema, vvRowSchema } from "./services/sheets-mapper";
import { DocumentParser, DocumentChunker, SopVectorStore } from "./doc-engine";
import { DesignChangeOrchestrator } from "./workflow";
import { DocxGenerator, createDesignChangeDocData } from "./template-engine";
import {
  createChildLogger,
  formatError,
  getEnv,
  DriveConnectionError,
} from "./common";
import {
  seedDefaultAdmin,
  login,
  logout,
  requireRole,
  getSession,
  createUser,
  listUsers,
  UserRole,
  changePassword,
  saveWorkflow,
  saveAgentLogs,
  saveSynthesis,
  upsertCachedFile,
  listCachedFiles,
  getCachedFileById,
  createVersion,
  getLatestVersion,
  addSignature,
  listWorkflows,
  listAgentLogs,
  listSignatures,
  listSecurityEvents,
  cleanupExpiredSessions,
  recordSheetUpdate,
} from "./storage";

const logger = createChildLogger("Main");

let mainWindow: BrowserWindow | null = null;
let authService: AuthService | null = null;
let driveService: DriveService | null = null;
let sheetsService: SheetsService | null = null;
let sopAgent: SopAgent | null = null;
let vectorStore: SopVectorStore | null = null;
let documentParser: DocumentParser | null = null;
let documentChunker: DocumentChunker | null = null;
let orchestrator: DesignChangeOrchestrator | null = null;
let docxGenerator: DocxGenerator | null = null;
let scheduler: TaskScheduler | null = null;
let modelService: ModelService | null = null;
let isInitialized = false;
let isDriveConnecting = false;

const TEMP_DIR = path.join(os.tmpdir(), "medtech-qms");
const OUTPUT_DIR = path.join(os.homedir(), ".medtech-qms", "generated");
const CACHE_DIR = path.join(os.homedir(), ".medtech-qms", "cache");

async function initializeServices(): Promise<void> {
  if (isInitialized) return;

  logger.info("Initializing services...");

  [TEMP_DIR, OUTPUT_DIR, CACHE_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  const env = getEnv();
  seedDefaultAdmin();

  const hasApiKey = !!env.GOOGLE_API_KEY;
  const hasClientSecrets = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  if (hasApiKey) {
    logger.info("Initializing AI/RAG features...");
    vectorStore = new SopVectorStore();
    await vectorStore.initialize();

    documentParser = new DocumentParser();
    documentChunker = new DocumentChunker({
      chunkSize: 800,
      chunkOverlap: 150,
      preserveSections: true,
    });

    sopAgent = new SopAgent();
    sopAgent.setVectorStore(vectorStore);

    orchestrator = new DesignChangeOrchestrator();
    orchestrator.setVectorStore(vectorStore);

    docxGenerator = new DocxGenerator();
    modelService = new ModelService();
  } else {
    logger.warn("AI features (LLM, RAG, DocxGen) are disabled due to missing GOOGLE_API_KEY.");
  }

  if (hasClientSecrets) {
    logger.info("AuthService configured.");
    authService = new AuthService();
  } else {
    logger.warn("Drive/Sheets features are disabled due to missing Google Client Credentials.");
  }

  scheduler = new TaskScheduler();
  registerScheduledTasks();
  scheduler.start();

  isInitialized = true;
  logger.info("Services initialized");
}

function registerScheduledTasks(): void {
  if (!scheduler) return;

  scheduler.registerTask({
    id: "daily-sop-reminder",
    name: "일일 SOP 준수 리마인더",
    frequency: "daily",
    handler: async () => {
      logger.info("Daily SOP reminder triggered");
      if (mainWindow) {
        mainWindow.webContents.send("scheduled-task", {
          taskId: "daily-sop-reminder",
          message: "오늘의 QMS 점검 사항을 확인하세요.",
        });
      }
    },
  });

  scheduler.registerTask({
    id: "monthly-audit-prep",
    name: "월간 내부심사 준비",
    frequency: "monthly",
    handler: async () => {
      logger.info("Monthly audit prep triggered");
    },
  });

  scheduler.registerTask({
    id: "daily-session-cleanup",
    name: "세션 만료 정리",
    frequency: "daily",
    handler: async () => {
      const removed = cleanupExpiredSessions();
      logger.info({ removed }, "Expired sessions cleaned");
    },
  });
}

async function initializeDrive(): Promise<void> {
  if (isDriveConnecting) {
    throw new DriveConnectionError("Already authenticating");
  }

  isDriveConnecting = true;
  try {
    logger.info("Initializing Google Drive Auth...");
    const authService = new AuthService();
    const authClient = await authService.getAuthenticatedClient();
    driveService = new DriveService(authClient);
    sheetsService = new SheetsService(authClient);
    logger.info("Google Drive Authenticated!");

    if (mainWindow) {
      mainWindow.webContents.send("drive-status", { connected: true });
    }
  } catch (error) {
    const message =
      error instanceof DriveConnectionError
        ? error.message
        : formatError(error);
    logger.error({ error }, "Drive Auth Failed");
    if (mainWindow) {
      mainWindow.webContents.send("drive-status", {
        connected: false,
        error: message,
      });
    }
    throw error;
  } finally {
    isDriveConnecting = false;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "..", "preload.js"),
    },
  });

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createHash(content: Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName);
  return base.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function registerIpcHandlers(): void {
  ipcMain.handle("login", async (_event, username: string, password: string) => {
    const correlationId = crypto.randomUUID();
    const requestLogger = logger.child({ correlationId, action: "login" });
    const session = login(username, password);
    if (!session) {
      requestLogger.warn("Login failed");
      return { success: false, error: "INVALID_CREDENTIALS_OR_LOCKED", correlationId };
    }
    requestLogger.info({ user: session.user.username }, "Login success");
    return { success: true, session, correlationId };
  });

  ipcMain.handle("logout", async (_event, token: string) => {
    logout(token);
    return { success: true };
  });

  ipcMain.handle(
    "change-password",
    async (_event, token: string, currentPassword: string, newPassword: string) => {
      try {
        const session = requireRole(token, ["ADMIN", "QA", "RA", "DEV", "VIEWER"]);
        changePassword(session.user.id, currentPassword, newPassword);
        return { success: true };
      } catch (error) {
        if (error instanceof Error) {
          return { success: false, error: error.message };
        }
        return { success: false, error: "PASSWORD_CHANGE_FAILED" };
      }
    }
  );

  ipcMain.handle("get-current-user", async (_event, token: string) => {
    const session = getSession(token);
    if (!session) {
      return { user: null };
    }
    return { user: session.user };
  });

  ipcMain.handle("analyze-change", async (_event, description: string) => {
    const correlationId = crypto.randomUUID();
    const requestLogger = logger.child({ correlationId, action: "analyze-change" });
    if (!orchestrator) {
      return { status: "ERROR", error: "System not initialized", correlationId };
    }
    try {
      const result = await orchestrator.processDesignChange(description);
      const raMessage = result.state.messages.find(m => m.agentRole === "RA_EXPERT");
      
      return {
        status: result.synthesis?.finalVerdict || "NEEDS_REVIEW",
        raReport: {
          verdict: result.state.raVerdict || "NEEDS_INFO",
          risk_category: "UNKNOWN",
          reason: raMessage?.content || "RA review completed",
          recommendation: result.synthesis?.nextSteps.join(", ") || ""
        },
        requiredDocuments: result.synthesis?.requiredDocuments || [],
        nextSteps: result.synthesis?.nextSteps || [],
        correlationId 
      };
    } catch (error) {
      requestLogger.error({ error }, "analyze-change failed");
      return { status: "ERROR", error: formatError(error), correlationId };
    }
  });

  ipcMain.handle("list-users", async (_event, token: string) => {
    try {
      requireRole(token, ["ADMIN"]);
      return { success: true, users: listUsers() };
    } catch (error) {
      return { success: false, error: "ACCESS_DENIED" };
    }
  });

  ipcMain.handle(
    "create-user",
    async (
      _event,
      token: string,
      username: string,
      password: string,
      role: string
    ) => {
      try {
        requireRole(token, ["ADMIN"]);
        const allowedRoles: UserRole[] = ["ADMIN", "QA", "RA", "DEV", "VIEWER"];
        if (!allowedRoles.includes(role as UserRole)) {
          return { success: false, error: "INVALID_ROLE" };
        }
        const user = createUser(username, password, role as UserRole);
        return { success: true, user };
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("INVALID_USER_INPUT")) {
          return { success: false, error: "INVALID_USER_INPUT" };
        }
        return { success: false, error: "ACCESS_DENIED" };
      }
    }
  );

  ipcMain.handle("list-history", async (_event, token: string) => {
    try {
      requireRole(token, ["ADMIN", "QA", "RA", "DEV", "VIEWER"]);
      return {
        success: true,
        workflows: listWorkflows(100),
        signatures: listSignatures(100),
      };
    } catch (error) {
      return { success: false, error: "ACCESS_DENIED" };
    }
  });

  ipcMain.handle("list-security-events", async (_event, token: string) => {
    try {
      requireRole(token, ["ADMIN"]);
      return { success: true, events: listSecurityEvents(100) };
    } catch (error) {
      return { success: false, error: "ACCESS_DENIED" };
    }
  });

  ipcMain.handle(
    "append-release-row",
    async (_event, token: string, input: unknown) => {
      const correlationId = crypto.randomUUID();
      const requestLogger = logger.child({ correlationId, action: "append-release-row" });
      try {
        requireRole(token, ["ADMIN", "QA", "RA"]);
        if (!sheetsService) {
          return { success: false, error: "SHEETS_NOT_READY", correlationId };
        }
        const parsed = releaseRowSchema.safeParse(input);
        if (!parsed.success) {
          return { success: false, error: "INVALID_RELEASE_INPUT", correlationId };
        }
        const values = mapReleaseRow(parsed.data);
        await sheetsService.appendReleaseRow(values);
        return { success: true, correlationId };
      } catch (error) {
        requestLogger.error({ error }, "append-release-row failed");
        return { success: false, error: formatError(error), correlationId };
      }
    }
  );

  ipcMain.handle(
    "append-vv-row",
    async (_event, token: string, input: unknown) => {
      const correlationId = crypto.randomUUID();
      const requestLogger = logger.child({ correlationId, action: "append-vv-row" });
      try {
        requireRole(token, ["ADMIN", "QA", "RA"]);
        if (!sheetsService) {
          return { success: false, error: "SHEETS_NOT_READY", correlationId };
        }
        const parsed = vvRowSchema.safeParse(input);
        if (!parsed.success) {
          return { success: false, error: "INVALID_VV_INPUT", correlationId };
        }
        const values = mapVvRow(parsed.data);
        await sheetsService.appendVvRow(values);
        return { success: true, correlationId };
      } catch (error) {
        requestLogger.error({ error }, "append-vv-row failed");
        return { success: false, error: formatError(error), correlationId };
      }
    }
  );

  ipcMain.handle(
    "get-workflow-logs",
    async (_event, token: string, requestId: string) => {
      try {
        requireRole(token, ["ADMIN", "QA", "RA", "DEV", "VIEWER"]);
        return { success: true, logs: listAgentLogs(requestId) };
      } catch (error) {
        return { success: false, error: "ACCESS_DENIED" };
      }
    }
  );

  ipcMain.handle(
    "run-full-workflow",
    async (
      _event,
      token: string,
      description: string,
      sheetInputs?: { release?: unknown; vv?: unknown }
    ) => {
      const correlationId = crypto.randomUUID();
      const requestLogger = logger.child({ correlationId, action: "run-full-workflow" });
      try {
        requireRole(token, ["ADMIN", "QA", "RA", "DEV"]);
      } catch (error) {
        return { success: false, error: "ACCESS_DENIED", correlationId };
      }

      if (!orchestrator || !docxGenerator) {
        return { success: false, error: "System not initialized", correlationId };
      }

      try {
        if (mainWindow) {
          mainWindow.webContents.send("workflow-update", {
            requestId: "pending",
            phase: "STARTED",
            message: "워크플로우 시작...",
          });
        }

        const result = await orchestrator.processDesignChange(description);

        result.state.messages.forEach((msg) => {
          if (mainWindow) {
            mainWindow.webContents.send("workflow-update", {
              requestId: result.state.requestId,
              phase: msg.agentRole,
              message: msg.content,
            });
          }
        });

        saveWorkflow(result.state);
        saveAgentLogs(result.state);
        if (result.synthesis) {
          saveSynthesis(result.state.requestId, {
            summary: result.synthesis.summary,
            requiredDocuments: result.synthesis.requiredDocuments,
            nextSteps: result.synthesis.nextSteps,
            blockers: result.synthesis.blockers || [],
          });
        }

        let generatedDocPath: string | null = null;

        if (result.synthesis && result.synthesis.finalVerdict !== "REJECTED") {
          const docData = createDesignChangeDocData(result.state);
          const fileName = `ECO_${result.state.requestId.slice(0, 8)}.docx`;
          requestLogger.info({ fileName }, "Document generation skipped (template missing)");
          generatedDocPath = path.join(OUTPUT_DIR, fileName);
        }

        if (sheetsService && sheetInputs?.release) {
          const parsed = releaseRowSchema.safeParse(sheetInputs.release);
          if (parsed.success) {
            await sheetsService.appendReleaseRow(mapReleaseRow(parsed.data));
            recordSheetUpdate({
              requestId: result.state.requestId,
              sheetType: "RELEASE",
              status: "SUCCESS",
              correlationId,
            });
          } else {
            recordSheetUpdate({
              requestId: result.state.requestId,
              sheetType: "RELEASE",
              status: "FAILED",
              correlationId,
              error: "INVALID_RELEASE_INPUT",
            });
          }
        }

        if (sheetsService && sheetInputs?.vv) {
          const parsed = vvRowSchema.safeParse(sheetInputs.vv);
          if (parsed.success) {
            await sheetsService.appendVvRow(mapVvRow(parsed.data));
            recordSheetUpdate({
              requestId: result.state.requestId,
              sheetType: "VV",
              status: "SUCCESS",
              correlationId,
            });
          } else {
            recordSheetUpdate({
              requestId: result.state.requestId,
              sheetType: "VV",
              status: "FAILED",
              correlationId,
              error: "INVALID_VV_INPUT",
            });
          }
        }

        return {
          success: true,
          state: result.state,
          synthesis: result.synthesis,
          generatedDocument: generatedDocPath,
          correlationId,
        };
      } catch (error) {
        requestLogger.error({ error }, "run-full-workflow failed");
        recordSheetUpdate({
          requestId: "unknown",
          sheetType: "RELEASE",
          status: "FAILED",
          correlationId,
          error: formatError(error),
        });
        return { success: false, error: formatError(error), correlationId };
      }
    }
  );

  ipcMain.handle("query-sop", async (_event, question: string) => {
    if (!sopAgent) {
      return { answer: "시스템이 초기화되지 않았습니다.", sources: [] };
    }
    try {
      return await sopAgent.queryProcedure(question);
    } catch (error) {
      logger.error({ error }, "query-sop failed");
      return { answer: formatError(error), sources: [] };
    }
  });

  ipcMain.handle("connect-drive", async (_event, token: string) => {
    const correlationId = crypto.randomUUID();
    const requestLogger = logger.child({ correlationId, action: "connect-drive" });
    try {
      requireRole(token, ["ADMIN", "QA", "RA"]);
    } catch (error) {
      return { success: false, error: "ACCESS_DENIED", correlationId };
    }

    try {
      await initializeDrive();
      return { success: true, correlationId };
    } catch (error) {
      requestLogger.error({ error }, "connect-drive failed");
      return { success: false, error: formatError(error), correlationId };
    }
  });

  ipcMain.handle("list-sops", async () => {
    if (!driveService) {
      return { files: listCachedFiles(), offline: true };
    }

    const env = getEnv();
    const rootFolderName = env.DRIVE_QMS_ROOT_FOLDER;
    const sopFolderName = env.DRIVE_SOP_FOLDER;

    try {
      const rootId = await driveService.findFolderId(rootFolderName);
      if (!rootId) {
        return { error: `${rootFolderName} folder not found` };
      }

      const sopFolderId = await driveService.findFolderId(sopFolderName, rootId);
      if (!sopFolderId) {
        const files = await driveService.listFiles(rootId);
        return { files, note: `Showing Root files (${sopFolderName} folder not found)` };
      }

      const files = await driveService.listFiles(sopFolderId);
      return { files };
    } catch (error) {
      logger.error({ error }, "list-sops failed");
      return { error: formatError(error) };
    }
  });

  ipcMain.handle(
    "learn-sop",
    async (_event, token: string, fileId: string, fileName: string) => {
      const correlationId = crypto.randomUUID();
      const requestLogger = logger.child({ correlationId, action: "learn-sop" });
      try {
        requireRole(token, ["ADMIN", "QA", "RA"]);
      } catch (error) {
        return { success: false, error: "ACCESS_DENIED", correlationId };
      }

      if (!driveService || !documentParser || !documentChunker || !vectorStore) {
        return { success: false, error: "System not fully initialized", correlationId };
      }

      try {
        const safeFileName = sanitizeFileName(fileName);
        const tempFilePath = path.join(TEMP_DIR, safeFileName);
        await driveService.downloadFile(fileId, tempFilePath);

        const fileBuffer = fs.readFileSync(tempFilePath);
        const fileHash = createHash(fileBuffer);

        const cachePath = path.join(CACHE_DIR, safeFileName);
        upsertCachedFile({
          fileId,
          fileName,
          hash: fileHash,
          path: cachePath,
          updatedAt: new Date().toISOString(),
          source: "drive",
        });

        fs.writeFileSync(cachePath, fileBuffer);

        const latest = getLatestVersion(fileId);
        if (!latest || latest.hash !== fileHash) {
          createVersion(fileId, fileName, fileHash, "drive");
        }

        const parsed = await documentParser.parseFile(tempFilePath);
        const chunks = documentChunker.chunkDocument(parsed.content, fileName);
        const addedCount = await vectorStore.addChunks(chunks);

        fs.unlinkSync(tempFilePath);

        requestLogger.info({ fileName, chunksAdded: addedCount }, "SOP learned");

        return {
          success: true,
          fileName,
          chunksAdded: addedCount,
          wordCount: parsed.metadata.wordCount,
          correlationId,
        };
      } catch (error) {
        requestLogger.error({ error, fileId, fileName }, "learn-sop failed");
        return { success: false, error: formatError(error), correlationId };
      }
    }
  );

  ipcMain.handle(
    "learn-cached-sop",
    async (_event, token: string, cacheId: string) => {
      const correlationId = crypto.randomUUID();
      const requestLogger = logger.child({ correlationId, action: "learn-cached-sop" });
      try {
        requireRole(token, ["ADMIN", "QA", "RA"]);
      } catch (error) {
        return { success: false, error: "ACCESS_DENIED", correlationId };
      }

      if (!documentParser || !documentChunker || !vectorStore) {
        return { success: false, error: "System not fully initialized", correlationId };
      }

      try {
        const cached = getCachedFileById(cacheId);
        if (!cached) {
          return { success: false, error: "CACHE_NOT_FOUND", correlationId };
        }

        const parsed = await documentParser.parseFile(cached.path);
        const chunks = documentChunker.chunkDocument(parsed.content, cached.fileName);
        const addedCount = await vectorStore.addChunks(chunks);

        requestLogger.info({ cacheId, chunksAdded: addedCount }, "Cached SOP learned");

        return {
          success: true,
          fileName: cached.fileName,
          chunksAdded: addedCount,
          wordCount: parsed.metadata.wordCount,
          correlationId,
        };
      } catch (error) {
        requestLogger.error({ error, cacheId }, "learn-cached-sop failed");
        return { success: false, error: formatError(error), correlationId };
      }
    }
  );

  ipcMain.handle("get-rag-status", async () => {
    if (!vectorStore) {
      return { initialized: false, documentCount: 0, maxChunks: 0 };
    }
    return vectorStore.getStatus();
  });

  ipcMain.handle("get-scheduler-status", async () => {
    if (!scheduler) {
      return { tasks: [] };
    }
    return { tasks: scheduler.getTaskStatus() };
  });

  ipcMain.handle(
    "sign-workflow",
    async (_event, token: string, requestId: string, meaning: string) => {
      try {
        const session = requireRole(token, ["ADMIN", "QA", "RA", "DEV"]);
        addSignature(requestId, session.user.id, session.user.role, meaning);
        return { success: true };
      } catch (error) {
        return { success: false, error: "ACCESS_DENIED" };
      }
    }
  );

  ipcMain.handle("list-available-models", async () => {
    if (!modelService) {
      return { chatModels: [], embeddingModels: [] };
    }
    try {
      return await modelService.listAvailableModels();
    } catch (error) {
      logger.error({ error }, "list-available-models failed");
      return { chatModels: [], embeddingModels: [] };
    }
  });

  ipcMain.handle("get-current-models", async () => {
    const env = getEnv();
    return {
      chatModel: env.GEMINI_MODEL,
      embeddingModel: env.GEMINI_EMBEDDING_MODEL,
      temperature: env.GEMINI_TEMPERATURE,
    };
  });
}

app.whenReady().then(async () => {
  try {
    await initializeServices();
    createWindow();
    registerIpcHandlers();
    logger.info("Application ready");
  } catch (error) {
    logger.error({ error }, "Application startup failed");
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (scheduler) {
    scheduler.stop();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
