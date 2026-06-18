import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../audit/audit.service';
import { UnauthorizedError } from '../../common/errors';
import { CircuitBreaker } from '../../common/util/circuit-breaker';
import { retry } from '../../common/util/retry';
import { PharmacyAdapter, type FulfillmentRequest, type FulfillmentResult } from './pharmacy.adapter';

/**
 * Treats the pharmacy as both an attack surface and a reliability risk:
 *   - outbound submits go through bounded retry (full-jitter backoff) wrapped in
 *     a per-vendor circuit breaker, so a flaky pharmacy fails fast instead of
 *     exhausting workers;
 *   - inbound webhooks are signature-verified and de-duplicated against
 *     processed_webhooks (vendor, event_id) so the same event is never applied
 *     twice, even if the vendor retries delivery.
 */
@Injectable()
export class PharmacyService {
  private readonly logger = new Logger(PharmacyService.name);
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly adapter: PharmacyAdapter,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {
    this.breaker = new CircuitBreaker({
      name: `pharmacy:${adapter.vendor}`,
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
    });
  }

  async submitFulfillment(req: FulfillmentRequest): Promise<FulfillmentResult> {
    return this.breaker.execute(() =>
      retry(() => this.adapter.submitFulfillment(req), {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 2_000,
        // Retry transient/network/5xx errors; never retry a rejection contract.
        shouldRetry: (err) => !(err instanceof Error && /rejected|invalid/i.test(err.message)),
      }),
    );
  }

  /** Returns whether the event was newly applied (false = duplicate, ignored). */
  async handleWebhook(rawBody: string, signature: string): Promise<{ applied: boolean }> {
    if (!this.adapter.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedError('Invalid webhook signature');
    }
    const event = this.adapter.parseWebhook(rawBody);

    return this.db.withTransaction(async (client) => {
      const claimed = await client.query(
        `INSERT INTO processed_webhooks (vendor, event_id)
         VALUES ($1, $2)
         ON CONFLICT (vendor, event_id) DO NOTHING
         RETURNING id`,
        [this.adapter.vendor, event.eventId],
      );
      if (claimed.rowCount === 0) {
        this.logger.log(`Duplicate webhook ${this.adapter.vendor}/${event.eventId} ignored`);
        return { applied: false };
      }

      if (event.type === 'fulfillment.completed') {
        await client.query(
          `UPDATE orders SET status = 'fulfilled', updated_at = now()
           WHERE prescription_id = $1 AND status <> 'fulfilled'`,
          [event.prescriptionId],
        );
        await client.query(
          `UPDATE prescriptions SET status = 'fulfilled', version = version + 1, updated_at = now()
           WHERE id = $1 AND status = 'sent_to_pharmacy'`,
          [event.prescriptionId],
        );
      }

      await this.audit.record(
        {
          action: `pharmacy.webhook.${event.type}`,
          resourceType: 'prescription',
          resourceId: event.prescriptionId,
          metadata: { vendor: this.adapter.vendor, eventId: event.eventId },
        },
        client,
      );
      return { applied: true };
    });
  }
}
