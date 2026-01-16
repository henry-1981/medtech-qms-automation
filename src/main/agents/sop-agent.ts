import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { SopVectorStore } from "../doc-engine";
import {
  AgentError,
  createChildLogger,
  withTimeout,
  getEnv,
} from "../common";

const logger = createChildLogger("SopAgent");

export interface SopQueryResult {
  answer: string;
  sources: string[];
}

export class SopAgent {
  private model: ChatGoogleGenerativeAI;
  private vectorStore: SopVectorStore | null = null;

  constructor() {
    const env = getEnv();
    this.model = new ChatGoogleGenerativeAI({
      model: env.GEMINI_MODEL,
      temperature: env.GEMINI_TEMPERATURE,
    });
  }

  setVectorStore(store: SopVectorStore): void {
    this.vectorStore = store;
  }

  async queryProcedure(question: string): Promise<SopQueryResult> {
    if (!this.vectorStore) {
      return {
        answer: "SOP 문서가 로드되지 않았습니다. 먼저 문서를 학습시켜 주세요.",
        sources: [],
      };
    }

    try {
      const context = await this.vectorStore.searchWithContext(question, 4);
      const searchResults = await this.vectorStore.search(question, 4);

      const systemPrompt = `
당신은 의료기기 품질경영시스템(QMS) SOP 전문가입니다.
아래 제공된 SOP 문서 내용을 바탕으로 사용자의 질문에 답변하세요.

[SOP 문서 내용]
${context}

답변 지침:
1. 반드시 제공된 SOP 내용에 근거하여 답변하세요.
2. SOP에 없는 내용은 추측하지 마세요.
3. 관련 조항 번호나 섹션을 명시하세요.
4. 실행해야 할 절차가 있다면 단계별로 나열하세요.
`;

      const { LLM_TIMEOUT_MS } = getEnv();
      const response = await withTimeout(
        this.model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(question),
        ]),
        LLM_TIMEOUT_MS,
        "SOP 질의응답"
      );

      const sources = [...new Set(searchResults.map((r) => r.sourceFile))];

      logger.info({ question, sources }, "SOP query completed");

      return {
        answer: response.content.toString(),
        sources,
      };
    } catch (error) {
      logger.error({ error, question }, "SOP query failed");
      throw new AgentError("SOP 조회 중 오류가 발생했습니다", error);
    }
  }
}
