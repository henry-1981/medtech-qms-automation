import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { DocumentParseError, createChildLogger } from "../common";

const logger = createChildLogger("DocumentParser");

export interface ParsedDocument {
  fileName: string;
  fileType: "pdf" | "docx" | "unknown";
  content: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    extractedAt: string;
  };
}

export class DocumentParser {
  async parseFile(filePath: string): Promise<ParsedDocument> {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    logger.info({ filePath, ext }, "Parsing file");

    if (ext === ".pdf") {
      return this.parsePdf(filePath, fileName);
    } else if (ext === ".docx") {
      return this.parseDocx(filePath, fileName);
    }

    throw new DocumentParseError(`Unsupported file type: ${ext}`);
  }

  private async parsePdf(
    filePath: string,
    fileName: string
  ): Promise<ParsedDocument> {
    try {
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = pdfParseModule.default || pdfParseModule;
      const dataBuffer = fs.readFileSync(filePath);

      const data = await (pdfParse as unknown as (buffer: Buffer) => Promise<{
        text: string;
        numpages: number;
      }>)(dataBuffer);

      logger.info({ fileName, pages: data.numpages }, "PDF parsed");

      return {
        fileName,
        fileType: "pdf",
        content: data.text,
        metadata: {
          pageCount: data.numpages,
          wordCount: this.countWords(data.text),
          extractedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error({ error, filePath }, "PDF parse failed");
      throw new DocumentParseError(`Failed to parse PDF: ${fileName}`, error);
    }
  }

  private async parseDocx(
    filePath: string,
    fileName: string
  ): Promise<ParsedDocument> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      const content = result.value;

      logger.info({ fileName, words: this.countWords(content) }, "Docx parsed");

      return {
        fileName,
        fileType: "docx",
        content,
        metadata: {
          wordCount: this.countWords(content),
          extractedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error({ error, filePath }, "Docx parse failed");
      throw new DocumentParseError(`Failed to parse Docx: ${fileName}`, error);
    }
  }

  async parseBuffer(
    buffer: Buffer,
    fileName: string
  ): Promise<ParsedDocument> {
    const ext = path.extname(fileName).toLowerCase();

    logger.info({ fileName, ext, size: buffer.length }, "Parsing buffer");

    try {
      if (ext === ".pdf") {
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = pdfParseModule.default || pdfParseModule;

        const data = await (pdfParse as unknown as (buffer: Buffer) => Promise<{
          text: string;
          numpages: number;
        }>)(buffer);

        return {
          fileName,
          fileType: "pdf",
          content: data.text,
          metadata: {
            pageCount: data.numpages,
            wordCount: this.countWords(data.text),
            extractedAt: new Date().toISOString(),
          },
        };
      } else if (ext === ".docx") {
        const result = await mammoth.extractRawText({ buffer });
        return {
          fileName,
          fileType: "docx",
          content: result.value,
          metadata: {
            wordCount: this.countWords(result.value),
            extractedAt: new Date().toISOString(),
          },
        };
      }

      throw new DocumentParseError(`Unsupported file type: ${ext}`);
    } catch (error) {
      if (error instanceof DocumentParseError) throw error;
      logger.error({ error, fileName }, "Buffer parse failed");
      throw new DocumentParseError(`Failed to parse buffer: ${fileName}`, error);
    }
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}
