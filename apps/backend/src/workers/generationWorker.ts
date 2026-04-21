import { env } from '../config/env';
import { generationJobService } from '../modules/jobs/generationJob.service';

export class GenerationWorker {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  start() {
    if (this.timer) return;
    console.log('[generation-worker] starting');
    this.timer = setInterval(
      () => this.tick().catch((err) => console.error('[generation-worker]', err)),
      env.GENERATION_WORKER_INTERVAL_MS,
    );
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[generation-worker] stopped');
    }
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const job = await generationJobService.claimNext();
      if (!job) return;

      try {
        await generationJobService.process(job.id, job.documentId, job.kind);
      } catch (err) {
        await generationJobService.handleFailure(
          job.id,
          job.documentId,
          err instanceof Error ? err : new Error(String(err)),
          { attempts: job.attempts, maxAttempts: job.maxAttempts, kind: job.kind },
        );
      }
    } finally {
      this.ticking = false;
    }
  }
}

export const generationWorker = new GenerationWorker();
