import { env } from '../config/env';
import { AppError } from './errors';

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Best-effort SSRF guard for user-supplied database hosts. It only inspects the
 * literal host string: a public DNS name that RESOLVES to a private address is
 * not caught here, so also restrict egress at the network level in production.
 */
export function assertHostAllowed(rawHost: string): void {
  if (!env.BLOCK_PRIVATE_HOSTS) return;
  const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const blocked =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    isPrivateIPv4(host) ||
    host === '::1' ||
    host === '::' ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    host.startsWith('fe80:');
  if (blocked) {
    throw new AppError(400, 'HOST_NOT_ALLOWED', 'This host is not allowed. Use a publicly reachable database host.');
  }
}
