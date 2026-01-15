import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import fs from "fs";
import path from "path";
import { createChildLogger, QmsError } from "../common";

const logger = createChildLogger("DocxGenerator");

export class TemplateError extends QmsError {
  constructor(message: string, cause?: unknown) {
    super(message, "TEMPLATE_ERROR", cause);
    this.name = "TemplateError";
  }
}

export interface TemplateData {
  [key: string]: string | number | boolean | string[] | TemplateData | TemplateData[];
}

export interface GeneratedDocument {
  fileName: string;
  buffer: Buffer;
  generatedAt: string;
}

export class DocxGenerator {
  async generateFromTemplate(
    templatePath: string,
    data: TemplateData,
    outputFileName: string
  ): Promise<GeneratedDocument> {
    logger.info({ templatePath, outputFileName }, "Generating document");

    try {
      const templateBuffer = fs.readFileSync(templatePath);
      const zip = new PizZip(templateBuffer);

      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
      });

      doc.render(data);

      const buffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });

      logger.info({ outputFileName, size: buffer.length }, "Document generated");

      return {
        fileName: outputFileName,
        buffer,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error, templatePath }, "Template generation failed");
      throw new TemplateError(`Failed to generate document: ${outputFileName}`, error);
    }
  }

  async generateFromBuffer(
    templateBuffer: Buffer,
    data: TemplateData,
    outputFileName: string
  ): Promise<GeneratedDocument> {
    try {
      const zip = new PizZip(templateBuffer);

      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
      });

      doc.render(data);

      const buffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });

      return {
        fileName: outputFileName,
        buffer,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error }, "Buffer template generation failed");
      throw new TemplateError(`Failed to generate document from buffer`, error);
    }
  }

  async saveDocument(doc: GeneratedDocument, outputDir: string): Promise<string> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, doc.fileName);
    fs.writeFileSync(outputPath, doc.buffer);

    logger.info({ outputPath }, "Document saved");
    return outputPath;
  }
}
