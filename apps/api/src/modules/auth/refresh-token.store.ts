import { Injectable } from '@nestjs/common';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  replacedBy: string | null;
  revoked: boolean;
  expiresAt: Date;
}

/**
 * Persistence port for refresh tokens. The rotation/reuse-detection policy in
 * RefreshTokenService is written against this interface so it can be unit-tested
 * with the in-memory store and run for real against Postgres — same logic, no
 * branching on environment.
 */
export abstract class RefreshTokenStore {
  abstract insert(record: RefreshTokenRecord): Promise<void>;
  abstract findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  abstract markReplaced(id: string, replacedBy: string): Promise<void>;
  abstract revokeFamily(familyId: string): Promise<void>;
}

@Injectable()
export class InMemoryRefreshTokenStore extends RefreshTokenStore {
  private readonly byId = new Map<string, RefreshTokenRecord>();
  private readonly idByHash = new Map<string, string>();

  async insert(record: RefreshTokenRecord): Promise<void> {
    this.byId.set(record.id, { ...record });
    this.idByHash.set(record.tokenHash, record.id);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const id = this.idByHash.get(tokenHash);
    if (!id) return null;
    const rec = this.byId.get(id);
    return rec ? { ...rec } : null;
  }

  async markReplaced(id: string, replacedBy: string): Promise<void> {
    const rec = this.byId.get(id);
    if (rec) rec.replacedBy = replacedBy;
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const rec of this.byId.values()) {
      if (rec.familyId === familyId) rec.revoked = true;
    }
  }
}
