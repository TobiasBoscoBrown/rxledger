import { TotpService, base32Encode, base32Decode } from './totp.service';

describe('TotpService (RFC 6238)', () => {
  const totp = new TotpService();
  // The canonical RFC 6238 SHA-1 seed: ASCII "12345678901234567890".
  const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

  it('matches the RFC 6238 SHA-1 test vectors (6-digit)', () => {
    expect(totp.generate(secret, 59_000)).toBe('287082');
    expect(totp.generate(secret, 1_111_111_109_000)).toBe('081804');
  });

  it('verifies a freshly generated code', () => {
    const now = Date.now();
    expect(totp.verify(secret, totp.generate(secret, now), now)).toBe(true);
  });

  it('tolerates one step of clock drift but not two', () => {
    const t = 1_000_000_000_000;
    const prevStepCode = totp.generate(secret, t - 30_000);
    expect(totp.verify(secret, prevStepCode, t, 1)).toBe(true);
    expect(totp.verify(secret, totp.generate(secret, t - 90_000), t, 1)).toBe(false);
  });

  it('rejects malformed codes', () => {
    expect(totp.verify(secret, 'abc', Date.now())).toBe(false);
    expect(totp.verify(secret, '12345', Date.now())).toBe(false);
  });

  it('round-trips base32 and builds an otpauth URI', () => {
    expect(base32Decode(base32Encode(Buffer.from('hello world'))).toString()).toBe('hello world');
    expect(totp.keyUri(secret, 'patient@rxledger.demo')).toMatch(/^otpauth:\/\/totp\//);
  });

  it('generates secrets that verify against themselves', () => {
    const s = totp.generateSecret();
    const now = Date.now();
    expect(totp.verify(s, totp.generate(s, now), now)).toBe(true);
  });
});
