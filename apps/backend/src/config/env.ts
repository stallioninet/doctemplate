import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1),
    PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),

    // Auth
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

    // CORS — comma-separated allowed origins for the admin UI
    CORS_ORIGINS: z.string().default('http://localhost:3000'),

    // Webhook signing
    WEBHOOK_SIGNING_SECRET: z
      .string()
      .min(16, 'WEBHOOK_SIGNING_SECRET must be at least 16 chars'),

    // Workers
    GENERATION_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
    WEBHOOK_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    WEBHOOK_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

    // Uploads
    MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),

    // Storage
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_ROOT: z.string().default('./storage'),

    // S3 (required when STORAGE_DRIVER=s3)
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_ENDPOINT: z.string().url().optional(),

    // Puppeteer (optional tuning)
    PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  })
  .refine((v) => v.STORAGE_DRIVER !== 's3' || Boolean(v.S3_BUCKET), {
    message: 'STORAGE_DRIVER=s3 requires S3_BUCKET',
    path: ['S3_BUCKET'],
  });

export const env = envSchema.parse(process.env);
