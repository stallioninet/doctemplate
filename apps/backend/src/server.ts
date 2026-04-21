import { createApp } from './app';
import { env } from './config/env';
import { disconnectPrisma } from './db/prisma';
import { documentEngine } from './engine/documentEngine';
import { generationWorker } from './workers/generationWorker';
import { webhookWorker } from './workers/webhookWorker';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`[backend] listening on :${env.PORT} (${env.NODE_ENV})`);
  console.log(`[backend] storage=${env.STORAGE_DRIVER} root=${env.STORAGE_ROOT}`);
  generationWorker.start();
  webhookWorker.start();
});

const shutdown = (signal: string) => {
  console.log(`[backend] ${signal} received, shutting down`);
  generationWorker.stop();
  webhookWorker.stop();
  server.close(async () => {
    try {
      await documentEngine.shutdown();
    } catch (err) {
      console.error('[backend] engine shutdown failed:', err);
    }
    await disconnectPrisma();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
