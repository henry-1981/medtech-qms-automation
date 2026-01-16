import { contextBridge, ipcRenderer } from "electron";

const api = {
  login: (username: string, password: string) =>
    ipcRenderer.invoke("login", username, password),

  logout: (token: string) => ipcRenderer.invoke("logout", token),

  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    ipcRenderer.invoke("change-password", token, currentPassword, newPassword),

  getCurrentUser: (token: string) =>
    ipcRenderer.invoke("get-current-user", token),

  listUsers: (token: string) => ipcRenderer.invoke("list-users", token),

  createUser: (token: string, username: string, password: string, role: string) =>
    ipcRenderer.invoke("create-user", token, username, password, role),

  listHistory: (token: string) => ipcRenderer.invoke("list-history", token),

  listSecurityEvents: (token: string) => ipcRenderer.invoke("list-security-events", token),

  appendReleaseRow: (token: string, input: unknown) =>
    ipcRenderer.invoke("append-release-row", token, input),

  appendVvRow: (token: string, input: unknown) =>
    ipcRenderer.invoke("append-vv-row", token, input),

  getWorkflowLogs: (token: string, requestId: string) =>
    ipcRenderer.invoke("get-workflow-logs", token, requestId),

  analyzeChange: (description: string) =>
    ipcRenderer.invoke("analyze-change", description),

  runFullWorkflow: (token: string, description: string, sheetInputs?: { release?: unknown; vv?: unknown }) =>
    ipcRenderer.invoke("run-full-workflow", token, description, sheetInputs),

  querySop: (question: string) => ipcRenderer.invoke("query-sop", question),

  connectDrive: (token: string) => ipcRenderer.invoke("connect-drive", token),

  listSops: () => ipcRenderer.invoke("list-sops"),

  learnSop: (token: string, fileId: string, fileName: string) =>
    ipcRenderer.invoke("learn-sop", token, fileId, fileName),

  learnCachedSop: (token: string, cacheId: string) =>
    ipcRenderer.invoke("learn-cached-sop", token, cacheId),

  getRagStatus: () => ipcRenderer.invoke("get-rag-status"),

  getSchedulerStatus: () => ipcRenderer.invoke("get-scheduler-status"),

  signWorkflow: (token: string, requestId: string, meaning: string) =>
    ipcRenderer.invoke("sign-workflow", token, requestId, meaning),

  listAvailableModels: () => ipcRenderer.invoke("list-available-models"),

  getCurrentModels: () => ipcRenderer.invoke("get-current-models"),

  onDriveStatus: (
    callback: (status: { connected: boolean; error?: string }) => void
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      status: { connected: boolean; error?: string }
    ) => {
      callback(status);
    };
    ipcRenderer.on("drive-status", handler);
    return () => ipcRenderer.removeListener("drive-status", handler);
  },

  onWorkflowUpdate: (
    callback: (update: { requestId: string; phase: string; message: string }) => void
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      update: { requestId: string; phase: string; message: string }
    ) => {
      callback(update);
    };
    ipcRenderer.on("workflow-update", handler);
    return () => ipcRenderer.removeListener("workflow-update", handler);
  },
};

export type QmsApi = typeof api;

contextBridge.exposeInMainWorld("qmsApi", api);
