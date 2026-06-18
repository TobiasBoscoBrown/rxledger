import { AppConfig } from '../../config/app-config';
import { TokenService } from './token.service';

const config = AppConfig.fromEnv({
  JWT_SECRET: 'y'.repeat(40),
  KMS_MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv);

describe('TokenService', () => {
  const tokens = new TokenService(config);

  it('signs and verifies an access token with subject + role', () => {
    const { token, expiresInSec } = tokens.signAccessToken('user-1', 'clinician');
    expect(expiresInSec).toBe(config.jwtAccessTtlSec);
    const claims = tokens.verifyAccessToken(token);
    expect(claims.sub).toBe('user-1');
    expect(claims.role).toBe('clinician');
    expect(claims.jti).toBeTruthy();
  });

  it('rejects a token signed with a different secret', () => {
    const other = new TokenService(
      AppConfig.fromEnv({
        JWT_SECRET: 'z'.repeat(40),
        KMS_MASTER_KEY: Buffer.alloc(32, 2).toString('base64'),
        NODE_ENV: 'test',
      } as NodeJS.ProcessEnv),
    );
    const { token } = other.signAccessToken('user-1', 'patient');
    expect(() => tokens.verifyAccessToken(token)).toThrow();
  });

  it('generates opaque refresh tokens stored only as a hash', () => {
    const { raw, hash } = tokens.generateRefreshToken();
    expect(raw).not.toBe(hash);
    expect(hash).toHaveLength(64); // sha256 hex
    expect(tokens.hashRefreshToken(raw)).toBe(hash);
  });
});
