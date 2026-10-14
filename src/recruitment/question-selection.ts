/** Version 2: two introductions, six role questions, two English questions.
 * Scoring categories stay technical/soft for compatibility with old snapshots.
 */
export const INTERVIEW_QUESTION_COUNT = 10;
export const TECHNICAL_QUESTION_COUNT = 6;
export const SOFT_QUESTION_COUNT = 4;

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
  const introduction = pool.filter((q) => q.category === 'soft' && questionPhase(q) === 'introduction');
  const english = pool.filter((q) => q.category === 'soft' && questionPhase(q) === 'english');
  const missing: Array<{ category: InterviewCategory; needed: number; available: number }> = [];
  if (technical.length < TECHNICAL_QUESTION_COUNT) missing.push({ category: 'technical', needed: TECHNICAL_QUESTION_COUNT, available: technical.length });
  if (introduction.length < 2) missing.push({ category: 'soft', needed: 2, available: introduction.length });
  if (english.length < 2) missing.push({ category: 'soft', needed: 2, available: english.length });
  if (missing.length) throw new QuestionPoolInsufficientError(roleCode, missing);
  const ordered = [...sampleWithoutReplacement(introduction, 2), ...sampleWithoutReplacement(technical, TECHNICAL_QUESTION_COUNT), ...sampleWithoutReplacement(english, 2)];

  return ordered.map((q, index) => ({
    questionId: q.id,
    position: index + 1,
    category: q.category,
    prompt: q.prompt,
    difficulty: q.difficulty,
    rubricJson: q.rubricJson,
  }));
}

export function questionPhase(q: { category: string; rubricJson: string }): 'introduction' | 'technical' | 'english' | 'soft' {
  if (q.category === 'technical') return 'technical';
  try { const rubric = JSON.parse(q.rubricJson) as { phase?: string }; if (rubric.phase === 'introduction' || rubric.phase === 'english') return rubric.phase; } catch { /* Historical rubrics without stage remain soft-skill questions. */ }
  return 'soft';
}
