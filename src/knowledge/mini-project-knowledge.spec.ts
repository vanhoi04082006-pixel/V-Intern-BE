import { MINI_PROJECT_KNOWLEDGE } from './mini-project-knowledge';
import { normalizeKnowledgeDraft } from './knowledge.policy';
import { validateKnowledgePublication } from './knowledge-publication.policy';
import { allowedKnowledge, KNOWLEDGE_CONSUMERS, retrievalPolicy } from './knowledge-retrieval.policy';
import { KNOWLEDGE_PURPOSES, KnowledgeSnapshot } from './knowledge.contracts';

describe('multi-Agent mini-project reference bundle', () => {
  it('contains eighteen independently publishable drafts with stable unique codes and sources', () => {
    expect(MINI_PROJECT_KNOWLEDGE).toHaveLength(18);
    expect(new Set(MINI_PROJECT_KNOWLEDGE.map(row => row.code)).size).toBe(18);
    for (const row of MINI_PROJECT_KNOWLEDGE) {
      expect(row.code).toMatch(/^[a-z][a-z0-9_-]{1,79}$/);
      expect(() => normalizeKnowledgeDraft(row.draft)).not.toThrow();
      expect(() => validateKnowledgePublication(row.draft)).not.toThrow();
      expect(row.draft.sources.length).toBeGreaterThan(0);
      if (row.draft.kind === 'qa') {
        expect(row.draft.audience).toBe('grading_only');
        expect(row.draft.body.validAnswers).toHaveLength(2);
      }
    }
    const purposes = new Set(MINI_PROJECT_KNOWLEDGE.flatMap(row => row.draft.purposes));
    expect([...purposes].sort()).toEqual([...KNOWLEDGE_PURPOSES].sort());
  });
  it('has usable reference material for each consumer while keeping answers away from student-facing consumers', () => {
    for (const consumer of KNOWLEDGE_CONSUMERS) {
      const policy = retrievalPolicy(consumer);
      const matches = MINI_PROJECT_KNOWLEDGE.filter(row => allowedKnowledge({
        id: row.code, code: row.code, version: 1, sha256: 'a'.repeat(64), score: 1,
        snapshot: { ...row.draft, code: row.code, version: 1, status: 'published', schemaVersion: 1 } as KnowledgeSnapshot,
      }, policy, ['backend']));
      expect(matches.length).toBeGreaterThan(0);
      if (['mentor', 'interviewer', 'advisor', 'knowledge-assistant'].includes(consumer)) {
        expect(matches.every(row => row.draft.audience === 'student_safe' && !['qa', 'solution', 'rubric'].includes(row.draft.kind))).toBe(true);
      }
    }
    // Nothing in the export is published merely because it passes the structural gate.
    expect(MINI_PROJECT_KNOWLEDGE.every(row => !Object.hasOwn(row, 'status'))).toBe(true);
  });
});
