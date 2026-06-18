/**
 * Vendor adapter contract for pharmacy fulfillment.
 *
 * Per the JD: "Vendor adapter interfaces are written and approved before any
 * concrete implementation — swapping must be contained to one module." Every
 * pharmacy integration implements this interface; the rest of the system only
 * ever sees the interface, so changing or adding a pharmacy is a single-file
 * change with no blast radius.
 */
export interface FulfillmentRequest {
  prescriptionId: string;
  /** De-identified line items the pharmacy needs to fill. */
  items: { peptide: string; dosage: string; quantity: number }[];
  shippingState: string;
  /** Idempotency key so a retried submit doesn't double-fill. */
  idempotencyKey: string;
}

export interface FulfillmentResult {
  vendorOrderId: string;
  status: 'accepted' | 'rejected';
  reason?: string;
}

export interface PharmacyWebhookEvent {
  eventId: string;
  type: 'fulfillment.accepted' | 'fulfillment.shipped' | 'fulfillment.completed' | 'fulfillment.failed';
  vendorOrderId: string;
  prescriptionId: string;
}

export abstract class PharmacyAdapter {
  abstract readonly vendor: string;
  abstract submitFulfillment(req: FulfillmentRequest): Promise<FulfillmentResult>;
  /** HMAC signature check on inbound webhooks. */
  abstract verifyWebhookSignature(rawBody: string, signature: string): boolean;
  abstract parseWebhook(rawBody: string): PharmacyWebhookEvent;
}
