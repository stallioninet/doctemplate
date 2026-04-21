import { UserRole } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/errors';
import { signJwt } from '../../utils/jwt';
import { hashPassword, verifyPassword } from '../../utils/password';
import { organizationRepository } from './organization.repository';
import { userRepository } from './user.repository';
import type { LoginInput, RegisterInput } from './auth.schema';

const buildAuthResponse = (user: {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
}) => ({
  token: signJwt({
    sub: user.id,
    org: user.organizationId,
    role: user.role,
    email: user.email,
  }),
  user: {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  },
});

export const authService = {
  /**
   * Atomically create a new Organization + the first OWNER user.
   * Slug + email uniqueness violations surface as 409 CONFLICT.
   */
  async register(input: RegisterInput) {
    if (await organizationRepository.findBySlug(input.organizationSlug)) {
      throw new AppError(409, 'Organization slug already taken', 'CONFLICT');
    }
    if (await userRepository.findByEmail(input.email)) {
      throw new AppError(409, 'Email already registered', 'CONFLICT');
    }

    const passwordHash = await hashPassword(input.password);

    const { user, organization } = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.organizationName, slug: input.organizationSlug },
      });
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: input.email,
          passwordHash,
          role: UserRole.OWNER,
        },
      });
      return { user, organization };
    });

    return {
      ...buildAuthResponse(user),
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
    };
  },

  async login(input: LoginInput) {
    const user = await userRepository.findByEmail(input.email);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AppError(401, 'Invalid email or password', 'UNAUTHORIZED');
    }
    return buildAuthResponse(user);
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError(401, 'User no longer exists', 'UNAUTHORIZED');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organization: user.organization,
    };
  },
};
