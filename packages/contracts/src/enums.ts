import { z } from 'zod';

/** RBAC roles. Mirrors the three trust boundaries in a regulated D2C platform. */
export const Role = {
  PATIENT: 'patient',
  CLINICIAN: 'clinician',
  ADMIN: 'admin',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const roleSchema = z.nativeEnum(Role);

/**
 * Prescription lifecycle. A peptide protocol is requested by a patient, reviewed
 * by a licensed clinician, then fulfilled by a partner pharmacy. Every state is
 * legally meaningful, so transitions are guarded and audited.
 */
export const PrescriptionStatus = {
  DRAFT: 'draft',
  PENDING_CLINICIAN_REVIEW: 'pending_clinician_review',
  APPROVED: 'approved',
  DENIED: 'denied',
  SENT_TO_PHARMACY: 'sent_to_pharmacy',
  FULFILLED: 'fulfilled',
  CANCELLED: 'cancelled',
} as const;
export type PrescriptionStatus = (typeof PrescriptionStatus)[keyof typeof PrescriptionStatus];
export const prescriptionStatusSchema = z.nativeEnum(PrescriptionStatus);

/**
 * The single source of truth for legal prescription transitions, shared by the
 * web client and the API so neither side can invent an illegal move. Keyed by
 * current status -> allowed next statuses.
 */
export const PRESCRIPTION_TRANSITIONS: Record<PrescriptionStatus, PrescriptionStatus[]> = {
  [PrescriptionStatus.DRAFT]: [
    PrescriptionStatus.PENDING_CLINICIAN_REVIEW,
    PrescriptionStatus.CANCELLED,
  ],
  [PrescriptionStatus.PENDING_CLINICIAN_REVIEW]: [
    PrescriptionStatus.APPROVED,
    PrescriptionStatus.DENIED,
    PrescriptionStatus.CANCELLED,
  ],
  [PrescriptionStatus.APPROVED]: [
    PrescriptionStatus.SENT_TO_PHARMACY,
    PrescriptionStatus.CANCELLED,
  ],
  [PrescriptionStatus.SENT_TO_PHARMACY]: [PrescriptionStatus.FULFILLED, PrescriptionStatus.CANCELLED],
  // Terminal states.
  [PrescriptionStatus.FULFILLED]: [],
  [PrescriptionStatus.DENIED]: [],
  [PrescriptionStatus.CANCELLED]: [],
};

/** Which role is permitted to drive a given transition. */
export const TRANSITION_ROLES: Partial<Record<PrescriptionStatus, Role[]>> = {
  [PrescriptionStatus.PENDING_CLINICIAN_REVIEW]: [Role.PATIENT, Role.ADMIN],
  [PrescriptionStatus.APPROVED]: [Role.CLINICIAN, Role.ADMIN],
  [PrescriptionStatus.DENIED]: [Role.CLINICIAN, Role.ADMIN],
  [PrescriptionStatus.SENT_TO_PHARMACY]: [Role.ADMIN, Role.CLINICIAN],
  [PrescriptionStatus.FULFILLED]: [Role.ADMIN],
  [PrescriptionStatus.CANCELLED]: [Role.PATIENT, Role.CLINICIAN, Role.ADMIN],
};

export const OrderStatus = {
  CREATED: 'created',
  PAYMENT_AUTHORIZED: 'payment_authorized',
  PAYMENT_CAPTURED: 'payment_captured',
  FULFILLED: 'fulfilled',
  REFUNDED: 'refunded',
  FAILED: 'failed',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export const orderStatusSchema = z.nativeEnum(OrderStatus);

export function isTransitionAllowed(
  from: PrescriptionStatus,
  to: PrescriptionStatus,
): boolean {
  return PRESCRIPTION_TRANSITIONS[from].includes(to);
}
