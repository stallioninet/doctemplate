import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../config/env';

export const HMAC_ALGORITHM = 'sha256-hmac' as const;

const computeHex = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex');

/**
 * Hex-encoded HMAC-SHA256 of `payload` keyed by `WEBHOOK_SIGNING_SECRET`.
 * The same secret signs both webhook bodies and signing certificates so a
 * receiver only needs one shared key to verify either.
 */
export const hmacSign = (payload: string): string =>
  computeHex(payload, env.WEBHOOK_SIGNING_SECRET);

/** Constant-time verification. Returns false on length mismatch instead of throwing. */
export const hmacVerify = (payload: string, signatureHex: string): boolean => {
  const expected = Buffer.from(computeHex(payload, env.WEBHOOK_SIGNING_SECRET), 'hex');
  let provided: Buffer;
  try {
    provided = Buffer.from(signatureHex, 'hex');
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
};

/** `sha256=<hex>` form used in the X-Webhook-Signature header. */
export const hmacSignHeader = (payload: string): string => `sha256=${hmacSign(payload)}`;
