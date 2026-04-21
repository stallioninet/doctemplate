import type { DocumentFormat } from '@prisma/client';

export interface GenerationContext {
  documentId: string;
  documentName: string;
}

export interface FormatAdapter {
  readonly format: DocumentFormat;
  readonly extension: string;
  readonly mimeType: string;
  generate(html: string, context: GenerationContext): Promise<Buffer>;
  /** Release long-lived resources (e.g. Puppeteer browser). Called on shutdown. */
  shutdown?(): Promise<void>;
}
