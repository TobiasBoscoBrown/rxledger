import { PrescriptionStatus, Role } from '@rxledger/contracts';
import { PrescriptionStateMachine } from './prescription.state-machine';
import { ForbiddenError, IllegalTransitionError } from '../../common/errors';

describe('PrescriptionStateMachine', () => {
  it('allows the legal happy-path transitions', () => {
    PrescriptionStateMachine.assertTransition(
      PrescriptionStatus.DRAFT,
      PrescriptionStatus.PENDING_CLINICIAN_REVIEW,
      Role.PATIENT,
    );
    PrescriptionStateMachine.assertTransition(
      PrescriptionStatus.PENDING_CLINICIAN_REVIEW,
      PrescriptionStatus.APPROVED,
      Role.CLINICIAN,
    );
    PrescriptionStateMachine.assertTransition(
      PrescriptionStatus.APPROVED,
      PrescriptionStatus.SENT_TO_PHARMACY,
      Role.ADMIN,
    );
  });

  it('rejects an illegal transition (skipping review)', () => {
    expect(() =>
      PrescriptionStateMachine.assertTransition(
        PrescriptionStatus.DRAFT,
        PrescriptionStatus.APPROVED,
        Role.CLINICIAN,
      ),
    ).toThrow(IllegalTransitionError);
  });

  it('enforces who may drive a transition (a patient cannot approve)', () => {
    expect(() =>
      PrescriptionStateMachine.assertTransition(
        PrescriptionStatus.PENDING_CLINICIAN_REVIEW,
        PrescriptionStatus.APPROVED,
        Role.PATIENT,
      ),
    ).toThrow(ForbiddenError);
  });

  it('treats fulfilled/denied/cancelled as terminal', () => {
    expect(PrescriptionStateMachine.isTerminal(PrescriptionStatus.FULFILLED)).toBe(true);
    expect(PrescriptionStateMachine.isTerminal(PrescriptionStatus.DENIED)).toBe(true);
    expect(PrescriptionStateMachine.isTerminal(PrescriptionStatus.CANCELLED)).toBe(true);
    expect(PrescriptionStateMachine.isTerminal(PrescriptionStatus.APPROVED)).toBe(false);
    expect(() =>
      PrescriptionStateMachine.assertTransition(
        PrescriptionStatus.FULFILLED,
        PrescriptionStatus.CANCELLED,
        Role.ADMIN,
      ),
    ).toThrow(IllegalTransitionError);
  });

  it('canTransition mirrors assertTransition without throwing', () => {
    expect(
      PrescriptionStateMachine.canTransition(
        PrescriptionStatus.DRAFT,
        PrescriptionStatus.CANCELLED,
        Role.PATIENT,
      ),
    ).toBe(true);
    expect(
      PrescriptionStateMachine.canTransition(
        PrescriptionStatus.DRAFT,
        PrescriptionStatus.FULFILLED,
        Role.ADMIN,
      ),
    ).toBe(false);
  });

  it('exposes the allowed targets for a state', () => {
    expect(PrescriptionStateMachine.allowedTargets(PrescriptionStatus.APPROVED)).toEqual([
      PrescriptionStatus.SENT_TO_PHARMACY,
      PrescriptionStatus.CANCELLED,
    ]);
  });
});
