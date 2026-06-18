import type { Role } from '@rxledger/contracts';

/** The authenticated principal attached to each request after the JWT guard. */
export interface AuthUser {
  id: string;
  role: Role;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  mfaSecretEnc: string | null;
  mfaEnabled: boolean;
}
