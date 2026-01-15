import { v4 as uuidv4 } from 'uuid';

export interface DocumentChunk {
  id: string;
  content: string;
  sourceFile: string;
  chunkIndex: number;
  metadata: {
    startChar: number;
    endChar: number;
    sectionHeader?: string;
  };
}

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
  preserveSections: boolean;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  preserveSections: true,
};

const SECTION_PATTERNS = [
  /^#{1,6}\s+.+$/gm,                    // Markdown headers
  /^\d+\.[\d.]*\s+.+$/gm,               // Numbered sections (1. 1.1 1.1.1)
  /^[가-힣]+\s*\d*\.\s*.+$/gm,          // Korean headers (제1조, 항목1.)
  /^(제\s*\d+\s*조|제\s*\d+\s*항)/gm,   // Korean legal format
];

export class DocumentChunker {
  private options: ChunkingOptions;

  constructor(options: Partial<ChunkingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  chunkDocument(text: string, sourceFile: string): DocumentChunk[] {
    if (this.options.preserveSections) {
      return this.chunkBySections(text, sourceFile);
    }
    return this.chunkBySize(text, sourceFile);
  }

  private chunkBySections(text: string, sourceFile: string): DocumentChunk[] {
    const sections = this.splitIntoSections(text);
    const chunks: DocumentChunk[] = [];
    let currentPosition = 0;

    sections.forEach((section, sectionIdx) => {
      const sectionChunks = this.chunkBySize(section.content, sourceFile, section.header);

      sectionChunks.forEach((chunk, idx) => {
        chunks.push({
          ...chunk,
          chunkIndex: chunks.length,
          metadata: {
            ...chunk.metadata,
            startChar: currentPosition + chunk.metadata.startChar,
            endChar: currentPosition + chunk.metadata.endChar,
            sectionHeader: section.header,
          },
        });
      });

      currentPosition += section.content.length;
    });

    return chunks;
  }

  private splitIntoSections(text: string): Array<{ header?: string; content: string }> {
    let combinedPattern = SECTION_PATTERNS.map(p => p.source).join('|');
    let sectionRegex = new RegExp(`(${combinedPattern})`, 'gm');

    const matches = [...text.matchAll(sectionRegex)];

    if (matches.length === 0) {
      return [{ content: text }];
    }

    const sections: Array<{ header?: string; content: string }> = [];

    if (matches[0].index! > 0) {
      sections.push({ content: text.substring(0, matches[0].index) });
    }

    matches.forEach((match, idx) => {
      const start = match.index!;
      const end = idx < matches.length - 1 ? matches[idx + 1].index! : text.length;
      sections.push({
        header: match[0].trim(),
        content: text.substring(start, end),
      });
    });

    return sections;
  }

  private chunkBySize(
    text: string,
    sourceFile: string,
    sectionHeader?: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + this.options.chunkSize, text.length);

      if (end < text.length) {
        const breakPoint = this.findBreakPoint(text, end);
        if (breakPoint > start) {
          end = breakPoint;
        }
      }

      const content = text.substring(start, end).trim();

      if (content.length > 0) {
        chunks.push({
          id: uuidv4(),
          content,
          sourceFile,
          chunkIndex: chunks.length,
          metadata: {
            startChar: start,
            endChar: end,
            sectionHeader,
          },
        });
      }

      start = end - this.options.chunkOverlap;
      if (start >= text.length - this.options.chunkOverlap) break;
    }

    return chunks;
  }

  private findBreakPoint(text: string, position: number): number {
    const searchWindow = 100;
    const searchStart = Math.max(0, position - searchWindow);
    const searchText = text.substring(searchStart, position);

    const paragraphBreak = searchText.lastIndexOf('\n\n');
    if (paragraphBreak !== -1) return searchStart + paragraphBreak + 2;

    const sentenceBreak = searchText.search(/[.!?]\s+[A-Z가-힣]/);
    if (sentenceBreak !== -1) return searchStart + sentenceBreak + 2;

    const lineBreak = searchText.lastIndexOf('\n');
    if (lineBreak !== -1) return searchStart + lineBreak + 1;

    return position;
  }
}
