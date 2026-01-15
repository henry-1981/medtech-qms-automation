import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { SopVectorStore } from "../../doc-engine";
import { createChildLogger, parseJsonSafely } from "../../common";
import { z } from "zod";

const logger = createChildLogger("BaseExpert");

export const expertResponseSchema = z.object({
  verdict: z.enum(["PASS", "WARNING", "BLOCK", "NEEDS_INFO"]),
  findings: z.array(z.string()),
  recommendations: z.array(z.string()),
  missingInfo: z.array(z.string()).optional(),
  referencedSections: z.array(z.string()).optional(),
});

export type ExpertResponse = z.infer<typeof expertResponseSchema>;

export abstract class BaseExpert {
  protected model: ChatGoogleGenerativeAI;
  protected vectorStore: SopVectorStore | null = null;
  protected abstract readonly role: string;
  protected abstract readonly systemPromptBase: string;

  constructor() {
    this.model = new ChatGoogleGenerativeAI({
      model: "gemini-1.5-pro",
      temperature: 0.1,
    });
  }

  setVectorStore(store: SopVectorStore): void {
    this.vectorStore = store;
  }

  protected async getSopContext(query: string): Promise<string> {
    if (!this.vectorStore) return "";

    try {
      return await this.vectorStore.searchWithContext(query, 3);
    } catch (e) {
      logger.warn({ error: e, role: this.role }, "SOP search failed");
      return "";
    }
  }

  async analyze(
    description: string,
    additionalContext?: string
  ): Promise<ExpertResponse> {
    const sopContext = await this.getSopContext(
      `${this.role} ${description}`
    );

    const systemPrompt = `
${this.systemPromptBase}

${sopContext ? `[참조 SOP 문서]\n${sopContext}\n` : ""}

${additionalContext ? `[추가 컨텍스트]\n${additionalContext}\n` : ""}

분석 후 반드시 다음 JSON 형식으로만 답변하십시오:
{
  "verdict": "PASS" | "WARNING" | "BLOCK" | "NEEDS_INFO",
  "findings": ["발견사항1", "발견사항2"],
  "recommendations": ["권고사항1", "권고사항2"],
  "missingInfo": ["필요한 추가 정보가 있다면 기재"],
  "referencedSections": ["참조한 SOP 섹션"]
}
`;

    try {
      logger.info({ role: this.role, description }, "Starting analysis");

      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(`[분석 요청]\n${description}`),
      ]);

      const content = response.content.toString();
      const parsed = parseJsonSafely(content, expertResponseSchema);

      if (parsed) {
        logger.info({ role: this.role, verdict: parsed.verdict }, "Analysis complete");
        return parsed;
      }

      return this.createFallbackResponse("응답 파싱 실패");
    } catch (error) {
      logger.error({ error, role: this.role }, "Analysis failed");
      return this.createFallbackResponse("분석 중 오류 발생");
    }
  }

  private createFallbackResponse(reason: string): ExpertResponse {
    return {
      verdict: "NEEDS_INFO",
      findings: [reason],
      recommendations: ["수동 검토 필요"],
      missingInfo: [],
      referencedSections: [],
    };
  }
}
