import { z } from 'zod';
import { phi } from './phi';
import { roleSchema } from './enums';

export const emailSchema = z.string().email().max(254).transform((s) => s.toLowerCase());

/** NIST-aligned: length over arbitrary composition rules. */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema.default('patient'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  /** 6-digit TOTP code, required only once MFA is enrolled. */
  totp: z.string().regex(/^\d{6}$/).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const mfaEnrollVerifySchema = z.object({
  totp: z.string().regex(/^\d{6}$/),
});

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresInSec: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

/**
 * Patient demographics. `dateOfBirth` and `phone` are PHI and are tagged so the
 * crypto + audit layers act on them automatically. (The ESLint PHI rule would
 * fail the build if these were declared without `phi(...)`.)
 */
export const patientProfileSchema = z.object({
  dateOfBirth: phi(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  phone: phi(z.string().min(7).max(20)),
  shippingState: z.string().length(2),
});
export type PatientProfile = z.infer<typeof patientProfileSchema>;
