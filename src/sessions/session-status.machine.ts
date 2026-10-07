import { SessionStatus } from './entities/internship-session.entity';

export type { SessionStatus };

/**
 * Internship-session lifecycle state machine (spec 10/11).
 *
 *   upcoming → active | cancelled
 *   active   → ending | cancelled
 *   ending   → completed
 *   completed → (terminal)
 *   cancelled → (terminal)
 *
 * Pure + dependency-free so it is unit-testable in isolation and reusable
 * by the service layer. Illegal transitions are rejected with 409
 * INVALID_SESSION_TRANSITION by the service — never trusted to the FE.
 */
export const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  upcoming: ['active', 'cancelled'],
  active: ['ending', 'cancelled'],
  ending: ['completed'],
  completed: [],
  cancelled: [],
};

export const INVALID_SESSION_TRANSITION_CODE = 'INVALID_SESSION_TRANSITION';

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

/** Sessions that accept new intern assignments (documented business rule). */
export const ASSIGNABLE_SESSION_STATUSES: readonly SessionStatus[] = ['upcoming', 'active'];

export function isSessionAssignable(status: SessionStatus): boolean {
  return ASSIGNABLE_SESSION_STATUSES.includes(status);
}
