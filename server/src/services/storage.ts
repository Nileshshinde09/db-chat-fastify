import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from '../config/env';

/**
 * Local-disk file storage. Swap this module for S3/GCS later: the rest of the
 * app only uses these five functions and opaque storage keys.
 */
const KEY_RE = /^[a-f0-9-]{36}\.(csv|xlsx)$/;

const root = () => path.resolve(env.UPLOAD_DIR);

export function newStorageKey(ext: 'csv' | 'xlsx'): string {
  return `${randomUUID()}.${ext}`;
}

/** Keys are validated, so a crafted key can never escape the upload directory. */
export function pathFor(key: string): string {
  if (!KEY_RE.test(key)) throw new Error('Invalid storage key');
  return path.join(root(), key);
}

export async function ensureUploadDir(): Promise<void> {
  await mkdir(root(), { recursive: true });
}

export async function saveStream(key: string, stream: Readable): Promise<void> {
  await ensureUploadDir();
  await pipeline(stream, createWriteStream(pathFor(key), { flags: 'wx' }));
}

export function openFile(key: string): ReadStream {
  return createReadStream(pathFor(key));
}

export async function removeFile(key: string): Promise<void> {
  await rm(pathFor(key), { force: true });
}
