import { Injectable } from '@nestjs/common';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@rxledger/contracts';
import { AppConfig } from '../../config/app-config';

export interface AccessClaims {
  sub: string;
  role: Role;
  jti: string;
}

/**
 * Stateless access tokens (short-lived JWT) + opaque refresh tokens. Refresh
 * tokens are random 256-bit strings; only their SHA-256 hash is ever stored, so
 * a database leak does not yield usable refresh credentials.
 */
@Injectable()
export class TokenService {
  constructor(private readonly config: AppConfig) {}

  signAccessToken(userId: string, role: Role): { token: string; expiresInSec: number } {
    const token = jwt.sign({ role, jti: randomUUID() }, this.config.jwtSecret, {
      subject: userId,
      expiresIn: this.config.jwtAccessTtlSec,
      algorithm: 'HS256',
    });
    return { token, expiresInSec: this.config.jwtAccessTtlSec };
  }

  verifyAccessToken(token: string): AccessClaims {
    const payload = jwt.verify(token, this.config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) {
      throw new Error('Malformed access token');
    }
    return { sub: String(payload.sub), role: payload['role'] as Role, jti: String(payload['jti']) };
  }

  /** A fresh opaque refresh token plus the hash we persist. */
  generateRefreshToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hashRefreshToken(raw) };
  }

  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
