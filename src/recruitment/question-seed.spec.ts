import { DataSource } from 'typeorm';
import { ensureRecruitmentQuestions, QUESTION_BANK_TOTAL } from './question-seed';
import { RECRUITMENT_ROLE_CODES } from './recruitment-roles';

describe('role-specific question library', () => {
  it('seeds at least 180 complete questions with adequate variety in every role, then reruns without edits', async () => {
    const rows: Array<{ roleCode: string; sortOrder: number; category: string; prompt: string; rubricJson: string }> = [];
    const repo = { find: async () => rows, create: (r: unknown) => r, insert: jest.fn(async (r: typeof rows[number]) => rows.push(r)) };
    const db = { getRepository: () => repo } as unknown as DataSource;
    const first = await ensureRecruitmentQuestions(db);
    expect(QUESTION_BANK_TOTAL).toBeGreaterThanOrEqual(180);
    expect(first.inserted).toBe(QUESTION_BANK_TOTAL);
    expect(RECRUITMENT_ROLE_CODES).toContain('fullstack');
    for (const role of RECRUITMENT_ROLE_CODES) {
      const questions = rows.filter(q => q.roleCode === role);
      expect(questions.filter(q => q.category === 'technical').length).toBeGreaterThanOrEqual(20);
      expect(new Set(questions.map(q => q.sortOrder)).size).toBe(questions.length);
      expect(new Set(questions.map(q => q.prompt)).size).toBe(questions.length);
      for (const question of questions) {
        const metadata = JSON.parse(question.rubricJson);
        expect(['vi', 'en']).toContain(metadata.language);
        expect(metadata.exampleAnswer.length).toBeGreaterThan(20);
        expect(metadata.scoringRubric.length).toBeGreaterThan(20);
        expect(metadata.expectedConcepts).toBeInstanceOf(Array);
        expect(metadata.followUpHints.length).toBeGreaterThan(0);
        expect(metadata.tags).toContain(role);
      }
    }
    expect((await ensureRecruitmentQuestions(db)).inserted).toBe(0);
    expect(repo.insert).toHaveBeenCalledTimes(QUESTION_BANK_TOTAL);
  });
});
