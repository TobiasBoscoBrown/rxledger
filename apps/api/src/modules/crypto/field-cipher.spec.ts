import { randomBytes } from 'node:crypto';
import { LocalKmsService } from './kms.service';
import { FieldCipherService } from './field-cipher.service';

const masterKey = randomBytes(32).toString('base64');

describe('FieldCipherService (envelope encryption)', () => {
  const cipher = new FieldCipherService(new LocalKmsService(masterKey));

  it('round-trips a value', () => {
    const plaintext = 'Diagnosis: soft-tissue recovery; BPC-157 250mcg BID';
    const token = cipher.encrypt(plaintext);
    expect(token).not.toContain('Diagnosis');
    expect(cipher.decrypt(token)).toBe(plaintext);
  });

  it('produces a distinct ciphertext each time (fresh data key + IV)', () => {
    const a = cipher.encrypt('same');
    const b = cipher.encrypt('same');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('same');
    expect(cipher.decrypt(b)).toBe('same');
  });

  it('recognizes its own envelope format', () => {
    expect(cipher.isEncrypted(cipher.encrypt('x'))).toBe(true);
    expect(cipher.isEncrypted('plaintext value')).toBe(false);
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const token = cipher.encrypt('integrity matters');
    const parts = token.split('.');
    const ct = Buffer.from(parts[4]!, 'base64url');
    ct[0] = ct[0]! ^ 0xff; // flip a bit
    parts[4] = ct.toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });

  it('rejects an unknown envelope version', () => {
    expect(() => cipher.decrypt('v9.a.b.c.d')).toThrow('Unrecognized ciphertext envelope');
  });

  it('rejects a master key of the wrong size', () => {
    expect(() => new LocalKmsService(Buffer.alloc(16).toString('base64'))).toThrow('32 bytes');
  });
});
