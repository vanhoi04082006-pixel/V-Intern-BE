/**
 * EvaluationCycle state machine (Phase 5, spec 7) — explicit transitions,
 * no arbitrary strings; the DB CHECK mirrors the same vocabulary.
 *
 *   draft → open | archived
 *   open  → closed
 *   closed → archived
 *   archived → (terminal)
 */
export const EVALUATION_CYCLE_STATUSES = ['draft', 'open', 'closed', 'archived'] as const;
export type EvaluationCycleStatus = (typeof EVALUATION_CYCLE_STATUSES)[number];

export const EVALUATION_CYCLE_TYPES = ['sprint', 'midterm', 'final'] as const;
export type EvaluationCycleType = (typeof EVALUATION_CYCLE_TYPES)[number];

export const EVALUATION_CYCLE_TRANSITIONS: Record<EvaluationCycleStatus, readonly EvaluationCycleStatus[]> = {
  draft: ['open', 'archived'],
  open: ['closed'],
  closed: ['archived'],
  archived: [],
};

export function canTransitionEvaluationCycle(from: EvaluationCycleStatus, to: EvaluationCycleStatus): boolean {
  return EVALUATION_CYCLE_TRANSITIONS[from].includes(to);
}

/** Evaluation document statuses (spec 11): draft → submitted → finalized. */
export const EVALUATION_STATUSES = ['draft', 'submitted', 'finalized'] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const EVALUATION_TRANSITIONS: Record<EvaluationStatus, readonly EvaluationStatus[]> = {
  draft: ['submitted'],
  submitted: ['finalized'],
  finalized: [],
};

export function canTransitionEvaluation(from: EvaluationStatus, to: EvaluationStatus): boolean {
  return EVALUATION_TRANSITIONS[from].includes(to);
}

/** Error codes (stable domain vocabulary — spec 65). */
export const EVALUATION_ERROR_CODES = {
  CYCLE_NOT_FOUND: 'EVALUATION_CYCLE_NOT_FOUND',
  CYCLE_NOT_OPEN: 'EVALUATION_CYCLE_NOT_OPEN',
  CRITERIA_INCOMPLETE: 'EVALUATION_CRITERIA_INCOMPLETE',
  WEIGHT_INVALID: 'EVALUATION_WEIGHT_INVALID',
  NOT_FOUND: 'EVALUATION_NOT_FOUND',
  ALREADY_FINALIZED: 'EVALUATION_ALREADY_FINALIZED',
  INVALID_CYCLE_TRANSITION: 'INVALID_EVALUATION_CYCLE_TRANSITION',
  INVALID_EVALUATION_TRANSITION: 'INVALID_EVALUATION_TRANSITION',
  SCORE_OUT_OF_BOUNDS: 'EVALUATION_SCORE_OUT_OF_BOUNDS',
  SCOPE_FORBIDDEN: 'EVALUATION_SCOPE_FORBIDDEN',
  INTERN_NOT_IN_SCOPE: 'EVALUATION_INTERN_NOT_IN_SCOPE',
  CYCLE_NOT_EDITABLE: 'EVALUATION_CYCLE_NOT_EDITABLE',
  CRITERION_NOT_FOUND: 'EVALUATION_CRITERION_NOT_FOUND',
  ALREADY_EXISTS: 'EVALUATION_ALREADY_EXISTS',
} as const;
