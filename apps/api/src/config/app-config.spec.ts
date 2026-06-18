import { AppConfig } from './app-config';

const base = {
  JWT_SECRET: 'k'.repeat(40),
  KMS_MASTER_KEY: Buffer.alloc(32, 3).toString('base64'),
} as NodeJS.ProcessEnv;

describe('AppConfig', () => {
  it('applies sane defaults', () => {
    const c = AppConfig.fromEnv(base);
    expect(c.nodeEnv).toBe('development');
    expect(c.port).toBe(8787);
    expect(c.jwtAccessTtlSec).toBe(900);
  });

  it('coerces and validates numeric env vars', () => {
    const c = AppConfig.fromEnv({ ...base, PORT: '9000', RATE_LIMIT_MAX: '50' });
    expect(c.port).toBe(9000);
    expect(c.rateLimitMax).toBe(50);
  });

  it('fails fast with a precise message on a short JWT secret', () => {
    expect(() => AppConfig.fromEnv({ ...base, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  it('requires a KMS master key', () => {
    const { KMS_MASTER_KEY: _omit, ...withoutKms } = base as Record<string, string>;
    expect(() => AppConfig.fromEnv(withoutKms as NodeJS.ProcessEnv)).toThrow(/KMS_MASTER_KEY/);
  });
});
