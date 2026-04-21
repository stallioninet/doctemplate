import type { Prisma, SigningEventType } from '@prisma/client';
import { signingEventRepository } from './signingEvent.repository';

export interface RecordOptions {
  signerId?: string;
  fieldId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit log. Every lifecycle hop records an event so the
 * signing certificate can be reconstructed from a single canonical
 * source rather than scattered scalar timestamps on Document/Signer.
 */
export const signingEventService = {
  record(documentId: string, type: SigningEventType, options: RecordOptions = {}) {
    return signingEventRepository.create({
      documentId,
      type,
      ...(options.signerId ? { signerId: options.signerId } : {}),
      ...(options.fieldId ? { fieldId: options.fieldId } : {}),
      ...(options.ipAddress ? { ipAddress: options.ipAddress } : {}),
      ...(options.userAgent ? { userAgent: options.userAgent } : {}),
      ...(options.metadata
        ? { metadata: options.metadata as Prisma.InputJsonValue }
        : {}),
    });
  },

  listForDocument(documentId: string) {
    return signingEventRepository.listForDocument(documentId);
  },
};
