import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { decryptJson, encryptJson } from '../src/utils/crypto';
import { assertHostAllowed } from '../src/utils/host-guard';
import { signFileUrl, verifyFileSignature } from '../src/utils/signing';

describe('encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const enc = encryptJson({ password: 'p@ss-w0rd-Secret!' });
    expect(enc.startsWith('v1.')).toBe(true);
    expect(enc).not.toContain('p@ss');
    expect(decryptJson<{ password: string }>(enc).password).toBe('p@ss-w0rd-Secret!');
  });

  it('uses a fresh IV every time', () => {
    expect(encryptJson({ a: 1 })).not.toBe(encryptJson({ a: 1 }));
  });

  it('detects tampering (GCM authentication)', () => {
    const [v, iv, tag, ct] = encryptJson({ password: 'x' }).split('.');
    const flipped = Buffer.from(ct!, 'base64');
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decryptJson([v, iv, tag, flipped.toString('base64')].join('.'))).toThrow();
    expect(() => decryptJson('garbage')).toThrow();
  });
});

describe('signed file urls', () => {
  const parse = (url: string) => {
    const u = new URL(url);
    return { id: u.pathname.split('/').pop()!, exp: Number(u.searchParams.get('exp')), sig: u.searchParams.get('sig')! };
  };

  it('verifies a fresh signature and rejects tampering', () => {
    const { id, exp, sig } = parse(signFileUrl('64b64b64b64b64b64b64b64b'));
    expect(verifyFileSignature(id, exp, sig)).toBe(true);
    expect(verifyFileSignature('64b64b64b64b64b64b64b65c', exp, sig)).toBe(false); // other file
    expect(verifyFileSignature(id, exp + 1, sig)).toBe(false); // extended expiry
    expect(verifyFileSignature(id, exp, sig.replace(/.$/, sig.endsWith('0') ? '1' : '0'))).toBe(false);
    expect(verifyFileSignature(id, exp, 'zz')).toBe(false);
  });

  it('rejects expired signatures', () => {
    const { id, exp, sig } = parse(signFileUrl('64b64b64b64b64b64b64b64b', -5));
    expect(verifyFileSignature(id, exp, sig)).toBe(false);
  });
});

describe('host guard', () => {
  it('allows anything when BLOCK_PRIVATE_HOSTS=false', () => {
    expect(() => assertHostAllowed('localhost')).not.toThrow();
  });

  it('blocks private and loopback hosts when enabled', () => {
    const original = env.BLOCK_PRIVATE_HOSTS;
    env.BLOCK_PRIVATE_HOSTS = true;
    try {
      for (const h of ['localhost', 'db.localhost', 'x.internal', 'printer.local', '127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.169.254', '::1', '[::1]', 'fd12::1', 'fe80::1']) {
        expect(() => assertHostAllowed(h), h).toThrow(/not allowed/);
      }
      for (const h of ['db.example.com', '8.8.8.8', '172.32.0.1', '203.0.113.5']) {
        expect(() => assertHostAllowed(h), h).not.toThrow();
      }
    } finally {
      env.BLOCK_PRIVATE_HOSTS = original;
    }
  });
});
