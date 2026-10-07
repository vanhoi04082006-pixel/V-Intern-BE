/**
 * Sprint lifecycle state machine (Phase 3, spec 2/3).
 *
 *   planned  → active | cancelled
 *   active   → completed | cancelled
 *   completed → (terminal)
 *   cancelled → (terminal)
 *
 * Pure + dependency-free (mirrors the Phase 2 session machine) so it is
 * unit-testable in isolation and reusable by the service layer. Illegal
 * transitions are rejected by the service with 409 INVALID_SPRINT_TRANSITION
 * — never trusted to the client.
 */
export const SPRINT_STATUSES = ['planned', 'active', 'completed', 'cancelled'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const SPRINT_TRANSITIONS: Record<SprintStatus, readonly SprintStatus[]> = {
  planned: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const INVALID_SPRINT_TRANSITION_CODE = 'INVALID_SPRINT_TRANSITION';

export function canTransitionSprint(from: SprintStatus, to: SprintStatus): boolean {
  return SPRINT_TRANSITIONS[from].includes(to);
}

export function isSprintTerminal(status: SprintStatus): boolean {
  return SPRINT_TRANSITIONS[status].length === 0;
}

/**
 * Sprint completion policy (spec 29) — DOCUMENTED DECISION:
 * A sprint may NOT be completed while it still has open tasks
 * (status != 'done') unless the caller explicitly overrides with
 * `allowOpenTasks: true` (audited). Default = reject with 409
 * SPRINT_HAS_OPEN_TASKS. Existing unfinished tasks are never deleted —
 * they simply stop belonging to an active sprint.
 */
export const SPRINT_HAS_OPEN_TASKS_CODE = 'SPRINT_HAS_OPEN_TASKS';

/**
 * One-active-sprint invariant (spec 4) — DOCUMENTED DECISION:
 * A project runs AT MOST ONE active sprint at a time. Enforced at the DB
 * level by the filtered unique index UX_sprints_project_active
 * (WHERE [status] = 'active') plus a service pre-check that yields the
 * friendlier 409 SPRINT_ACTIVE_EXISTS.
 */
export const SPRINT_ACTIVE_EXISTS_CODE = 'SPRINT_ACTIVE_EXISTS';
