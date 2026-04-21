import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '../config/env';
import type { FileStorage, SaveResult } from './types';

const client = new S3Client({
  region: env.S3_REGION,
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
  ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

const bucket = (): string => {
  if (!env.S3_BUCKET) throw new Error('S3_BUCKET is not configured');
  return env.S3_BUCKET;
};

export const s3Storage: FileStorage = {
  async save(buffer, key, mimeType): Promise<SaveResult> {
    const result = await client.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return { key, size: buffer.length, etag: result.ETag };
  },

  async read(key) {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!response.Body) throw new Error(`Empty body for ${key}`);
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  },

  async exists(key) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return true;
    } catch {
      return false;
    }
  },

  async delete(key) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
};
