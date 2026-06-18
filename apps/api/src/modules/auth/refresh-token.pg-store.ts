import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RefreshTokenStore, type RefreshTokenRecord } from './refresh-token.store';

interface Row {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  replaced_by: string | null;
  revoked: boolean;
  expires_at: Date;
}

const toRecord = (r: Row): RefreshTokenRecord => ({
  id: r.id,
  userId: r.user_id,
  familyId: r.family_id,
  tokenHash: r.token_hash,
  replacedBy: r.replaced_by,
  revoked: r.revoked,
  expiresAt: new Date(r.expires_at),
});

/** Postgres-backed refresh-token store (the rotation policy lives in
 *  RefreshTokenService and is store-agnostic). */
@Injectable()
export class PgRefreshTokenStore extends RefreshTokenStore {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async insert(record: RefreshTokenRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, replaced_by, revoked, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        record.id,
        record.userId,
        record.familyId,
        record.tokenHash,
        record.replacedBy,
        record.revoked,
        record.expiresAt,
      ],
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const row = await this.db.queryOne<Row>('SELECT * FROM refresh_tokens WHERE token_hash = $1', [
      tokenHash,
    ]);
    return row ? toRecord(row) : null;
  }

  async markReplaced(id: string, replacedBy: string): Promise<void> {
    await this.db.query('UPDATE refresh_tokens SET replaced_by = $2 WHERE id = $1', [id, replacedBy]);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db.query('UPDATE refresh_tokens SET revoked = true WHERE family_id = $1', [familyId]);
  }
}
