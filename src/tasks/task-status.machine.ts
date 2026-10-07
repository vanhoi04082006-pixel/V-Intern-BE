/**
 * Task workflow state machine (Phase 3, spec 5/6/7).
 *
 *   todo   → doing
 *   doing  → review
 *   review → done | doing (doing = rework requested, tasks.manage only)
 *   done   → (terminal)
 *
 * One DB vocabulary everywhere: todo/doing/review/done. The codebase never
 * mixes to_do / in_progress / completed synonyms (spec 6).
 */
export const TASK_STATUSES = ['todo', 'doing', 'review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ['doing'],
  doing: ['review'],
  review: ['done', 'doing'],
  done: [],
};

export const INVALID_TASK_TRANSITION_CODE = 'INVALID_TASK_TRANSITION';

/**
 * Transitions an intern may perform on their OWN task (spec 7/8):
 * start work and submit for review. Approval (review→done) and rework
 * (review→doing) are instructor/admin actions (tasks.manage) only.
 */
const INTERN_ALLOWED_PAIRS: ReadonlySet<string> = new Set(['todo->doing', 'doing->review']);

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function isInternAllowedTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  return INTERN_ALLOWED_PAIRS.has(`${from}->${to}`);
}

/** Status priority used to pick the intern's "focused task" (spec 23). */
export const TASK_FOCUS_ORDER: Record<TaskStatus, number> = {
  doing: 0,
  review: 1,
  todo: 2,
  done: 3,
};
