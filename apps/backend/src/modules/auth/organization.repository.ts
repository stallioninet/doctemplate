import { prisma } from '../../db/prisma';

export const organizationRepository = {
  create(data: { name: string; slug: string }) {
    return prisma.organization.create({ data });
  },

  findBySlug(slug: string) {
    return prisma.organization.findUnique({ where: { slug } });
  },

  findById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  },
};
