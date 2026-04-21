import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env';
import { templateRouter } from './modules/templates/template.routes';
import { documentRouter } from './modules/documents/document.routes';
import { ingestionRouter } from './modules/ingestion/ingestion.routes';
import { jobRouter } from './modules/jobs/job.routes';
import { authRouter } from './modules/auth/auth.routes';
import { apiKeyRouter } from './modules/apiKeys/apiKey.routes';
import { signingRouter } from './modules/signing/signing.routes';
import { errorHandler } from './middleware/errorHandler';

export const createApp = (): Express => {
  const app = express();

  const allowedOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: false,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/api-keys', apiKeyRouter);
  app.use('/api/templates', templateRouter);
  app.use('/api/documents', documentRouter);
  app.use('/api/jobs', jobRouter);
  app.use('/api/sign', signingRouter);
  app.use('/api/integrations/drupal', ingestionRouter);

  app.use((_req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
  );
  app.use(errorHandler);

  return app;
};
