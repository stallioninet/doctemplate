import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env';

export interface JwtClaims {
  sub: string;          // userId
  org: string;          // organizationId
  role: UserRole;
  email: string;
}

export const signJwt = (claims: JwtClaims): string =>
  jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });

export const verifyJwt = (token: string): JwtClaims => {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === 'string') throw new Error('Invalid token payload');
  return decoded as unknown as JwtClaims;
};
