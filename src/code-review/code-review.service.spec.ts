import { CodeReviewService } from './code-review.service';

it('runs the automatically requested Agent as the managing mentor, preserving the student as submission subject', async () => {
  const submission = { id: 'submission', internId: 'student', taskId: 'task', status: 'submitted', headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), repositoryId: 'repository', summary: 'Student coursework' };
  const task = { id: 'task', projectId: 'project', sprintId: 'sprint', code: 'TASK-1', title: 'Task' };
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('TOP(10)')) return [];
    if (sql.includes('SELECT * FROM task_submissions')) return [submission];
    if (sql.includes('FROM projects')) return [{ mentorId: 'mentor' }];
    if (sql.includes('FROM users')) return [{ status: 'active' }];
    if (sql.includes('SELECT sessionId FROM sprints')) return [{ sessionId: 'session' }];
    if (sql.includes('COUNT(1)')) return [{ n: 1 }];
    if (sql.includes('SELECT r.ownerLogin')) return [{ ownerLogin: 'owner', repoName: 'coursework' }];
    if (sql.includes("status='submitted' AND headSha")) return [{ id: submission.id }];
    return [];
  });
  const db = { query, transaction: async (work: (em: { query: typeof query }) => Promise<unknown>) => work({ query }) };
  const ai = { generateStructuredWithRun: jest.fn().mockResolvedValue({ data: { rubric: {}, summary: 'Verified review feedback.', findings: [], limitations: [], score: 90 }, run: { id: 'ai-run' } }) };
  const deps = [db, { getOneDetailed: async () => task }, { accessSnapshot: async (id: string) => ({ roles: new Set([id === 'mentor' ? 'instructor' : 'intern']), permissions: new Set(id === 'mentor' ? ['tasks.manage'] : []) }), hasRole: async () => false }, { collect: async () => ({ complete: true, files: [] }), evidenceSummary: () => ({}), assertFresh: async () => undefined }, { grade: async () => ({ status: 'completed', passed: 1, failed: 0 }) }, ai] as unknown as ConstructorParameters<typeof CodeReviewService>;
  await new CodeReviewService(...deps).run(submission.id, { userId: 'student', email: '' });
  expect(ai.generateStructuredWithRun).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'mentor', userId: 'student', resourceId: submission.id }));
  expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO submission_code_reviews(id,submissionId,headSha,status,leaseId,promptVersion)'), expect.arrayContaining(['code-review-v2']));
});
