import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import {
  PharmacyAdapter,
  type FulfillmentRequest,
  type FulfillmentResult,
  type PharmacyWebhookEvent,
} from '../pharmacy.adapter';

/**
 * A stand-in pharmacy used for local/dev/tests. It mimics the real contract:
 * HMAC-signed webhooks, an idempotent submit, and an injectable failure mode so
 * tests can exercise the retry + circuit-breaker paths deterministically.
 */
export class FakePharmacyAdapter extends PharmacyAdapter {
  readonly vendor = 'fake-pharmacy';
  /** When > 0, the next N submit() calls throw, to drive retry/breaker tests. */
  failuresRemaining = 0;

  constructor(private readonly webhookSecret = 'fake-secret') {
    super();
  }

  async submitFulfillment(_req: FulfillmentRequest): Promise<FulfillmentResult> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('pharmacy upstream unavailable (503)');
    }
    return { vendorOrderId: `fk_${randomUUID()}`, status: 'accepted' };
  }

  sign(rawBody: string): string {
    return createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = this.sign(rawBody);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: string): PharmacyWebhookEvent {
    return JSON.parse(rawBody) as PharmacyWebhookEvent;
  }
}
