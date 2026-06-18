import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * RFC 6238 TOTP, implemented directly rather than pulled from a library — MFA
 * is part of the security posture this role owns, and it should be readable and
 * auditable. SHA-1 / 30s / 6 digits matches what authenticator apps expect.
 */
@Injectable()
export class TotpService {
  private readonly stepSeconds = 30;
  private readonly digits = 6;

  /** Generate a new base32 secret for enrollment. */
  generateSecret(byteLength = 20): string {
    return base32Encode(randomBytes(byteLength));
  }

  /** Build the otpauth:// URI an authenticator app scans. */
  keyUri(secret: string, account: string, issuer = 'RxLedger'): string {
    const label = encodeURIComponent(`${issuer}:${account}`);
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(this.digits),
      period: String(this.stepSeconds),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /** Compute the code for a given time (defaults to now). */
  generate(secret: string, atMs: number = Date.now()): string {
    const counter = Math.floor(atMs / 1000 / this.stepSeconds);
    return this.hotp(base32Decode(secret), counter);
  }

  /**
   * Verify a code, tolerating +/- `window` steps of clock drift. Comparison is
   * constant-time to avoid leaking information via timing.
   */
  verify(secret: string, token: string, atMs: number = Date.now(), window = 1): boolean {
    if (!/^\d{6}$/.test(token)) return false;
    const key = base32Decode(secret);
    const counter = Math.floor(atMs / 1000 / this.stepSeconds);
    for (let offset = -window; offset <= window; offset++) {
      const candidate = this.hotp(key, counter + offset);
      if (constantTimeEqual(candidate, token)) return true;
    }
    return false;
  }

  private hotp(key: Buffer, counter: number): string {
    const buf = Buffer.alloc(8);
    // Write the 64-bit counter big-endian (high 32 bits are ~always 0 here).
    buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
    buf.writeUInt32BE(counter >>> 0, 4);
    const hmac = createHmac('sha1', key).update(buf).digest();
    const lastByte = hmac[hmac.length - 1];
    if (lastByte === undefined) throw new Error('empty hmac');
    const offset = lastByte & 0x0f;
    const binary =
      ((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff);
    return (binary % 10 ** this.digits).toString().padStart(this.digits, '0');
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
