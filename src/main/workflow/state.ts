import { z } from "zod";

export const agentMessageSchema = z.object({
  agentId: z.string(),
  agentRole: z.enum(["SOP_MANAGER", "RA_EXPERT", "QA_EXPERT", "DEV_EXPERT"]),
  content: z.string(),
  verdict: z.enum(["PASS", "WARNING", "BLOCK", "NEEDS_INFO"]).optional(),
  timestamp: z.string(),
});

export type AgentMessage = z.infer<typeof agentMessageSchema>;

export const workflowStateSchema = z.object({
  requestId: z.string(),
  requestType: z.enum(["DESIGN_CHANGE", "NEW_FEATURE", "DOCUMENT_REVIEW"]),
  description: z.string(),
  currentPhase: z.enum([
    "INITIATED",
    "RA_REVIEW",
    "QA_REVIEW",
    "DEV_REVIEW",
    "SYNTHESIS",
    "DOCUMENT_GENERATION",
    "COMPLETED",
    "BLOCKED",
  ]),
  messages: z.array(agentMessageSchema),
  raVerdict: z.enum(["PASS", "WARNING", "BLOCK"]).optional(),
  qaVerdict: z.enum(["PASS", "WARNING", "BLOCK"]).optional(),
  devVerdict: z.enum(["PASS", "WARNING", "BLOCK"]).optional(),
  finalVerdict: z.enum(["APPROVED", "REJECTED", "NEEDS_REVIEW"]).optional(),
  requiredDocuments: z.array(z.string()).default([]),
  generatedDocuments: z.array(z.string()).default([]),
  missingInfo: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WorkflowState = z.infer<typeof workflowStateSchema>;

export function createInitialState(
  requestId: string,
  requestType: WorkflowState["requestType"],
  description: string
): WorkflowState {
  const now = new Date().toISOString();
  return {
    requestId,
    requestType,
    description,
    currentPhase: "INITIATED",
    messages: [],
    requiredDocuments: [],
    generatedDocuments: [],
    missingInfo: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addMessage(
  state: WorkflowState,
  message: Omit<AgentMessage, "timestamp">
): WorkflowState {
  return {
    ...state,
    messages: [
      ...state.messages,
      { ...message, timestamp: new Date().toISOString() },
    ],
    updatedAt: new Date().toISOString(),
  };
}
