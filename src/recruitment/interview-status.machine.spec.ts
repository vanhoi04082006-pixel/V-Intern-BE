import {
  INTERVIEW_SESSION_STATUSES,
  INTERVIEW_SESSION_TRANSITIONS,
  canTransitionInterviewSession,
  isInterviewAnswerable,
  isInterviewTerminal,
} from './interview-status.machine';

/**
 * InterviewSession state machine matrix (Phase 4 spec 12/63) — every
 * documented transition, terminal rules, answerability windows.
 */
describe('interview session state machine (spec 63)', () => {
  it('has exactly the documented statuses', () => {
    expect(INTERVIEW_SESSION_STATUSES).toEqual([
      'created',
      'in_progress',
      'submitted',
      'evaluating',
      'completed',
      'evaluation_failed',
      'expired',
      'cancelled',
    ]);
  });

  it('legal transitions match the documented machine', () => {
    const legal: Array<[string, string]> = [
      ['created', 'in_progress'],
      ['created', 'cancelled'],
      ['in_progress', 'submitted'],
      ['in_progress', 'expired'],
      ['in_progress', 'cancelled'],
      ['submitted', 'evaluating'],
      ['evaluating', 'completed'],
      ['evaluating', 'evaluation_failed'],
      ['evaluation_failed', 'evaluating'],
    ];
    for (const [from, to] of legal) {
      expect(canTransitionInterviewSession(from as never, to as never)).toBe(true);
    }
  });

  it('rejects every illegal transition pair (exhaustive matrix)', () => {
    for (const from of INTERVIEW_SESSION_STATUSES) {
      for (const to of INTERVIEW_SESSION_STATUSES) {
        const legal = INTERVIEW_SESSION_TRANSITIONS[from].includes(to);
        expect(canTransitionInterviewSession(from, to)).toBe(legal);
      }
    }
    // Critical rejections:
    expect(canTransitionInterviewSession('created', 'submitted')).toBe(false);
    expect(canTransitionInterviewSession('created', 'completed')).toBe(false);
    expect(canTransitionInterviewSession('in_progress', 'completed')).toBe(false);
    expect(canTransitionInterviewSession('in_progress', 'evaluating')).toBe(false); // must pass submitted
    expect(canTransitionInterviewSession('submitted', 'completed')).toBe(false);
    expect(canTransitionInterviewSession('completed', 'evaluating')).toBe(false);
    expect(canTransitionInterviewSession('expired', 'in_progress')).toBe(false);
    expect(canTransitionInterviewSession('cancelled', 'in_progress')).toBe(false);
    expect(canTransitionInterviewSession('evaluation_failed', 'completed')).toBe(false); // must re-enter evaluating
    expect(canTransitionInterviewSession('completed', 'evaluation_failed')).toBe(false);
  });

  it('terminal rules: completed/expired/cancelled frozen', () => {
    expect(isInterviewTerminal('completed')).toBe(true);
    expect(isInterviewTerminal('expired')).toBe(true);
    expect(isInterviewTerminal('cancelled')).toBe(true);
    expect(isInterviewTerminal('created')).toBe(false);
    expect(isInterviewTerminal('in_progress')).toBe(false);
    expect(isInterviewTerminal('submitted')).toBe(false);
    expect(isInterviewTerminal('evaluating')).toBe(false);
    expect(isInterviewTerminal('evaluation_failed')).toBe(false); // retryable (spec 39)
  });

  it('answers only writable while in_progress (spec 16)', () => {
    for (const s of INTERVIEW_SESSION_STATUSES) {
      expect(isInterviewAnswerable(s)).toBe(s === 'in_progress');
    }
  });
});
