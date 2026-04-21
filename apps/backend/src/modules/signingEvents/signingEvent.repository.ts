import type { Prisma, SigningEventType } from '@prisma/client';
import { prisma } from '../../db/prisma';

export interface CreateEventData {
  documentId: string;
  type: SigningEventType;
  signerId?: string;
  fieldId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

export const signingEventRepository = {
  create(data: CreateEventData) {
    return prisma.signingEvent.create({
      data: {
        documentId: data.documentId,
        type: data.type,
        ...(data.signerId ? { signerId: data.signerId } : {}),
        ...(data.fieldId ? { fieldId: data.fieldId } : {}),
        ...(data.ipAddress ? { ipAddress: data.ipAddress } : {}),
        ...(data.userAgent ? { userAgent: data.userAgent } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
    });
  },

  listForDocument(documentId: string) {
    return prisma.signingEvent.findMany({
      where: { documentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  },
};
