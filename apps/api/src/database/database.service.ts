import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { AppConfig } from '../config/app-config';

export type Sql = string;

/**
 * Thin, owned data-access layer over a single pg Pool. We deliberately do not
 * hide SQL behind a heavy ORM: in a regulated system the query plan and the
 * indexing strategy are first-class concerns, and the person who owns the API
 * should be able to read and reason about every statement that touches PHI.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor(config: AppConfig) {
    const connectionString = config.databaseUrl;
    const useSsl = !!connectionString && !/localhost|127\.0\.0\.1/.test(connectionString);
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    });
  }

  async query<T extends QueryResultRow>(text: Sql, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(text, params as never[]);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow>(text: Sql, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  /**
   * Run a function inside a transaction. The acting user id is bound to a
   * Postgres session variable (`app.actor_id`) for the duration, so the audit
   * layer and any row-level policies can attribute writes to a real principal.
   */
  async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
    actorId?: string,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (actorId) {
        await client.query('SELECT set_config($1, $2, true)', ['app.actor_id', actorId]);
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
