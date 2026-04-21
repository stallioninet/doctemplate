import { prisma } from '../../db/prisma';

export interface CreateApiKeyData {
  organizationId: string;
  name: string;
  prefix: string;
  keyHash: string;
}

export const apiKeyRepository = {
  create(data: CreateApiKeyData) {
    return prisma.apiKey.create({ data });
  },

  findByHash(keyHash: string) {
    return prisma.apiKey.findUnique({ where: { keyHash } });
  },

  listForOrg(organizationId: string) {
    return prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  },

  findByIdScoped(id: string, organizationId: string) {
    return prisma.apiKey.findFirst({ where: { id, organizationId } });
  },

  revoke(id: string) {
    return prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  touchLastUsed(id: string) {
    return prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  },
};
