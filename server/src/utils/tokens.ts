import { createHash, randomBytes } from 'node:crypto';

/** 256-bit URL-safe random string. Used for refresh tokens and invite tokens. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the hash is stored in the DB, so a DB leak does not expose usable tokens. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
