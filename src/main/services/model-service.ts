import { createChildLogger, getEnv } from "../common";

const logger = createChildLogger("ModelService");

export interface GeminiModel {
  name: string;
  displayName: string;
  description: string;
  supportedGenerationMethods: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

export interface AvailableModels {
  chatModels: GeminiModel[];
  embeddingModels: GeminiModel[];
}

interface ApiModelResponse {
  models: Array<{
    name: string;
    displayName?: string;
    description?: string;
    supportedGenerationMethods?: string[];
    inputTokenLimit?: number;
    outputTokenLimit?: number;
  }>;
}

export class ModelService {
  private cachedModels: AvailableModels | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시

  async listAvailableModels(): Promise<AvailableModels> {
    const now = Date.now();
    if (this.cachedModels && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cachedModels;
    }

    const env = getEnv();
    const apiKey = env.GOOGLE_API_KEY;

    if (!apiKey) {
      logger.warn("GOOGLE_API_KEY not set, returning empty model list");
      return { chatModels: [], embeddingModels: [] };
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: ApiModelResponse = await response.json();

      const chatModels: GeminiModel[] = [];
      const embeddingModels: GeminiModel[] = [];

      for (const model of data.models) {
        const methods = model.supportedGenerationMethods || [];
        
        const geminiModel: GeminiModel = {
          name: model.name?.replace("models/", "") || "",
          displayName: model.displayName || model.name || "",
          description: model.description || "",
          supportedGenerationMethods: methods,
          inputTokenLimit: model.inputTokenLimit,
          outputTokenLimit: model.outputTokenLimit,
        };

        if (methods.includes("generateContent")) {
          chatModels.push(geminiModel);
        }

        if (methods.includes("embedContent")) {
          embeddingModels.push(geminiModel);
        }
      }

      chatModels.sort((a, b) => b.name.localeCompare(a.name));
      embeddingModels.sort((a, b) => b.name.localeCompare(a.name));

      this.cachedModels = { chatModels, embeddingModels };
      this.cacheTimestamp = now;

      logger.info(
        { chatCount: chatModels.length, embeddingCount: embeddingModels.length },
        "Models fetched from API"
      );

      return this.cachedModels;
    } catch (error) {
      logger.error({ error }, "Failed to fetch models from API");
      return {
        chatModels: [
          {
            name: "gemini-2.0-flash",
            displayName: "Gemini 2.0 Flash",
            description: "Fast and versatile model",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "gemini-1.5-pro",
            displayName: "Gemini 1.5 Pro",
            description: "Best for complex tasks",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "gemini-1.5-flash",
            displayName: "Gemini 1.5 Flash",
            description: "Fast responses",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
        embeddingModels: [
          {
            name: "text-embedding-004",
            displayName: "Text Embedding 004",
            description: "Latest embedding model",
            supportedGenerationMethods: ["embedContent"],
          },
          {
            name: "embedding-001",
            displayName: "Embedding 001",
            description: "Standard embedding model",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      };
    }
  }

  clearCache(): void {
    this.cachedModels = null;
    this.cacheTimestamp = 0;
  }
}
