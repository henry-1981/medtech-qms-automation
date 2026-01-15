import { v4 as uuidv4 } from "uuid";
import { getDb } from "./db";
import { WorkflowState } from "../workflow/state";
import { createChildLogger } from "../common";

const logger = createChildLogger("WorkflowStore");

export interface SynthesisRecord {
  summary: string;
  requiredDocuments: string[];
  nextSteps: string[];
  blockers?: string[];
}

export function saveWorkflow(state: WorkflowState): void {
  const db = getDb();

  db.prepare(
    "INSERT INTO workflows (id, request_id, description, status, final_verdict, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    uuidv4(),
    state.requestId,
    state.description,
    state.currentPhase,
    state.finalVerdict || null,
    state.createdAt,
    state.updatedAt
  );

  logger.info({ requestId: state.requestId }, "Workflow saved");
}

export function saveAgentLogs(state: WorkflowState): void {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO agent_logs (id, request_id, role, verdict, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const now = new Date().toISOString();

  state.messages.forEach((msg) => {
    stmt.run(
      uuidv4(),
      state.requestId,
      msg.agentRole,
      msg.verdict || null,
      msg.content,
      msg.timestamp || now
    );
  });

  logger.info({ requestId: state.requestId }, "Agent logs saved");
}

export function saveSynthesis(
  requestId: string,
  synthesis: SynthesisRecord
): void {
  const db = getDb();

  db.prepare(
    "INSERT INTO synthesis (id, request_id, summary, required_documents, next_steps, blockers, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    uuidv4(),
    requestId,
    synthesis.summary,
    JSON.stringify(synthesis.requiredDocuments || []),
    JSON.stringify(synthesis.nextSteps || []),
    JSON.stringify(synthesis.blockers || []),
    new Date().toISOString()
  );

  logger.info({ requestId }, "Synthesis saved");
}

export interface WorkflowHistoryRow {
  requestId: string;
  description: string;
  status: string;
  finalVerdict: string | null;
  createdAt: string;
  updatedAt: string;
}

export function listWorkflows(limit: number = 50): WorkflowHistoryRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT request_id, description, status, final_verdict, created_at, updated_at FROM workflows ORDER BY created_at DESC LIMIT ?"
    )
    .all(limit) as Array<{
    request_id: string;
    description: string;
    status: string;
    final_verdict: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    requestId: row.request_id,
    description: row.description,
    status: row.status,
    finalVerdict: row.final_verdict,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export interface AgentLogRow {
  requestId: string;
  role: string;
  verdict: string | null;
  content: string;
  createdAt: string;
}

export function listAgentLogs(requestId: string): AgentLogRow[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT request_id, role, verdict, content, created_at FROM agent_logs WHERE request_id = ? ORDER BY created_at ASC"
    )
    .all(requestId) as Array<{
    request_id: string;
    role: string;
    verdict: string | null;
    content: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    requestId: row.request_id,
    role: row.role,
    verdict: row.verdict,
    content: row.content,
    createdAt: row.created_at,
  }));
}
