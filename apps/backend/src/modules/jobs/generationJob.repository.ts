import type { GenerationJobKind } from '@prisma/client';
import { prisma } from '../../db/prisma';

export const generationJobRepository = {
  create(documentId: string, kind: GenerationJobKind = 'RENDER') {
    return prisma.generationJob.create({ data: { documentId, kind } });
  },

  findById(organizationId: string, id: string) {
    return prisma.generationJob.findFirst({
      where: { id, document: { organizationId } },
      include: { deliveries: { orderBy: { createdAt: 'desc' } } },
    });
  },

  findManyByDocument(organizationId: string, documentId: string) {
    return prisma.generationJob.findMany({
      where: { documentId, document: { organizationId } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Atomically claim the oldest PENDING job: mark PROCESSING, bump attempts,
   * stamp startedAt, return with the related document. Concurrent workers
   * are safe because `updateMany` still requires status='PENDING'.
   */
  claimNext() {
    return prisma.$transaction(async (tx) => {
      const candidate = await tx.generationJob.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      if (!candidate) return null;

      const updated = await tx.generationJob.updateMany({
        where: { id: candidate.id, status: 'PENDING' },
        data: {
          status: 'PROCESSING',
          attempts: { increment: 1 },
          startedAt: new Date(),
        },
      });
      if (updated.count === 0) return null;

      return tx.generationJob.findUnique({
        where: { id: candidate.id },
        include: { document: true },
      });
    });
  },

  markCompleted(id: string) {
    return prisma.generationJob.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date(), lastError: null },
    });
  },

  markFailed(id: string, error: string) {
    return prisma.generationJob.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date(), lastError: error },
    });
  },

  markPendingForRetry(id: string, error: string) {
    return prisma.generationJob.update({
      where: { id },
      data: { status: 'PENDING', lastError: error, startedAt: null },
    });
  },
};
