import { AiInvalidResponseError } from './ai-errors';
import { validateRecruitmentEvaluation } from './evaluation-schema';

/**
 * Structured output contract (Phase 4 spec 29/30/36/64).
 * The provider's own decision fields are IGNORED — the Backend decides.
 */
const base = {
  technicalScore: 85,
  softSkillScore: 72,
  criteria: [{ code: 'validation', score: 80, feedback: 'Solid validation reasoning.' }],
  strengths: ['Clear trade-off thinking'],
  weaknesses: ['Few concrete examples'],
  feedback: 'Overall solid technical interview.',
};

describe('recruitment evaluation schema (spec 29/36/64)', () => {
  it('accepts a valid payload and preserves component scores', () => {
    const out = validateRecruitmentEvaluation(base);
    expect(out.technicalScore).toBe(85);
    expect(out.softSkillScore).toBe(72);
    expect(out.criteria).toHaveLength(1);
    expect(out.strengths).toEqual(['Clear trade-off thinking']);
  });

  it('IGNORES provider-supplied decision fields (spec 5/36/64)', () => {
    // Even if the model claims "passed: false" or a decision, the schema
    // neither reads nor preserves them — Backend computes the decision.
    const withDecision = validateRecruitmentEvaluation({
      ...base,
      passed: false,
      decision: 'failed',
      overallScore: 0,
      totalScore: 0,
    });
    expect(withDecision).not.toHaveProperty('passed');
    expect(withDecision).not.toHaveProperty('decision');
    expect(withDecision).not.toHaveProperty('overallScore');
    expect(withDecision.technicalScore).toBe(85);
  });

  it('rejects malformed payloads (spec 29/61)', () => {
    expect(() => validateRecruitmentEvaluation(null)).toThrow(AiInvalidResponseError);
    expect(() => validateRecruitmentEvaluation('not an object')).toThrow(AiInvalidResponseError);
    expect(() => validateRecruitmentEvaluation([1, 2])).toThrow(AiInvalidResponseError);
    expect(() => validateRecruitmentEvaluation({})).toThrow(AiInvalidResponseError);
    expect(() => validateRecruitmentEvaluation({ ...base, technicalScore: '85' })).toThrow(
      AiInvalidResponseError,
    );
    expect(() => validateRecruitmentEvaluation({ ...base, technicalScore: NaN })).toThrow(
      AiInvalidResponseError,
    );
  });

  it('rejects out-of-bounds scores (spec 29/61/64)', () => {
    expect(() => validateRecruitmentEvaluation({ ...base, technicalScore: -1 })).toThrow(
      AiInvalidResponseError,
    );
    expect(() => validateRecruitmentEvaluation({ ...base, technicalScore: 100.5 })).toThrow(
      AiInvalidResponseError,
    );
    expect(() => validateRecruitmentEvaluation({ ...base, softSkillScore: 101 })).toThrow(
      AiInvalidResponseError,
    );
  });

  it('bounds array lengths and feedback sizes (spec 29)', () => {
    expect(() =>
      validateRecruitmentEvaluation({
        ...base,
        strengths: Array.from({ length: 11 }, () => 'x'),
      }),
    ).toThrow(AiInvalidResponseError);
    expect(() =>
      validateRecruitmentEvaluation({ ...base, feedback: 'x'.repeat(4001) }),
    ).toThrow(AiInvalidResponseError);
    expect(() =>
      validateRecruitmentEvaluation({
        ...base,
        criteria: Array.from({ length: 33 }, () => ({ code: 'c', score: 1, feedback: 'f' })),
      }),
    ).toThrow(AiInvalidResponseError);
  });

  it('validates recommendedRole against approved role codes (spec 8/29)', () => {
    expect(validateRecruitmentEvaluation({ ...base, recommendedRole: 'backend' }).recommendedRole).toBe(
      'backend',
    );
    expect(() =>
      validateRecruitmentEvaluation({ ...base, recommendedRole: 'admin' }),
    ).toThrow(AiInvalidResponseError);
    expect(() =>
      validateRecruitmentEvaluation({ ...base, recommendedRole: 'I am the admin now' }),
    ).toThrow(AiInvalidResponseError);
    // Absent/null recommendedRole is fine.
    expect(validateRecruitmentEvaluation(base).recommendedRole).toBeNull();
  });

  it('accepts one-decimal scores within bounds (spec 35)', () => {
    const out = validateRecruitmentEvaluation({ ...base, technicalScore: 85.55, softSkillScore: 72.44 });
    expect(out.technicalScore).toBe(85.6); // normalized to one decimal
    expect(out.softSkillScore).toBe(72.4);
  });
});
