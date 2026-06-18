import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { PoolClient } from 'pg';

export interface AuditEntry {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  phiAccessed?: boolean;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

interface AuditRow {
  id: string;
  occurred_at: Date;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  phi_accessed: boolean;
  ip: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Writes to the append-only audit log. The application only ever INSERTs here;
 * the database itself blocks UPDATE/DELETE (trigger + role grants), so even a
 * compromised app credential cannot rewrite history. `record` accepts an
 * optional transaction client so an audit row commits atomically with the state
 * change it describes.
 */
@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  private static readonly INSERT_SQL = `
    INSERT INTO audit_log
      (actor_id, actor_role, action, resource_type, resource_id, phi_accessed, ip, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    RETURNING id`;

  async record(entry: AuditEntry, client?: PoolClient): Promise<void> {
    const params = [
      entry.actorId ?? null,
      entry.actorRole ?? null,
      entry.action,
      entry.resourceType,
      entry.resourceId ?? null,
      entry.phiAccessed ?? false,
      entry.ip ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ];
    if (client) {
      await client.query(AuditService.INSERT_SQL, params);
    } else {
      await this.db.query(AuditService.INSERT_SQL, params);
    }
  }

  /** Read the trail for a resource (admin-only at the controller layer). */
  async listForResource(resourceType: string, resourceId: string, limit = 100): Promise<AuditRow[]> {
    return this.db.query<AuditRow>(
      `SELECT * FROM audit_log
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY occurred_at DESC, id DESC
       LIMIT $3`,
      [resourceType, resourceId, limit],
    );
  }
}
