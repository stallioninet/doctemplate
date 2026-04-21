import type { DocumentFormat } from '@prisma/client';
import { pdfAdapter } from './pdfAdapter';
import { docxAdapter } from './docxAdapter';
import { rtfAdapter } from './rtfAdapter';
import type { FormatAdapter } from './types';

const adapters: FormatAdapter[] = [pdfAdapter, docxAdapter, rtfAdapter];
const byFormat = new Map<DocumentFormat, FormatAdapter>(adapters.map((a) => [a.format, a]));

export const getAdapter = (format: DocumentFormat): FormatAdapter | undefined =>
  byFormat.get(format);

export const shutdownAdapters = async (): Promise<void> => {
  for (const adapter of adapters) {
    if (adapter.shutdown) {
      try {
        await adapter.shutdown();
      } catch (err) {
        console.error(`[engine] adapter ${adapter.format} shutdown failed:`, err);
      }
    }
  }
};

export type { FormatAdapter, GenerationContext } from './types';
