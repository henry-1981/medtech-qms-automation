import { WorkflowState } from "../workflow/state";
import { TemplateData } from "./docx-generator";

export interface DesignChangeDocData extends TemplateData {
  documentNumber: string;
  documentTitle: string;
  requestDate: string;
  requestor: string;
  changeDescription: string;
  changeReason: string;
  impactAnalysis: {
    regulatory: string;
    quality: string;
    technical: string;
  };
  riskAssessment: string;
  requiredDocuments: string[];
  approvalStatus: string;
  reviewComments: Array<{
    reviewer: string;
    role: string;
    verdict: string;
    comment: string;
    date: string;
  }>;
  nextSteps: string[];
}

export function createDesignChangeDocData(
  state: WorkflowState,
  requestor: string = "시스템"
): DesignChangeDocData {
  const docNumber = `ECO-${new Date().getFullYear()}-${state.requestId.slice(0, 8).toUpperCase()}`;

  const raMessage = state.messages.find((m) => m.agentRole === "RA_EXPERT");
  const qaMessage = state.messages.find((m) => m.agentRole === "QA_EXPERT");
  const devMessage = state.messages.find((m) => m.agentRole === "DEV_EXPERT");

  const reviewComments = state.messages
    .filter((m) => m.agentRole !== "SOP_MANAGER")
    .map((m) => ({
      reviewer: getRoleKoreanName(m.agentRole),
      role: m.agentRole,
      verdict: m.verdict || "N/A",
      comment: m.content,
      date: new Date(m.timestamp).toLocaleDateString("ko-KR"),
    }));

  return {
    documentNumber: docNumber,
    documentTitle: "설계변경요청서 (Engineering Change Order)",
    requestDate: new Date(state.createdAt).toLocaleDateString("ko-KR"),
    requestor,
    changeDescription: state.description,
    changeReason: "기능 개선 및 사용자 요구사항 반영",
    impactAnalysis: {
      regulatory: raMessage?.content || "검토 대기",
      quality: qaMessage?.content || "검토 대기",
      technical: devMessage?.content || "검토 대기",
    },
    riskAssessment: determineRiskLevel(state),
    requiredDocuments: state.requiredDocuments,
    approvalStatus: mapFinalVerdictToKorean(state.finalVerdict),
    reviewComments,
    nextSteps: extractNextSteps(state),
  };
}

function getRoleKoreanName(role: string): string {
  const roleMap: Record<string, string> = {
    RA_EXPERT: "규제 담당자",
    QA_EXPERT: "품질 책임자",
    DEV_EXPERT: "개발 팀장",
    SOP_MANAGER: "프로세스 관리자",
  };
  return roleMap[role] || role;
}

function mapFinalVerdictToKorean(
  verdict: WorkflowState["finalVerdict"]
): string {
  const verdictMap: Record<string, string> = {
    APPROVED: "승인",
    REJECTED: "반려",
    NEEDS_REVIEW: "조건부 승인 (추가 검토 필요)",
  };
  return verdict ? verdictMap[verdict] || verdict : "검토 중";
}

function determineRiskLevel(state: WorkflowState): string {
  if (state.raVerdict === "BLOCK" || state.qaVerdict === "BLOCK") {
    return "높음 (High) - 즉각적인 조치 필요";
  }
  if (
    state.raVerdict === "WARNING" ||
    state.qaVerdict === "WARNING" ||
    state.devVerdict === "WARNING"
  ) {
    return "중간 (Medium) - 주의 필요";
  }
  return "낮음 (Low) - 일반 절차 진행";
}

function extractNextSteps(state: WorkflowState): string[] {
  const steps: string[] = [];

  if (state.finalVerdict === "APPROVED") {
    steps.push("설계 문서 업데이트");
    steps.push("변경 사항 구현");
    steps.push("검증 테스트 수행");
    steps.push("문서 최종 승인 및 배포");
  } else if (state.finalVerdict === "NEEDS_REVIEW") {
    steps.push("지적 사항 보완");
    steps.push("재검토 요청");
  } else if (state.finalVerdict === "REJECTED") {
    steps.push("변경 요청 재검토 또는 취소");
    steps.push("대안 검토");
  }

  if (state.missingInfo.length > 0) {
    steps.push(`추가 정보 제출: ${state.missingInfo.join(", ")}`);
  }

  return steps;
}
