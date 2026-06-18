import { Injectable } from '@nestjs/common';
import type { LoginInput, RegisterInput, TokenPair } from '@rxledger/contracts';
import { UnauthorizedError, ConflictError, NotFoundError } from '../../common/errors';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import { RefreshTokenService } from './refresh-token.service';
import { UserStore } from './user.store';
import type { UserRecord } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserStore,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly totp: TotpService,
    private readonly cipher: FieldCipherService,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput, ip?: string): Promise<TokenPair> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new ConflictError('Email already registered');
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create(input.email, passwordHash, input.role);
    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'user.register',
      resourceType: 'user',
      resourceId: user.id,
      ip,
    });
    return this.issueTokens(user);
  }

  async login(input: LoginInput, ip?: string): Promise<TokenPair> {
    const user = await this.users.findByEmail(input.email);
    // Verify against a real-looking hash even when the user is unknown to keep
    // timing uniform and avoid leaking which emails exist.
    const ok = user
      ? await this.passwords.verify(input.password, user.passwordHash)
      : await this.passwords.verify(input.password, DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedError('Invalid credentials');

    if (user.mfaEnabled) {
      if (!input.totp) throw new UnauthorizedError('MFA code required');
      const secret = this.cipher.decrypt(user.mfaSecretEnc!);
      if (!this.totp.verify(secret, input.totp)) {
        throw new UnauthorizedError('Invalid MFA code');
      }
    }

    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'user.login',
      resourceType: 'user',
      resourceId: user.id,
      ip,
      metadata: { mfa: user.mfaEnabled },
    });
    return this.issueTokens(user);
  }

  async refresh(rawToken: string): Promise<TokenPair> {
    const { userId, raw } = await this.refreshTokens.rotate(rawToken);
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError('Account no longer exists');
    const access = this.tokens.signAccessToken(user.id, user.role);
    return {
      accessToken: access.token,
      refreshToken: raw,
      tokenType: 'Bearer',
      expiresInSec: access.expiresInSec,
    };
  }

  async logout(rawToken: string): Promise<void> {
    await this.refreshTokens.revoke(rawToken);
  }

  /** Begin MFA enrollment: generate + store an (encrypted) secret, return the
   *  provisioning URI for the authenticator app. Not enabled until verified. */
  async beginMfaEnrollment(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('user', userId);
    const secret = this.totp.generateSecret();
    await this.users.setMfaSecret(userId, this.cipher.encrypt(secret));
    return { secret, otpauthUri: this.totp.keyUri(secret, user.email) };
  }

  async confirmMfaEnrollment(userId: string, totpCode: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || !user.mfaSecretEnc) throw new NotFoundError('mfa-enrollment', userId);
    const secret = this.cipher.decrypt(user.mfaSecretEnc);
    if (!this.totp.verify(secret, totpCode)) throw new UnauthorizedError('Invalid MFA code');
    await this.users.enableMfa(userId);
    await this.audit.record({
      actorId: userId,
      actorRole: user.role,
      action: 'user.mfa_enabled',
      resourceType: 'user',
      resourceId: userId,
    });
  }

  private async issueTokens(user: UserRecord): Promise<TokenPair> {
    const access = this.tokens.signAccessToken(user.id, user.role);
    const refresh = await this.refreshTokens.issue(user.id);
    return {
      accessToken: access.token,
      refreshToken: refresh.raw,
      tokenType: 'Bearer',
      expiresInSec: access.expiresInSec,
    };
  }
}

// A fixed bcrypt hash of a random string, used only to equalize login timing.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKxGhuQqYQqQ0vN1m1Z2bqXk6m0a8b3v2C5pK';
