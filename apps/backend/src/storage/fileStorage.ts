import { env } from '../config/env';
import { diskStorage } from './diskStorage';
import { s3Storage } from './s3Storage';
import type { FileStorage } from './types';

/**
 * Single active storage, selected at boot from STORAGE_DRIVER.
 * Swap is transparent to callers — they only deal in keys.
 */
export const fileStorage: FileStorage =
  env.STORAGE_DRIVER === 's3' ? s3Storage : diskStorage;

export type { FileStorage, SaveResult } from './types';
