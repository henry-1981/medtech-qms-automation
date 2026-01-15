import { v4 as uuidv4 } from "uuid";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { RaExpertV2, QaExpert, DevExpert, ExpertResponse } from "../agents/rnr-axis";
import { SopVectorStore } from "../doc-engine";
import { createChildLogger, parseJsonSafely } from "../common";
import {
  WorkflowState,
  createInitialState,
  addMessage,
  AgentMessage,
} from "./state";
import { z } from "zod";

const logger = createChildLogger("Orchestrator");

const synthesisResultSchema = z.object({
  finalVerdict: z.enum(["APPROVED", "REJECTED", "NEEDS_REVIEW"]),
  summary: z.string(),
  requiredDocuments: z.array(z.string()),
  nextSteps: z.array(z.string()),
  blockers: z.array(z.string()).optional(),
});

type SynthesisResult = z.infer<typeof synthesisResultSchema>;

export interface OrchestratorResult {
  state: WorkflowState;
  synthesis: SynthesisResult | null;
}

export class DesignChangeOrchestrator {
  private raExpert: RaExpertV2;
  private qaExpert: QaExpert;
  private devExpert: DevExpert;
  private synthesizer: ChatGoogleGenerativeAI;
  private vectorStore: SopVectorStore | null = null;

  constructor() {
    this.raExpert = new RaExpertV2();
    this.qaExpert = new QaExpert();
    this.devExpert = new DevExpert();
    this.synthesizer = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-pro",
      temperature: 0.2,
    });
  }

  setVectorStore(store: SopVectorStore): void {
    this.vectorStore = store;
    this.raExpert.setVectorStore(store);
    this.qaExpert.setVectorStore(store);
    this.devExpert.setVectorStore(store);
  }

  async processDesignChange(description: string): Promise<OrchestratorResult> {
    const requestId = uuidv4();
    let state = createInitialState(requestId, "DESIGN_CHANGE", description);

    logger.info({ requestId, description }, "Starting design change workflow");

    state = addMessage(state, {
      agentId: "orchestrator",
      agentRole: "SOP_MANAGER",
      content: `설계 변경 요청 접수: ${description}`,
    });

    state = { ...state, currentPhase: "RA_REVIEW" };
    const raResult = await this.raExpert.analyze(description);
    state = this.processExpertResult(state, "RA_EXPERT", raResult);
    state = { ...state, raVerdict: this.mapVerdict(raResult.verdict) };

    if (raResult.verdict === "BLOCK") {
      state = { ...state, currentPhase: "BLOCKED" };
      return {
        state,
        synthesis: {
          finalVerdict: "REJECTED",
          summary: "RA 검토에서 규제 위반 발견으로 진행 불가",
          requiredDocuments: [],
          nextSteps: raResult.recommendations,
          blockers: raResult.findings,
        },
      };
    }

    state = { ...state, currentPhase: "QA_REVIEW" };
    const qaResult = await this.qaExpert.analyze(description);
    state = this.processExpertResult(state, "QA_EXPERT", qaResult);
    state = { ...state, qaVerdict: this.mapVerdict(qaResult.verdict) };

    state = { ...state, currentPhase: "DEV_REVIEW" };
    const devResult = await this.devExpert.analyze(description);
    state = this.processExpertResult(state, "DEV_EXPERT", devResult);
    state = { ...state, devVerdict: this.mapVerdict(devResult.verdict) };

    state = { ...state, currentPhase: "SYNTHESIS" };
    const synthesis = await this.synthesizeResults(state, raResult, qaResult, devResult);

    state = {
      ...state,
      currentPhase: synthesis.finalVerdict === "REJECTED" ? "BLOCKED" : "COMPLETED",
      finalVerdict: synthesis.finalVerdict,
      requiredDocuments: synthesis.requiredDocuments,
    };

    state = addMessage(state, {
      agentId: "orchestrator",
      agentRole: "SOP_MANAGER",
      content: `최종 판정: ${synthesis.finalVerdict}\n${synthesis.summary}`,
    });

    logger.info(
      { requestId, finalVerdict: synthesis.finalVerdict },
      "Workflow completed"
    );

    return { state, synthesis };
  }

  private processExpertResult(
    state: WorkflowState,
    role: AgentMessage["agentRole"],
    result: ExpertResponse
  ): WorkflowState {
    const content = [
      `판정: ${result.verdict}`,
      `발견사항: ${result.findings.join(", ")}`,
      `권고: ${result.recommendations.join(", ")}`,
    ].join("\n");

    state = addMessage(state, {
      agentId: role.toLowerCase(),
      agentRole: role,
      content,
      verdict: result.verdict,
    });

    if (result.missingInfo && result.missingInfo.length > 0) {
      state = {
        ...state,
        missingInfo: [...state.missingInfo, ...result.missingInfo],
      };
    }

    return state;
  }

  private mapVerdict(
    verdict: ExpertResponse["verdict"]
  ): "PASS" | "WARNING" | "BLOCK" {
    if (verdict === "NEEDS_INFO") return "WARNING";
    return verdict;
  }

  private async synthesizeResults(
    state: WorkflowState,
    raResult: ExpertResponse,
    qaResult: ExpertResponse,
    devResult: ExpertResponse
  ): Promise<SynthesisResult> {
    const systemPrompt = `
당신은 의료기기 QMS 설계 변경 프로세스의 최종 결정자입니다.
각 전문가(RA, QA, Dev)의 검토 결과를 종합하여 최종 판정을 내리세요.

[RA(규제) 검토 결과]
판정: ${raResult.verdict}
발견사항: ${raResult.findings.join(", ")}
권고: ${raResult.recommendations.join(", ")}

[QA(품질) 검토 결과]
판정: ${qaResult.verdict}
발견사항: ${qaResult.findings.join(", ")}
권고: ${qaResult.recommendations.join(", ")}

[Dev(개발) 검토 결과]
판정: ${devResult.verdict}
발견사항: ${devResult.findings.join(", ")}
권고: ${devResult.recommendations.join(", ")}

[판정 기준]
- APPROVED: 모든 전문가가 PASS 또는 경미한 WARNING
- NEEDS_REVIEW: WARNING이 있어 추가 검토/수정 필요
- REJECTED: 하나 이상의 BLOCK 또는 심각한 문제

JSON 형식으로 응답하세요:
{
  "finalVerdict": "APPROVED" | "REJECTED" | "NEEDS_REVIEW",
  "summary": "종합 판정 사유",
  "requiredDocuments": ["작성해야 할 문서 목록"],
  "nextSteps": ["다음 단계"],
  "blockers": ["진행 차단 사유 (있는 경우)"]
}
`;

    try {
      const response = await this.synthesizer.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`설계 변경 내용: ${state.description}`),
      ]);

      const content = response.content.toString();
      const parsed = parseJsonSafely(content, synthesisResultSchema);

      if (parsed) return parsed;

      return this.createFallbackSynthesis(raResult, qaResult, devResult);
    } catch (error) {
      logger.error({ error }, "Synthesis failed");
      return this.createFallbackSynthesis(raResult, qaResult, devResult);
    }
  }

  private createFallbackSynthesis(
    raResult: ExpertResponse,
    qaResult: ExpertResponse,
    devResult: ExpertResponse
  ): SynthesisResult {
    const hasBlock = [raResult, qaResult, devResult].some(
      (r) => r.verdict === "BLOCK"
    );
    const hasWarning = [raResult, qaResult, devResult].some(
      (r) => r.verdict === "WARNING" || r.verdict === "NEEDS_INFO"
    );

    return {
      finalVerdict: hasBlock
        ? "REJECTED"
        : hasWarning
        ? "NEEDS_REVIEW"
        : "APPROVED",
      summary: "자동 종합 판정 (LLM 응답 파싱 실패)",
      requiredDocuments: ["설계변경요청서", "위험분석서"],
      nextSteps: ["상세 검토 후 문서 작성"],
      blockers: hasBlock ? ["전문가 검토에서 차단 의견 존재"] : [],
    };
  }
}
