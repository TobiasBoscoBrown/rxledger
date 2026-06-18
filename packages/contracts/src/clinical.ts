import { z } from 'zod';
import { phi } from './phi';
import { prescriptionStatusSchema } from './enums';

/**
 * A clinician encounter is the clinical justification for a prescription.
 * `chiefComplaint` and `clinicianNotes` are free-text PHI.
 */
export const createEncounterSchema = z.object({
  patientId: z.string().uuid(),
  chiefComplaint: phi(z.string().min(1).max(2000)),
  clinicianNotes: phi(z.string().max(8000)).optional(),
});
export type CreateEncounterInput = z.infer<typeof createEncounterSchema>;

/** A peptide protocol line. Dosage detail is PHI once tied to a patient. */
export const protocolItemSchema = z.object({
  peptide: z.string().min(1).max(120),
  dosage: phi(z.string().min(1).max(120)),
  frequency: z.string().min(1).max(120),
  durationWeeks: z.number().int().min(1).max(52),
});

export const createPrescriptionSchema = z.object({
  patientId: z.string().uuid(),
  encounterId: z.string().uuid(),
  items: z.array(protocolItemSchema).min(1).max(10),
  /** Clinical reasoning attached to the prescription. PHI. */
  indication: phi(z.string().min(1).max(2000)),
});
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

/**
 * Drive a prescription transition. The target status is validated against the
 * shared transition table; `version` enables optimistic concurrency control so
 * two clinicians can't both act on a stale record.
 */
export const transitionPrescriptionSchema = z.object({
  toStatus: prescriptionStatusSchema,
  reason: z.string().max(1000).optional(),
  /** Expected current version of the record (optimistic lock). */
  version: z.number().int().nonnegative(),
});
export type TransitionPrescriptionInput = z.infer<typeof transitionPrescriptionSchema>;

/** Idempotent order creation against an approved prescription. */
export const createOrderSchema = z.object({
  prescriptionId: z.string().uuid(),
  /** Tokenized card reference from the PSP — never raw PAN. */
  paymentMethodToken: z.string().min(1),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
