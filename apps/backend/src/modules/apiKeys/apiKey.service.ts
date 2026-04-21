import { createHash, randomBytes } from 'crypto';
import { NotFoundError } from '../../utils/errors';
import { apiKeyRepository } from './apiKey.repository';
import type { CreateApiKeyInput } from './apiKey.schema';

const KEY_PREFIX = 'dt_live_';
const PREFIX_DISPLAY_LEN = 12;

const generateKey = (): string =>
  `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;

export const hashApiKey = (key: string): string =>
  createHash('sha256').update(key).digest('hex');

export const apiKeyService = {
  /**
   * Issue a new API key. The plaintext value is returned **only once**;
   * the DB stores a sha256 hash plus a short prefix for identification.
   */
  async create(organizationId: string, input: CreateApiKeyInput) {
    const plaintext = generateKey();
    const record = await apiKeyRepository.create({
      organizationId,
      name: input.name,
      prefix: plaintext.slice(0, PREFIX_DISPLAY_LEN),
      keyHash: hashApiKey(plaintext),
    });

    return {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      key: plaintext,
      createdAt: record.createdAt,
    };
  },

  list(organizationId: string) {
    return apiKeyRepository.listForOrg(organizationId);
  },

  async revoke(id: string, organizationId: string) {
    const existing = await apiKeyRepository.findByIdScoped(id, organizationId);
    if (!existing) throw new NotFoundError('ApiKey');
    if (existing.revokedAt) return existing;
    return apiKeyRepository.revoke(id);
  },
};
