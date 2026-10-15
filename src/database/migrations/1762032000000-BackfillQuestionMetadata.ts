import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds missing descriptive fields only. Existing rubric values and session snapshots stay intact. */
export class BackfillQuestionMetadata1762032000000 implements MigrationInterface {
  name = 'BackfillQuestionMetadata1762032000000';
  async up(q: QueryRunner): Promise<void> {
    const rows: Array<{ id: string; roleCode: string; category: string; difficulty: string; prompt: string; rubricJson: string }> = await q.query('SELECT id,roleCode,category,difficulty,prompt,rubricJson FROM interview_questions');
    for (const row of rows) {
      const rubric = JSON.parse(row.rubricJson) as Record<string, unknown>;
      const keywords = Array.isArray(rubric.keywords) ? rubric.keywords.filter((k): k is string => typeof k === 'string') : [];
      const additions: Record<string, unknown> = {
        language: rubric.phase === 'english' || /^[\x00-\x7F]*$/.test(row.prompt) ? 'en' : 'vi',
        expectedConcepts: keywords,
        exampleAnswer: rubric.expected ?? '',
        scoringRubric: rubric.scoringGuide ?? '',
        followUpHints: ['Ask for a concrete example or clarification of the candidate’s own claim without revealing the expected answer.'],
        tags: [...new Set([row.roleCode, row.category, row.difficulty, ...(typeof rubric.phase === 'string' ? [rubric.phase] : []), ...keywords])],
      };
      let changed = false;
      for (const [key, value] of Object.entries(additions)) if (rubric[key] === undefined) { rubric[key] = value; changed = true; }
      if (changed) await q.query('UPDATE interview_questions SET rubricJson=@1 WHERE id=@0', [row.id, JSON.stringify(rubric)]);
    }
  }
  async down(): Promise<void> {
    // Deliberately preserve product configuration when rolling back application code.
  }
}
