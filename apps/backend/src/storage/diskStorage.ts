import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../config/env';
import type { FileStorage, SaveResult } from './types';

const resolveRoot = (key: string): string => {
  if (key.includes('..')) throw new Error(`Invalid storage key: ${key}`);
  return path.join(env.STORAGE_ROOT, key);
};

export const diskStorage: FileStorage = {
  async save(buffer, key, _mimeType): Promise<SaveResult> {
    const fullPath = resolveRoot(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return { key, size: buffer.length };
  },

  read(key) {
    return fs.readFile(resolveRoot(key));
  },

  async exists(key) {
    try {
      await fs.access(resolveRoot(key));
      return true;
    } catch {
      return false;
    }
  },

  async delete(key) {
    await fs.unlink(resolveRoot(key));
  },
};
