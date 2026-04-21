import type { DocumentFormat } from '@prisma/client';

export interface ParsedSource {
  html: string;
}

export interface SourceParser {
  readonly format: DocumentFormat;
  readonly mimeTypes: readonly string[];
  parse(buffer: Buffer): Promise<ParsedSource>;
}
