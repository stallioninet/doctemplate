import type { UserRole } from '@prisma/client';
import { prisma } from '../../db/prisma';

export interface CreateUserData {
  organizationId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export const userRepository = {
  create(data: CreateUserData) {
    return prisma.user.create({ data });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });
  },
};
