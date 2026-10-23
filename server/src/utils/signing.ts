import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

function mac(attachmentId: string, exp: number): string {
  return createHmac('sha256', env.FILE_SIGNING_SECRET).update(`${attachmentId}.${exp}`).digest('hex');
}

/** Short-lived URL that lets the LLM server download one uploaded file, no login needed. */
export function signFileUrl(attachmentId: string, ttlSeconds = 600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${env.INTERNAL_BASE_URL}/api/v1/internal/files/${attachmentId}?exp=${exp}&sig=${mac(attachmentId, exp)}`;
}

export function verifyFileSignature(attachmentId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(mac(attachmentId, exp), 'hex');
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'hex');
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
