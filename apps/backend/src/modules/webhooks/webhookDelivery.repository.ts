import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export interface CreateDeliveryData {
  jobId?: string;
  documentId?: string;
  url: string;
  payload: unknown;
}

export const webhookDeliveryRepository = {
  create(input: CreateDeliveryData) {
    return prisma.webhookDelivery.create({
      data: {
        ...(input.jobId ? { jobId: input.jobId } : {}),
        ...(input.documentId ? { documentId: input.documentId } : {}),
        url: input.url,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  },

  /**
   * Claim the next PENDING delivery whose `nextAttemptAt` has passed.
   * Bumps `attempts` atomically; worker then calls `dispatch` and settles state.
   */
  claimNextDue(now: Date = new Date()) {
    return prisma.$transaction(async (tx) => {
      const candidate = await tx.webhookDelivery.findFirst({
        where: { status: 'PENDING', nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: 'asc' },
      });
      if (!candidate) return null;

      const updated = await tx.webhookDelivery.updateMany({
        where: {
          id: candidate.id,
          status: 'PENDING',
          nextAttemptAt: candidate.nextAttemptAt,
        },
        data: { attempts: { increment: 1 } },
      });
      if (updated.count === 0) return null;

      return tx.webhookDelivery.findUnique({ where: { id: candidate.id } });
    });
  },

  markDelivered(id: string, statusCode: number) {
    return prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        lastStatusCode: statusCode,
        deliveredAt: new Date(),
        lastError: null,
      },
    });
  },

  scheduleRetry(id: string, delayMs: number, error: string, statusCode?: number) {
    return prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'PENDING',
        lastError: error,
        lastStatusCode: statusCode ?? null,
        nextAttemptAt: new Date(Date.now() + delayMs),
      },
    });
  },

  markFailed(id: string, error: string, statusCode?: number) {
    return prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError: error,
        lastStatusCode: statusCode ?? null,
      },
    });
  },
};
