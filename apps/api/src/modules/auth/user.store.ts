import { Injectable } from '@nestjs/common';
import type { Role } from '@rxledger/contracts';
import { DatabaseService } from '../../database/database.service';
import type { UserRecord } from './auth.types';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  mfa_secret_enc: string | null;
  mfa_enabled: boolean;
}

const toRecord = (r: UserRow): UserRecord => ({
  id: r.id,
  email: r.email,
  passwordHash: r.password_hash,
  role: r.role,
  mfaSecretEnc: r.mfa_secret_enc,
  mfaEnabled: r.mfa_enabled,
});

/** Postgres-backed user persistence for the auth module. */
@Injectable()
export class UserStore {
  constructor(private readonly db: DatabaseService) {}

  async create(email: string, passwordHash: string, role: Role): Promise<UserRecord> {
    const row = await this.db.queryOne<UserRow>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, passwordHash, role],
    );
    return toRecord(row!);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db.queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.db.queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return row ? toRecord(row) : null;
  }

  async setMfaSecret(userId: string, secretEnc: string): Promise<void> {
    await this.db.query('UPDATE users SET mfa_secret_enc = $2, updated_at = now() WHERE id = $1', [
      userId,
      secretEnc,
    ]);
  }

  async enableMfa(userId: string): Promise<void> {
    await this.db.query('UPDATE users SET mfa_enabled = true, updated_at = now() WHERE id = $1', [
      userId,
    ]);
  }
}
