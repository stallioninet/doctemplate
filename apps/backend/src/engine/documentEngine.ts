import { randomUUID } from 'crypto';
import type { DocumentFormat } from '@prisma/client';
import { fileStorage } from '../storage/fileStorage';
import { AppError } from '../utils/errors';
import { getAdapter, shutdownAdapters } from './adapters';

export interface GenerateInput {
  id: string;
  name: string;
  format: DocumentFormat;
  htmlContent: string;
}

export interface GenerateResult {
  key: string;
  mimeType: string;
  size: number;
  extension: string;
}

/**
 * Orchestrator that dispatches an HTML snapshot to the format adapter
 * registered for the requested `format`, persists the output via the
 * active `FileStorage`, and returns a storage key + metadata.
 *
 * HTML is the canonical source of truth: every output format is derived
 * from the same `htmlContent` snapshot stored on the Document.
 */
export const documentEngine = {
  async generate(input: GenerateInput): Promise<GenerateResult> {
    const adapter = getAdapter(input.format);
    if (!adapter) {
      throw new AppError(500, `No adapter registered for format ${input.format}`, 'NO_ADAPTER');
    }

    const buffer = await adapter.generate(input.htmlContent, {
      documentId: input.id,
      documentName: input.name,
    });

    const key = `generated/${input.id}/${randomUUID().slice(0, 8)}.${adapter.extension}`;
    const saved = await fileStorage.save(buffer, key, adapter.mimeType);

    return {
      key: saved.key,
      mimeType: adapter.mimeType,
      size: saved.size,
      extension: adapter.extension,
    };
  },

  shutdown: shutdownAdapters,
};
