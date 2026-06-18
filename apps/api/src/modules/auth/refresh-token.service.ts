import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UnauthorizedError } from '../../common/errors';
import { AppConfig } from '../../config/app-config';
import { TokenService } from './token.service';
import { RefreshTokenStore } from './refresh-token.store';

export interface IssuedRefresh {
  /** The token row id (used as the `replaced_by` pointer on rotation). */
  id: string;
  raw: string;
  familyId: string;
}

/**
 * Refresh-token rotation with reuse detection — the security-critical core of
 * the auth module.
 *
 * Each login starts a token "family". Every refresh rotates the token: the old
 * one is marked replaced and a new one issued in the same family. If a token
 * that has *already been replaced* (or revoked) is presented again, that means
 * a stolen token is being replayed — we revoke the entire family, forcing
 * re-authentication. This is the OWASP-recommended pattern and it is pure logic
 * over a store, so it is exhaustively unit-testable.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly tokens: TokenService,
    private readonly store: RefreshTokenStore,
    private readonly config: AppConfig,
  ) {}

  async issue(userId: string, familyId: string = randomUUID()): Promise<IssuedRefresh> {
    const id = randomUUID();
    const { raw, hash } = this.tokens.generateRefreshToken();
    await this.store.insert({
      id,
      userId,
      familyId,
      tokenHash: hash,
      replacedBy: null,
      revoked: false,
      expiresAt: new Date(Date.now() + this.config.jwtRefreshTtlSec * 1000),
    });
    return { id, raw, familyId };
  }

  /**
   * Validate and rotate a refresh token. Returns the new raw token and the
   * owning user. Throws UnauthorizedError on any anomaly.
   */
  async rotate(rawToken: string, now: Date = new Date()): Promise<{ userId: string; raw: string }> {
    const hash = this.tokens.hashRefreshToken(rawToken);
    const record = await this.store.findByHash(hash);

    if (!record) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Reuse detection: a replaced or revoked token must never be accepted again.
    if (record.revoked || record.replacedBy !== null) {
      await this.store.revokeFamily(record.familyId);
      throw new UnauthorizedError('Refresh token reuse detected — session revoked');
    }

    if (record.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    const next = await this.issue(record.userId, record.familyId);
    await this.store.markReplaced(record.id, next.id);
    return { userId: record.userId, raw: next.raw };
  }

  async revoke(rawToken: string): Promise<void> {
    const record = await this.store.findByHash(this.tokens.hashRefreshToken(rawToken));
    if (record) await this.store.revokeFamily(record.familyId);
  }
}
