import { env } from '../config/env';
import { webhookDeliveryRepository } from '../modules/webhooks/webhookDelivery.repository';
import { webhookDispatcher } from '../modules/webhooks/webhookDispatcher';

export class WebhookWorker {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  start() {
    if (this.timer) return;
    console.log('[webhook-worker] starting');
    this.timer = setInterval(
      () => this.tick().catch((err) => console.error('[webhook-worker]', err)),
      env.WEBHOOK_WORKER_INTERVAL_MS,
    );
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[webhook-worker] stopped');
    }
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const delivery = await webhookDeliveryRepository.claimNextDue();
      if (!delivery) return;
      await webhookDispatcher.deliver({
        id: delivery.id,
        url: delivery.url,
        payload: delivery.payload,
        attempts: delivery.attempts,
        maxAttempts: delivery.maxAttempts,
      });
    } finally {
      this.ticking = false;
    }
  }
}

export const webhookWorker = new WebhookWorker();
