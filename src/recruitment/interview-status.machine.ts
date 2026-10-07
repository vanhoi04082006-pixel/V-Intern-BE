/**
 * InterviewSession lifecycle state machine (Phase 4, spec 12/63).
 *
 *   created           → in_progress | cancelled
 *   in_progress       → submitted | expired | cancelled
 *   submitted         → evaluating
 *   evaluating        → completed | evaluation_failed
 *   evaluation_failed → evaluating                      (controlled retry, spec 39/40)
 *   completed         → (terminal)
 *   expired           → (terminal)
 *   cancelled         → (terminal)
 *
 * Timer authority is the BACKEND: expiry is verified against expiresAt on
 * every answer/submit (spec 17) and the session is lazily moved to
 * `expired` — the frontend countdown is visual only.
 * Pure + dependency-free for the exhaustive transition-matrix unit tests.
 */
export const INTERVIEW_SESSION_STATUSES = [
  'created',
  'in_progress',
  'submitted',
  'evaluating',
  'completed',
  'evaluation_failed',
  'expired',
  'cancelled',
] as const;
export type InterviewSessionStatus = (typeof INTERVIEW_SESSION_STATUSES)[number];

export const INTERVIEW_SESSION_TRANSITIONS: Record<
  InterviewSessionStatus,
  readonly InterviewSessionStatus[]
> = {
  created: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'expired', 'cancelled'],
  submitted: ['evaluating'],
  evaluating: ['completed', 'evaluation_failed'],
  evaluation_failed: ['evaluating'],
  completed: [],
  expired: [],
  cancelled: [],
};

export const INVALID_INTERVIEW_TRANSITION_CODE = 'INVALID_INTERVIEW_TRANSITION';

export function canTransitionInterviewSession(
  from: InterviewSessionStatus,
  to: InterviewSessionStatus,
): boolean {
  return INTERVIEW_SESSION_TRANSITIONS[from].includes(to);
}

export function isInterviewTerminal(status: InterviewSessionStatus): boolean {
  return INTERVIEW_SESSION_TRANSITIONS[status].length === 0;
}

/** Statuses in which answers may still be written (spec 16). */
export function isInterviewAnswerable(status: InterviewSessionStatus): boolean {
  return status === 'in_progress';
}

/** Statuses visible as "the intern has a live or pending interview". */
export function isInterviewActiveOrPending(status: InterviewSessionStatus): boolean {
  return status === 'created' || status === 'in_progress';
}
