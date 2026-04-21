import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { apiKeyRepository } from '../modules/apiKeys/apiKey.repository';
import { apiKeyService, hashApiKey } from '../modules/apiKeys/apiKey.service';

/**
 * Per-tenant API key middleware. Looks up the supplied key by its sha256
 * hash, rejects if missing or revoked, populates `req.auth` with the
 * owning organization, and asynchronously bumps `lastUsedAt`.
 */
export const requireApiKey = async (req: Request, _res: Response, next: NextFunction) => {
  const provided = req.get('X-Api-Key');
  if (!provided) {
    return next(new AppError(401, 'Missing X-Api-Key header', 'UNAUTHORIZED'));
  }
  try {
    const record = await apiKeyRepository.findByHash(hashApiKey(provided));
    if (!record || record.revokedAt) {
      return next(new AppError(401, 'Invalid API key', 'UNAUTHORIZED'));
    }
    req.auth = {
      source: 'apiKey',
      organizationId: record.organizationId,
      apiKeyId: record.id,
    };
    apiKeyRepository.touchLastUsed(record.id).catch((err) =>
      console.error('[apiKey] touchLastUsed failed:', err),
    );
    next();
  } catch (err) {
    next(err);
  }
};

// Re-export so older imports resolve if any.
export { apiKeyService };
