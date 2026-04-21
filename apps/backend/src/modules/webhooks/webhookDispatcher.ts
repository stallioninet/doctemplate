import { env } from '../../config/env';
import { hmacSignHeader } from '../../utils/hmac';
import {
  webhookDeliveryRepository,
  type CreateDeliveryData,
} from './webhookDelivery.repository';

const BACKOFFS_MS = [1_000, 5_000, 30_000, 120_000, 600_000];

export interface DeliveryRef {
  id: string;
  url: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export const webhookDispatcher = {
  schedule(data: CreateDeliveryData) {
    return webhookDeliveryRepository.create(data);
  },

  async deliver(delivery: DeliveryRef) {
    const body = JSON.stringify(delivery.payload);
    const signature = hmacSignHeader(body);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.WEBHOOK_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(delivery.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'doctemplate-webhook/1.0',
          'X-Webhook-Signature': signature,
        },
        body,
        signal: controller.signal,
      });

      if (response.ok) {
        return webhookDeliveryRepository.markDelivered(delivery.id, response.status);
      }

      const error = `HTTP ${response.status}`;
      if (delivery.attempts >= delivery.maxAttempts) {
        return webhookDeliveryRepository.markFailed(delivery.id, error, response.status);
      }
      return webhookDeliveryRepository.scheduleRetry(
        delivery.id,
        backoffMs(delivery.attempts),
        error,
        response.status,
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (delivery.attempts >= delivery.maxAttempts) {
        return webhookDeliveryRepository.markFailed(delivery.id, error);
      }
      return webhookDeliveryRepository.scheduleRetry(
        delivery.id,
        backoffMs(delivery.attempts),
        error,
      );
    } finally {
      clearTimeout(timer);
    }
  },
};

const backoffMs = (attempt: number): number => {
  const idx = Math.min(Math.max(attempt - 1, 0), BACKOFFS_MS.length - 1);
  return BACKOFFS_MS[idx]!;
};
