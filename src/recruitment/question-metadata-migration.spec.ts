import { QueryRunner } from 'typeorm';
import { BackfillQuestionMetadata1762032000000 } from '../database/migrations/1762032000000-BackfillQuestionMetadata';
describe('question metadata backfill', () => {
  it('adds missing fields without changing edited rubrics or immutable interview snapshots', async () => {
    const original = { expected: 'Edited reference answer', keywords: ['transaction'], scoringGuide: 'Edited guide', tags: ['custom-tag'] };
    const query = jest.fn(async (sql: string) => sql.startsWith('SELECT') ? [{ id: 'q1', roleCode: 'backend', category: 'technical', difficulty: 'medium', prompt: 'Explain a transaction', rubricJson: JSON.stringify(original) }] : []);
    await new BackfillQuestionMetadata1762032000000().up({ query } as unknown as QueryRunner);
    const updated = JSON.parse((query.mock.calls[1] as unknown as [string, [string, string]])[1][1]);
    expect(updated).toMatchObject({ ...original, language: 'en', expectedConcepts: ['transaction'], exampleAnswer: original.expected, scoringRubric: original.scoringGuide });
    expect(query.mock.calls.every(([sql]) => !sql.includes('interview_session_questions'))).toBe(true);
  });
});
