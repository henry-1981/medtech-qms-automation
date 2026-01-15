import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { Document } from "@langchain/core/documents";
import { DocumentChunk } from "./chunker";
import { VectorStoreError, createChildLogger } from "../common";

const logger = createChildLogger("VectorStore");

const MAX_CHUNKS = 10000;
const PRUNE_TARGET = 8000;

export interface SearchResult {
  content: string;
  sourceFile: string;
  sectionHeader?: string;
  score: number;
}

interface StoredChunkMeta {
  id: string;
  sourceFile: string;
  addedAt: number;
}

export class SopVectorStore {
  private embeddings: GoogleGenerativeAIEmbeddings;
  private vectorStore: MemoryVectorStore | null = null;
  private isInitialized = false;
  private documentCount = 0;
  private chunkMeta: StoredChunkMeta[] = [];

  constructor() {
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      model: "embedding-001",
    });
  }

  async initialize(): Promise<void> {
    this.vectorStore = new MemoryVectorStore(this.embeddings);
    this.isInitialized = true;
    logger.info("Vector store initialized");
  }

  async addChunks(chunks: DocumentChunk[]): Promise<number> {
    if (!this.isInitialized || !this.vectorStore) {
      await this.initialize();
    }

    if (this.documentCount + chunks.length > MAX_CHUNKS) {
      logger.warn(
        { current: this.documentCount, incoming: chunks.length },
        "Max chunks exceeded, pruning old data"
      );
      await this.pruneOldChunks();
    }

    const documents = chunks.map(
      (chunk) =>
        new Document({
          pageContent: chunk.content,
          metadata: {
            id: chunk.id,
            sourceFile: chunk.sourceFile,
            chunkIndex: chunk.chunkIndex,
            sectionHeader: chunk.metadata.sectionHeader,
          },
        })
    );

    try {
      await this.vectorStore!.addDocuments(documents);

      const now = Date.now();
      chunks.forEach((chunk) => {
        this.chunkMeta.push({
          id: chunk.id,
          sourceFile: chunk.sourceFile,
          addedAt: now,
        });
      });

      this.documentCount += documents.length;
      logger.info(
        { added: documents.length, total: this.documentCount },
        "Chunks added"
      );
      return documents.length;
    } catch (e) {
      logger.error({ error: e }, "Failed to add chunks");
      throw new VectorStoreError("Failed to add documents to vector store", e);
    }
  }

  private async pruneOldChunks(): Promise<void> {
    logger.info(
      { target: PRUNE_TARGET },
      "Pruning vector store to target size"
    );

    this.chunkMeta.sort((a, b) => a.addedAt - b.addedAt);
    const toRemove = this.documentCount - PRUNE_TARGET;

    if (toRemove > 0) {
      this.chunkMeta = this.chunkMeta.slice(toRemove);
      this.documentCount = this.chunkMeta.length;

      this.vectorStore = new MemoryVectorStore(this.embeddings);
      logger.info({ removed: toRemove, remaining: this.documentCount }, "Pruned old chunks");
    }
  }

  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    if (!this.vectorStore) {
      throw new VectorStoreError("Vector store not initialized");
    }

    try {
      const results = await this.vectorStore.similaritySearchWithScore(
        query,
        topK
      );

      return results.map((result) => ({
        content: result[0].pageContent,
        sourceFile: result[0].metadata.sourceFile as string,
        sectionHeader: result[0].metadata.sectionHeader as string | undefined,
        score: result[1],
      }));
    } catch (e) {
      logger.error({ error: e, query }, "Search failed");
      throw new VectorStoreError("Vector search failed", e);
    }
  }

  async searchWithContext(query: string, topK: number = 3): Promise<string> {
    const results = await this.search(query, topK);

    if (results.length === 0) {
      return "관련 SOP 문서를 찾을 수 없습니다.";
    }

    const contextParts = results.map((result, idx) => {
      const header = result.sectionHeader
        ? `[${result.sectionHeader}]`
        : `[섹션 ${idx + 1}]`;
      return `${header} (출처: ${result.sourceFile})\n${result.content}`;
    });

    return contextParts.join("\n\n---\n\n");
  }

  getStatus(): {
    initialized: boolean;
    documentCount: number;
    maxChunks: number;
  } {
    return {
      initialized: this.isInitialized,
      documentCount: this.documentCount,
      maxChunks: MAX_CHUNKS,
    };
  }

  async clear(): Promise<void> {
    this.vectorStore = null;
    this.isInitialized = false;
    this.documentCount = 0;
    this.chunkMeta = [];
    await this.initialize();
    logger.info("Vector store cleared");
  }
}
