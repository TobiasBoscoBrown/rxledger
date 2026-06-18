import { randomUUID } from 'node:crypto';

/**
 * Payment processor adapter contract. We only ever handle a tokenized card
 * reference (from the PSP's client-side tokenization) — a raw PAN never reaches
 * this service, which keeps it out of PCI scope. CIT = customer-initiated.
 */
export interface ChargeRequest {
  amountCents: number;
  paymentMethodToken: string;
  /** Idempotency key forwarded to the PSP so retries don't double-charge. */
  idempotencyKey: string;
}

export interface ChargeResult {
  pspChargeId: string;
  status: 'captured' | 'declined';
}

export abstract class PaymentAdapter {
  abstract readonly provider: string;
  abstract charge(req: ChargeRequest): Promise<ChargeResult>;
}

/** Deterministic fake PSP for dev/tests. Tokens starting with 'decline' fail. */
export class FakePaymentAdapter extends PaymentAdapter {
  readonly provider = 'fake-psp';

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    if (req.paymentMethodToken.startsWith('decline')) {
      return { pspChargeId: `ch_${randomUUID()}`, status: 'declined' };
    }
    return { pspChargeId: `ch_${randomUUID()}`, status: 'captured' };
  }
}
