import type { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { AppError } from '../../utils/errors';

export interface AuthContext {
  source: 'jwt' | 'apiKey';
  organizationId: string;
  userId?: string;
  role?: UserRole;
  apiKeyId?: string;
}

export const getAuth = (req: Request): AuthContext => {
  if (!req.auth) {
    throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
  }
  return req.auth;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
