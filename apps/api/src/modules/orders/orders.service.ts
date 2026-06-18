import { Injectable, Logger } from '@nestjs/common';
import type { CreateOrderInput, Role } from '@rxledger/contracts';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../audit/audit.service';
import { PaymentAdapter } from '../payments/payment.adapter';
import { PharmacyService } from '../pharmacy/pharmacy.service';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';

const PRICE_PER_PEPTIDE_CENTS = 9900;

export interface OrderView {
  id: string;
  prescriptionId: string;
  status: string;
  amountCents: number;
  createdAt: string;
}

interface OrderRow {
  id: string;
  prescription_id: string;
  status: string;
  amount_cents: number;
  created_at: Date;
}

/**
 * Order = the financial + fulfillment commitment against an approved
 * prescription. Creation is idempotent on a client-supplied key, so a retried
 * checkout never double-charges or double-fills.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly payments: PaymentAdapter,
    private readonly pharmacy: PharmacyService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: { id: string; role: Role },
    input: CreateOrderInput,
    idempotencyKey: string | undefined,
  ): Promise<OrderView> {
    if (!idempotencyKey) throw new ValidationError('Idempotency-Key header is required');

    const existing = await this.db.queryOne<OrderRow>(
      'SELECT * FROM orders WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    if (existing) return this.decode(existing);

    const rx = await this.db.queryOne<{ id: string; status: string; peptides: string[] }>(
      'SELECT id, status, peptides FROM prescriptions WHERE id = $1',
      [input.prescriptionId],
    );
    if (!rx) throw new NotFoundError('prescription', input.prescriptionId);
    if (rx.status !== 'approved') {
      throw new ConflictError(`Prescription must be 'approved' to order (is '${rx.status}')`);
    }

    const amountCents = Math.max(1, rx.peptides.length) * PRICE_PER_PEPTIDE_CENTS;

    // Charge first (the PSP is itself idempotent on the same key); only persist
    // an order once money has actually moved.
    const charge = await this.payments.charge({
      amountCents,
      paymentMethodToken: input.paymentMethodToken,
      idempotencyKey,
    });
    if (charge.status === 'declined') {
      throw new ConflictError('Payment declined');
    }

    const order = await this.db.withTransaction(async (client) => {
      let row: OrderRow;
      try {
        row = (
          await client.query<OrderRow>(
            `INSERT INTO orders (prescription_id, status, amount_cents, payment_token, idempotency_key)
             VALUES ($1, 'payment_captured', $2, $3, $4)
             RETURNING *`,
            [input.prescriptionId, amountCents, charge.pspChargeId, idempotencyKey],
          )
        ).rows[0]!;
      } catch (err) {
        // Lost a race on the unique idempotency key — return the winner's row.
        if (isUniqueViolation(err)) {
          const winner = (
            await client.query<OrderRow>('SELECT * FROM orders WHERE idempotency_key = $1', [
              idempotencyKey,
            ])
          ).rows[0]!;
          return winner;
        }
        throw err;
      }

      await client.query(
        `UPDATE prescriptions SET status = 'sent_to_pharmacy', version = version + 1, updated_at = now()
         WHERE id = $1 AND status = 'approved'`,
        [input.prescriptionId],
      );
      await client.query(
        `INSERT INTO prescription_events (prescription_id, from_status, to_status, actor_id, reason)
         VALUES ($1, 'approved', 'sent_to_pharmacy', $2, 'order placed')`,
        [input.prescriptionId, actor.id],
      );
      await this.audit.record(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'order.create',
          resourceType: 'order',
          resourceId: row.id,
          metadata: { prescriptionId: input.prescriptionId, amountCents },
        },
        client,
      );
      return row;
    }, actor.id);

    // Fire the fulfillment submit after commit; failures are retried/broken by
    // PharmacyService and reconciled by the inbound webhook.
    try {
      await this.pharmacy.submitFulfillment({
        prescriptionId: input.prescriptionId,
        items: rx.peptides.map((p) => ({ peptide: p, dosage: 'see protocol', quantity: 1 })),
        shippingState: 'NA',
        idempotencyKey,
      });
    } catch (err) {
      this.logger.warn(`Fulfillment submit deferred for ${input.prescriptionId}: ${String(err)}`);
    }

    return this.decode(order);
  }

  private decode(row: OrderRow): OrderView {
    return {
      id: row.id,
      prescriptionId: row.prescription_id,
      status: row.status,
      amountCents: row.amount_cents,
      createdAt: row.created_at.toISOString(),
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
