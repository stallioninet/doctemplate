import { prisma } from '../../db/prisma';
import type { CreateSignerInput, UpdateSignerInput } from './signer.schema';

export const signerRepository = {
  create(documentId: string, input: CreateSignerInput) {
    return prisma.signer.create({
      data: { documentId, email: input.email, name: input.name, order: input.order },
    });
  },

  list(documentId: string) {
    return prisma.signer.findMany({
      where: { documentId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  },

  findById(documentId: string, id: string) {
    return prisma.signer.findFirst({ where: { id, documentId } });
  },

  update(id: string, input: UpdateSignerInput) {
    return prisma.signer.update({ where: { id }, data: input });
  },

  remove(id: string) {
    return prisma.signer.delete({ where: { id } });
  },

  findByTokenHash(hash: string) {
    return prisma.signer.findUnique({
      where: { accessTokenHash: hash },
      include: {
        document: true,
        fields: { orderBy: [{ page: 'asc' }, { y: 'asc' }] },
      },
    });
  },

  setAccessToken(id: string, hash: string) {
    return prisma.signer.update({
      where: { id },
      data: { accessTokenHash: hash, accessSentAt: new Date() },
    });
  },

  markViewed(id: string, ipAddress?: string, userAgent?: string) {
    return prisma.signer.update({
      where: { id },
      data: {
        ...(ipAddress ? { ipAddress } : {}),
        ...(userAgent ? { userAgent } : {}),
        viewedAt: new Date(),
        // Promote PENDING → VIEWED but never regress SIGNED/DECLINED.
        status: 'VIEWED',
      },
    });
  },

  markSigned(id: string) {
    return prisma.signer.update({
      where: { id },
      data: { status: 'SIGNED', signedAt: new Date() },
    });
  },

  markDeclined(id: string, reason?: string) {
    return prisma.signer.update({
      where: { id },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        ...(reason ? { declineReason: reason } : {}),
      },
    });
  },

  countByStatus(documentId: string) {
    return prisma.signer.groupBy({
      by: ['status'],
      where: { documentId },
      _count: { _all: true },
    });
  },
};
