import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { phi, isPhi, collectPhiKeys } from './phi';
import {
  PrescriptionStatus,
  isTransitionAllowed,
  PRESCRIPTION_TRANSITIONS,
} from './enums';
import { createPrescriptionSchema, patientProfileSchema } from './index';

describe('phi tagging', () => {
  it('brands a schema and reads back the tag', () => {
    expect(isPhi(phi(z.string()))).toBe(true);
    expect(isPhi(z.string())).toBe(false);
  });

  it('collects PHI keys from an object schema (incl. wrapped/optional)', () => {
    const schema = z.object({
      ssn: phi(z.string()),
      notes: phi(z.string()).optional(),
      city: z.string(),
    });
    const keys = collectPhiKeys(schema).sort();
    expect(keys).toEqual(['notes', 'ssn']);
  });

  it('the shared patient profile tags dob + phone as PHI', () => {
    expect(collectPhiKeys(patientProfileSchema).sort()).toEqual(['dateOfBirth', 'phone']);
  });
});

describe('prescription transition table', () => {
  it('permits the clinical happy path and forbids skips', () => {
    expect(
      isTransitionAllowed(PrescriptionStatus.PENDING_CLINICIAN_REVIEW, PrescriptionStatus.APPROVED),
    ).toBe(true);
    expect(isTransitionAllowed(PrescriptionStatus.DRAFT, PrescriptionStatus.FULFILLED)).toBe(false);
  });

  it('has terminal states with no outgoing transitions', () => {
    expect(PRESCRIPTION_TRANSITIONS[PrescriptionStatus.FULFILLED]).toEqual([]);
    expect(PRESCRIPTION_TRANSITIONS[PrescriptionStatus.CANCELLED]).toEqual([]);
  });
});

describe('createPrescriptionSchema', () => {
  it('rejects an empty protocol', () => {
    const result = createPrescriptionSchema.safeParse({
      patientId: '00000000-0000-0000-0000-000000000000',
      encounterId: '00000000-0000-0000-0000-000000000000',
      items: [],
      indication: 'x',
    });
    expect(result.success).toBe(false);
  });
});
