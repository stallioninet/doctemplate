import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { verifyJwt } from '../utils/jwt';

/**
 * Bearer-JWT auth. Populates `req.auth` with org + user context.
 * Use for first-party (UI/API) routes. Machine-to-machine integrations
 * should use the X-Api-Key middleware instead.
 */
export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.get('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return next(new AppError(401, 'Missing Bearer token', 'UNAUTHORIZED'));
  }
  const token = header.slice(7).trim();
  try {
    const claims = verifyJwt(token);
    req.auth = {
      source: 'jwt',
      organizationId: claims.org,
      userId: claims.sub,
      role: claims.role,
    };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token', 'UNAUTHORIZED'));
  }
};
