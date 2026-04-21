import { createHash, randomBytes } from 'crypto';
import { env } from '../../config/env';

const TOKEN_PREFIX = 'dt_sign_';

export const generateSigningToken = (): string =>
  `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;

export const hashSigningToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const buildSigningUrl = (token: string): string =>
  `${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/api/sign/${token}`;
