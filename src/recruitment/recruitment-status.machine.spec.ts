import {
  RECRUITMENT_PROFILE_STATUSES,
  RECRUITMENT_PROFILE_TRANSITIONS,
  canTransitionRecruitmentProfile,
  isRecruitmentPassed,
} from './recruitment-status.machine';

/**
 * RecruitmentProfile state machine matrix (Phase 4 spec 7/63) — every
 * legal transition asserted, every illegal pair rejected.
 */
describe('recruitment profile state machine (spec 63)', () => {
  it('has exactly the documented statuses', () => {
    expect(RECRUITMENT_PROFILE_STATUSES).toEqual([
      'not_started',
      'role_selected',
      'interview_in_progress',
      'evaluation_pending',
      'passed',
      'failed',
    ]);
  });

  it('legal transitions match the documented machine', () => {
    const legal: Array<[string, string]> = [
      ['not_started', 'role_selected'],
      ['role_selected', 'interview_in_progress'],
      ['interview_in_progress', 'evaluation_pending'],
      ['interview_in_progress', 'role_selected'], // audited schedule preparation after session expiry/cancellation
      ['evaluation_pending', 'passed'],
      ['evaluation_pending', 'failed'],
      ['failed', 'role_selected'],
      ['failed', 'interview_in_progress'],
    ];
    for (const [from, to] of legal) {
      expect(canTransitionRecruitmentProfile(from as never, to as never)).toBe(true);
      expect(RECRUITMENT_PROFILE_TRANSITIONS[from as never]).toContain(to);
    }
  });

  it('rejects every illegal transition pair (exhaustive matrix)', () => {
    for (const from of RECRUITMENT_PROFILE_STATUSES) {
      for (const to of RECRUITMENT_PROFILE_STATUSES) {
        const legal = RECRUITMENT_PROFILE_TRANSITIONS[from].includes(to);
        expect(canTransitionRecruitmentProfile(from, to)).toBe(legal);
      }
    }
    // Spot-check critical rejections:
    expect(canTransitionRecruitmentProfile('not_started', 'passed')).toBe(false);
    expect(canTransitionRecruitmentProfile('not_started', 'interview_in_progress')).toBe(false);
    expect(canTransitionRecruitmentProfile('role_selected', 'passed')).toBe(false);
    expect(canTransitionRecruitmentProfile('passed', 'failed')).toBe(false); // terminal
    expect(canTransitionRecruitmentProfile('passed', 'interview_in_progress')).toBe(false);
    expect(canTransitionRecruitmentProfile('interview_in_progress', 'passed')).toBe(false);
  });

  it('terminal rules (spec 63)', () => {
    expect(RECRUITMENT_PROFILE_TRANSITIONS.passed).toEqual([]);
    // failed is NOT terminal (retake policy) but passed is.
    expect(RECRUITMENT_PROFILE_TRANSITIONS.failed.length).toBeGreaterThan(0);
  });

  it('isRecruitmentPassed only for passed', () => {
    for (const s of RECRUITMENT_PROFILE_STATUSES) {
      expect(isRecruitmentPassed(s)).toBe(s === 'passed');
    }
  });
});
