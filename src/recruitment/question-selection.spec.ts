import {
  INTERVIEW_QUESTION_COUNT,
  SOFT_QUESTION_COUNT,
  TECHNICAL_QUESTION_COUNT,
  QuestionPoolInsufficientError,
  selectSessionQuestions,
  sampleWithoutReplacement,
  shuffle,
  type SelectableQuestion,
} from './question-selection';

function question(id: string, category: 'technical' | 'soft'): SelectableQuestion {
  return {
    id,
    category,
    difficulty: 'medium',
    prompt: `prompt-${id}`,
    rubricJson: `{"secret":"${id}"}`,
  };
}

function fullPool(): SelectableQuestion[] {
  return [
    ...Array.from({ length: 8 }, (_, i) => question(`t${i + 1}`, 'technical')),
    ...Array.from({ length: 5 }, (_, i) => question(`s${i + 1}`, 'soft')),
  ];
}

/** Question selection policy (Phase 4 spec 14/15). */
describe('question selection (spec 14/15)', () => {
  it('approved distribution: exactly 8 = 5 technical + 3 soft', () => {
    expect(INTERVIEW_QUESTION_COUNT).toBe(8);
    expect(TECHNICAL_QUESTION_COUNT).toBe(5);
    expect(SOFT_QUESTION_COUNT).toBe(3);
  });

  it('selects exactly 8 with 5 technical then 3 soft (documented composition)', () => {
    const selected = selectSessionQuestions('frontend', fullPool());
    expect(selected).toHaveLength(8);
    expect(selected.filter((q) => q.category === 'technical')).toHaveLength(5);
    expect(selected.filter((q) => q.category === 'soft')).toHaveLength(3);
    // positions are 1..8, unique
    expect(selected.map((q) => q.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // composition order: technical first, then soft
    expect(selected.slice(0, 5).every((q) => q.category === 'technical')).toBe(true);
    expect(selected.slice(5).every((q) => q.category === 'soft')).toBe(true);
  });

  it('never selects duplicates', () => {
    for (let run = 0; run < 20; run += 1) {
      const selected = selectSessionQuestions('backend', fullPool());
      const ids = selected.map((q) => q.questionId);
      expect(new Set(ids).size).toBe(8);
    }
  });

  it('samples different compositions across runs (retake variety, spec 51)', () => {
    const compositions = new Set<string>();
    for (let run = 0; run < 30; run += 1) {
      compositions.add(
        selectSessionQuestions('qa', fullPool())
          .map((q) => q.questionId)
          .join(','),
      );
    }
    expect(compositions.size).toBeGreaterThan(1);
  });

  it('rejects an insufficient pool per category (spec 14)', () => {
    const thin = [
      ...Array.from({ length: 3 }, (_, i) => question(`t${i + 1}`, 'technical')),
      ...Array.from({ length: 5 }, (_, i) => question(`s${i + 1}`, 'soft')),
    ];
    expect(() => selectSessionQuestions('frontend', thin)).toThrow(QuestionPoolInsufficientError);
    try {
      selectSessionQuestions('frontend', thin);
    } catch (err) {
      expect((err as QuestionPoolInsufficientError).code).toBe(
        'INTERVIEW_QUESTION_POOL_INSUFFICIENT',
      );
    }
  });

  it('keeps rubric attached for internal snapshotting only', () => {
    const selected = selectSessionQuestions('qa', fullPool());
    expect(selected[0].rubricJson).toContain('secret'); // snapshot source
  });

  it('shuffle/sample helpers behave (spec 15)', () => {
    const items = [1, 2, 3, 4, 5];
    const shuffled = shuffle(items);
    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort()).toEqual(items);
    expect(sampleWithoutReplacement(items, 3)).toHaveLength(3);
    expect(() => sampleWithoutReplacement(items, 6)).toThrow();
  });
});
