import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../config/app-config';
import { TokenService } from './token.service';
import { RefreshTokenService } from './refresh-token.service';
import { InMemoryRefreshTokenStore } from './refresh-token.store';

function makeConfig(): AppConfig {
  return AppConfig.fromEnv({
    JWT_SECRET: 'x'.repeat(40),
    KMS_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
    NODE_ENV: 'test',
  } as NodeJS.ProcessEnv);
}

describe('RefreshTokenService — rotation & reuse detection', () => {
  let store: InMemoryRefreshTokenStore;
  let service: RefreshTokenService;
  const config = makeConfig();
  const tokens = new TokenService(config);

  beforeEach(() => {
    store = new InMemoryRefreshTokenStore();
    service = new RefreshTokenService(tokens, store, config);
  });

  it('issues then rotates to a new token', async () => {
    const issued = await service.issue('user-1');
    const rotated = await service.rotate(issued.raw);
    expect(rotated.userId).toBe('user-1');
    expect(rotated.raw).not.toBe(issued.raw);

    // The new token rotates again successfully.
    const again = await service.rotate(rotated.raw);
    expect(again.raw).not.toBe(rotated.raw);
  });

  it('detects reuse of an already-rotated token and revokes the whole family', async () => {
    const issued = await service.issue('user-1');
    const rotated = await service.rotate(issued.raw); // issued.raw is now spent

    // Replaying the spent token is treated as theft.
    await expect(service.rotate(issued.raw)).rejects.toThrow(/reuse detected/i);

    // ...and the family is dead: even the legitimately-rotated token is revoked.
    await expect(service.rotate(rotated.raw)).rejects.toThrow(/reuse detected/i);
  });

  it('rejects an unknown token', async () => {
    await expect(service.rotate('not-a-real-token')).rejects.toThrow(/invalid refresh token/i);
  });

  it('rejects an expired token', async () => {
    const { raw, hash } = tokens.generateRefreshToken();
    await store.insert({
      id: randomUUID(),
      userId: 'user-2',
      familyId: randomUUID(),
      tokenHash: hash,
      replacedBy: null,
      revoked: false,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.rotate(raw)).rejects.toThrow(/expired/i);
  });

  it('revoke() kills the family', async () => {
    const issued = await service.issue('user-3');
    await service.revoke(issued.raw);
    await expect(service.rotate(issued.raw)).rejects.toThrow(/reuse detected|invalid/i);
  });
});
