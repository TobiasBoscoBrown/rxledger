import {
  PRESCRIPTION_TRANSITIONS,
  TRANSITION_ROLES,
  PrescriptionStatus,
  Role,
  isTransitionAllowed,
} from '@rxledger/contracts';
import { ForbiddenError, IllegalTransitionError } from '../../common/errors';

/**
 * Pure prescription state machine. It encodes the only legal moves and who is
 * allowed to make them, and it has no I/O — so it is trivially and exhaustively
 * unit-testable, and the same rules apply identically on the web client (which
 * imports the transition table from @rxledger/contracts) and the server.
 *
 * Keeping this pure is deliberate: the legality of a prescription transition is
 * a clinical/regulatory fact, not a database concern.
 */
export class PrescriptionStateMachine {
  /** All statuses reachable in one legal step from `from`. */
  static allowedTargets(from: PrescriptionStatus): PrescriptionStatus[] {
    return PRESCRIPTION_TRANSITIONS[from];
  }

  static isTerminal(status: PrescriptionStatus): boolean {
    return PRESCRIPTION_TRANSITIONS[status].length === 0;
  }

  /**
   * Assert that `from -> to` is legal for `actorRole`. Throws a typed error
   * otherwise. Returns nothing on success (caller proceeds to persist).
   */
  static assertTransition(
    from: PrescriptionStatus,
    to: PrescriptionStatus,
    actorRole: Role,
  ): void {
    if (!isTransitionAllowed(from, to)) {
      throw new IllegalTransitionError(from, to);
    }
    const permittedRoles = TRANSITION_ROLES[to];
    if (permittedRoles && !permittedRoles.includes(actorRole)) {
      throw new ForbiddenError(
        `Role '${actorRole}' may not move a prescription to '${to}'`,
      );
    }
  }

  static canTransition(from: PrescriptionStatus, to: PrescriptionStatus, actorRole: Role): boolean {
    try {
      this.assertTransition(from, to, actorRole);
      return true;
    } catch {
      return false;
    }
  }
}

export { PrescriptionStatus };
