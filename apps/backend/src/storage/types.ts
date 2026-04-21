export interface SaveResult {
  key: string;
  size: number;
  etag?: string;
}

/**
 * Storage abstraction — swappable between local disk and S3.
 * Keys are opaque strings like `sources/<uuid>-name.pdf` or
 * `generated/<documentId>/<uuid>.pdf`. The storage implementation
 * decides where bytes live (filesystem path vs S3 object).
 */
export interface FileStorage {
  save(buffer: Buffer, key: string, mimeType: string): Promise<SaveResult>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
