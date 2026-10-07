/**
 * Server-side question selection (Phase 4, spec 14/15).
 *
 * APPROVED DISTRIBUTION (preserved from the raw product — spec 14):
 *   exactly 8 questions per session = 5 technical + 3 soft skill.
 * This supports the 70/30 scoring model and matches the approved UI.
 *
 * Selection happens SERVER-SIDE only (interns never choose questions).
 * Each category pool is shuffled independently; the session presents all
 * technical questions first, then soft-skill questions (documented
 * composition — never random accidental structure).
 */
export const INTERVIEW_QUESTION_COUNT = 8;
export const TECHNICAL_QUESTION_COUNT = 5;
export const SOFT_QUESTION_COUNT = 3;

export type InterviewCategory = 'technical' | 'soft';

export interface SelectableQuestion {
  id: string;
  category: InterviewCategory;
  difficulty: string;
  prompt: string;
  rubricJson: string;
}

export interface SelectedQuestion {
  questionId: string;
  position: number;
  category: InterviewCategory;
  prompt: string;
  difficulty: string;
  rubricJson: string;
}

/** Fisher–Yates shuffle (Fisher–Yates via crypto-quality Math.random is fine here). */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sampleWithoutReplacement<T>(items: readonly T[], count: number): T[] {
  if (count > items.length) {
    throw new Error(`cannot sample ${count} items from a pool of ${items.length}`);
  }
  return shuffle(items).slice(0, count);
}

export class QuestionPoolInsufficientError extends Error {
  readonly code = 'INTERVIEW_QUESTION_POOL_INSUFFICIENT';
  constructor(roleCode: string, missing: Array<{ category: InterviewCategory; needed: number; available: number }>) {
    super(`Question pool for role '${roleCode}' is insufficient: ${JSON.stringify(missing)}`);
    this.name = 'QuestionPoolInsufficientError';
  }
}

/**
 * Select and position the session's question snapshot set. Throws
 * QuestionPoolInsufficientError when either category lacks questions.
 */
export function selectSessionQuestions(
  roleCode: string,
  pool: readonly SelectableQuestion[],
): SelectedQuestion[] {
  const technical = pool.filter((q) => q.category === 'technical');
  const soft = pool.filter((q) => q.category === 'soft');

  const missing: Array<{ category: InterviewCategory; needed: number; available: number }> = [];
  if (technical.length < TECHNICAL_QUESTION_COUNT) {
    missing.push({
      category: 'technical',
      needed: TECHNICAL_QUESTION_COUNT,
      available: technical.length,
    });
  }
  if (soft.length < SOFT_QUESTION_COUNT) {
    missing.push({ category: 'soft', needed: SOFT_QUESTION_COUNT, available: soft.length });
  }
  if (missing.length > 0) {
    throw new QuestionPoolInsufficientError(roleCode, missing);
  }

  const pickedTechnical = sampleWithoutReplacement(technical, TECHNICAL_QUESTION_COUNT);
  const pickedSoft = sampleWithoutReplacement(soft, SOFT_QUESTION_COUNT);

  // Documented composition: technical first, then soft skill.
  const ordered = [...pickedTechnical, ...pickedSoft];

  return ordered.map((q, index) => ({
    questionId: q.id,
    position: index + 1,
    category: q.category,
    prompt: q.prompt,
    difficulty: q.difficulty,
    rubricJson: q.rubricJson,
  }));
}
