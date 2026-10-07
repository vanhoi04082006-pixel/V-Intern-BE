import {
  canTransitionEvaluation,
  canTransitionEvaluationCycle,
  EVALUATION_CYCLE_STATUSES,
  EVALUATION_STATUSES,
} from './evaluation-status.machine';

describe('EvaluationCycle state machine (spec 7)', () => {
  it('allows exactly the legal transitions', () => {
    expect(canTransitionEvaluationCycle('draft', 'open')).toBe(true);
    expect(canTransitionEvaluationCycle('draft', 'archived')).toBe(true);
    expect(canTransitionEvaluationCycle('open', 'closed')).toBe(true);
    expect(canTransitionEvaluationCycle('closed', 'archived')).toBe(true);
  });

  it('rejects every illegal transition', () => {
    expect(canTransitionEvaluationCycle('draft', 'closed')).toBe(false);
    expect(canTransitionEvaluationCycle('open', 'open')).toBe(false);
    expect(canTransitionEvaluationCycle('open', 'draft')).toBe(false);
    expect(canTransitionEvaluationCycle('open', 'archived')).toBe(false);
    expect(canTransitionEvaluationCycle('closed', 'open')).toBe(false);
    expect(canTransitionEvaluationCycle('closed', 'draft')).toBe(false);
    expect(canTransitionEvaluationCycle('archived', 'draft')).toBe(false);
    expect(canTransitionEvaluationCycle('archived', 'open')).toBe(false);
    expect(canTransitionEvaluationCycle('archived', 'closed')).toBe(false);
  });

  it('archived is terminal; every status appears in the machine', () => {
    for (const status of EVALUATION_CYCLE_STATUSES) {
      expect(canTransitionEvaluationCycle('archived', status)).toBe(false);
    }
  });
});

describe('Evaluation state machine (spec 11)', () => {
  it('draft → submitted → finalized only', () => {
    expect(canTransitionEvaluation('draft', 'submitted')).toBe(true);
    expect(canTransitionEvaluation('submitted', 'finalized')).toBe(true);
    expect(canTransitionEvaluation('draft', 'finalized')).toBe(false);
    expect(canTransitionEvaluation('submitted', 'draft')).toBe(false);
    expect(canTransitionEvaluation('finalized', 'draft')).toBe(false);
    expect(canTransitionEvaluation('finalized', 'submitted')).toBe(false);
  });

  it('covers the full documented vocabulary', () => {
    expect(EVALUATION_STATUSES).toEqual(['draft', 'submitted', 'finalized']);
  });
});
