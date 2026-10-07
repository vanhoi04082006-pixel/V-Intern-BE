import { AiInvalidResponseError } from '../ai-errors';
import { validateRecommendations } from './recommendations-schema';

/**
 * Recommendations schema unit tests (Phase 6, spec 29/31/50): fixed
 * categories, metric-code grounding (unknown metric → WHOLE output
 * rejected) and bounds.
 */
const VALID = {
  recommendations: [
    {
      type: 'time_management',
      priority: 'high',
      title: 'Protect focus time for overdue work',
      reason: 'onTimeCompletionRate is below target and one task is overdue.',
      actions: ['Break the overdue task into smaller steps today.'],
      evidenceMetricCodes: ['onTimeCompletionRate', 'overdueOpenTaskCount'],
    },
    {
      type: 'skill_focus',
      priority: 'medium',
      title: 'Deepen TypeScript typing skills',
      reason: 'averageEvaluationScore suggests room on the technical criterion.',
      actions: ['Do a typing exercise this week.'],
      evidenceMetricCodes: ['averageEvaluationScore'],
    },
  ],
  summary: 'Prioritize the overdue task and technical practice.',
};

describe('recommendations schema', () => {
  it('accepts a valid grounded recommendation set', () => {
    const data = validateRecommendations(VALID);
    expect(data.recommendations).toHaveLength(2);
    expect(data.recommendations[0].evidenceMetricCodes).toEqual([
      'onTimeCompletionRate',
      'overdueOpenTaskCount',
    ]);
  });

  it('rejects an unknown/made-up evidence metric code WHOLE (spec 50)', () => {
    const bad = {
      ...VALID,
      recommendations: [
        {
          type: 'skill_focus',
          priority: 'high',
          title: 'x',
          reason: 'y',
          actions: ['z'],
          evidenceMetricCodes: ['madeUpMetric'],
        },
      ],
    };
    expect(() => validateRecommendations(bad)).toThrow(/unknown metric 'madeUpMetric'/);
  });

  it('rejects an unknown category and bad priority (spec 29)', () => {
    const badType = {
      ...VALID,
      recommendations: [{ ...VALID.recommendations[0], type: 'random_vibes' }],
    };
    expect(() => validateRecommendations(badType)).toThrow(/not an allowed category/);
    const badPriority = {
      ...VALID,
      recommendations: [{ ...VALID.recommendations[0], priority: 'urgent' }],
    };
    expect(() => validateRecommendations(badPriority)).toThrow(/priority/);
  });

  it('rejects empty evidence arrays and non-string codes', () => {
    const empty = {
      ...VALID,
      recommendations: [{ ...VALID.recommendations[0], evidenceMetricCodes: [] }],
    };
    expect(() => validateRecommendations(empty)).toThrow(/non-empty/);
    const nonString = {
      ...VALID,
      recommendations: [{ ...VALID.recommendations[0], evidenceMetricCodes: [42] }],
    };
    expect(() => validateRecommendations(nonString)).toThrow(AiInvalidResponseError);
  });

  it('deduplicates repeated metric codes', () => {
    const data = validateRecommendations({
      ...VALID,
      recommendations: [
        {
          ...VALID.recommendations[0],
          evidenceMetricCodes: ['taskCompletionRate', 'taskCompletionRate'],
        },
      ],
    });
    expect(data.recommendations[0].evidenceMetricCodes).toEqual(['taskCompletionRate']);
  });

  it('enforces cardinality and summary bounds', () => {
    const tooMany = Array.from({ length: 9 }, () => VALID.recommendations[0]);
    expect(() => validateRecommendations({ ...VALID, recommendations: tooMany })).toThrow(
      /exceeds 8 items/,
    );
    expect(() =>
      validateRecommendations({ ...VALID, summary: 'x'.repeat(1001) }),
    ).toThrow(/exceeds 1000/);
    expect(() => validateRecommendations({ recommendations: [], summary: 's' })).toThrow(
      /at least one/,
    );
  });
});
