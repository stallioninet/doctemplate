import type { DocumentFormat } from '@prisma/client';
import { pdfParser } from './pdfParser';
import { docxParser } from './docxParser';
import { rtfParser } from './rtfParser';
import type { SourceParser } from './types';

const parsers: SourceParser[] = [pdfParser, docxParser, rtfParser];

const byFormat = new Map<DocumentFormat, SourceParser>(parsers.map((p) => [p.format, p]));
const byMime = new Map<string, SourceParser>();
for (const p of parsers) {
  for (const mime of p.mimeTypes) byMime.set(mime, p);
}

export const getParserForFormat = (format: DocumentFormat): SourceParser | undefined =>
  byFormat.get(format);

export const getParserForMime = (mime: string): SourceParser | undefined => byMime.get(mime);

export const detectFormatFromMime = (mime: string): DocumentFormat | null =>
  byMime.get(mime)?.format ?? null;

export type { SourceParser, ParsedSource } from './types';
