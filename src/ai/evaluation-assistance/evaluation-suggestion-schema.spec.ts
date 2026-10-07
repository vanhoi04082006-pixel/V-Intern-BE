import { AiInvalidResponseError } from '../ai-errors';
import { validateEvaluationSuggestion } from './evaluation-suggestion-schema';

/**
 * Evaluation suggestion schema unit tests (Phase 6, spec 23/24/47):
 * criterion-code authority, maxScore bound, bounds and duplicate rules.
 * The suggestion is NON-AUTHORITATIVE — validation guarantees it can only
 * ever reference criteria of the evaluation's own cycle.
 */
const CRITERIA = [
  { code: 'technical_quality', maxScore: 100 },
  { code: 'delivery_execution', maxScore: 100 },
  { code: 'communication_teamwork', maxScore: 10 },
];

const VALID = {
  criterionSuggestions: [
    {
      criterionCode: 'technical_quality',
      suggestedScore: 82.5,
      evidence: ['taskCompletionRate=75.0'],
      comment: 'Solid delivery pace.',
    },
    {
      criterionCode: 'communication_teamwork',
      suggestedScore: 8,
      evidence: [],
      comment: null,
    },
  ],
  strengths: ['Fast learner'],
  improvementAreas: ['Test coverage'],
  summary: 'Good sprint overall.',
  confidence: 0.7,
};

describe('evaluation suggestion schema', () => {
  it('accepts a valid suggestion bound to real criteria', () => {
    const data = validateEvaluationSuggestion(VALID, CRITERIA);
    expect(data.criterionSuggestions).toHaveLength(2);
    expect(data.criterionSuggestions[0].suggestedScore).toBe(82.5);
    expect(data.criterionSuggestions[1].comment).toBeNull();
    expect(data.confidence).toBe(0.7);
  });

  it('rejects an unknown criterion code WHOLE (spec 23/50)', () => {
    const bad = {
      ...VALID,
      criterionSuggestions: [
        { criterionCode: 'madeUpCriterion', suggestedScore: 50, evidence: [], comment: null },
      ],
    };
    expect(() => validateEvaluationSuggestion(bad, CRITERIA)).toThrow(/not a criterion of this evaluation cycle/);
  });

  it('rejects a suggested score above the criterion maxScore (not clamped)', () => {
    const bad = {
      ...VALID,
      criterionSuggestions: [
        { criterionCode: 'communication_teamwork', suggestedScore: 95, evidence: [], comment: null },
      ],
    };
    expect(() => validateEvaluationSuggestion(bad, CRITERIA)).toThrow(/exceeds criterion 'communication_teamwork' maxScore 10/);
  });

  it('rejects duplicate criterion codes and out-of-range scores', () => {
    const dup = {
      ...VALID,
      criterionSuggestions: [
        { criterionCode: 'technical_quality', suggestedScore: 50, evidence: [], comment: null },
        { criterionCode: 'technical_quality', suggestedScore: 60, evidence: [], comment: null },
      ],
    };
    expect(() => validateEvaluationSuggestion(dup, CRITERIA)).toThrow(/duplicate/);

    const negative = {
      ...VALID,
      criterionSuggestions: [
        { criterionCode: 'technical_quality', suggestedScore: -1, evidence: [], comment: null },
      ],
    };
    expect(() => validateEvaluationSuggestion(negative, CRITERIA)).toThrow(AiInvalidResponseError);
  });

  it('rejects bad confidence and unbounded strings', () => {
    expect(() =>
      validateEvaluationSuggestion({ ...VALID, confidence: 1.5 }, CRITERIA),
    ).toThrow(/confidence/);
    expect(() =>
      validateEvaluationSuggestion({ ...VALID, summary: 'x'.repeat(2001) }, CRITERIA),
    ).toThrow(/exceeds 2000/);
    expect(() =>
      validateEvaluationSuggestion(
        { ...VALID, criterionSuggestions: [{ ...VALID.criterionSuggestions[0], evidence: ['x'.repeat(301)] }] },
        CRITERIA,
      ),
    ).toThrow(/exceeds 300/);
  });

  it('rejects non-object and missing-array payloads', () => {
    expect(() => validateEvaluationSuggestion('x', CRITERIA)).toThrow(AiInvalidResponseError);
    expect(() =>
      validateEvaluationSuggestion({ strengths: [], improvementAreas: [], summary: 's', confidence: 0.5 }, CRITERIA),
    ).toThrow(/criterionSuggestions/);
  });

  it('rejects suggestions when the cycle has no criteria', () => {
    expect(() => validateEvaluationSuggestion(VALID, [])).toThrow(/no criteria/);
  });
});
