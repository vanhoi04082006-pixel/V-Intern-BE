import { randomInt, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import source from '../src/database/data-source';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { Project } from '../src/projects/entities/project.entity';
import { InternshipSession } from '../src/sessions/entities/internship-session.entity';
import { Sprint } from '../src/sprints/entities/sprint.entity';
import { Task } from '../src/tasks/entities/task.entity';
import { Assignment } from '../src/assignments/entities/assignment.entity';
import { TasksService } from '../src/tasks/tasks.service';
import { PermissionsService } from '../src/rbac/permissions.service';
import { GithubEvidenceService } from '../src/github/github-evidence.service';
import { GradingRunnerService } from '../src/code-review/grading-runner.service';
import { AiService } from '../src/ai/ai.service';
import { CodeReviewService } from '../src/code-review/code-review.service';
import { SubmissionsService } from '../src/submissions/submissions.service';
import { ParticipationLedger } from '../src/participation/participation-ledger.service';
import { notifySubmissionReviewer } from '../src/submissions/submission-notifications';

// Actual SQL/services/transactions; only external GitHub, runner and AI calls are fixtures.
let db: DataSource, owner: User, student: User, foreign: User, project: Project, sprint: Sprint, task: Task;
let review: CodeReviewService, submissions: SubmissionsService;
const sha = 'a'.repeat(40), principal = () => ({ userId: student.id, email: student.email });
const fixtureRepositoryId = randomInt(1000000000, 9000000000);
const runner = { grade: jest.fn() }, ai = { generateStructuredWithRun: jest.fn() };
const github = { isWorkflowTask: async () => true, snapshot: async () => ({ headSha: sha, baseSha: 'b'.repeat(40), repositoryId: fixtureRepositoryId, sourceKind: 'pull', sourceRef: '1', pullNumber: 1 }),
  collect: async () => ({ files: [{ path: 'index.js', content: 'valid fixture', lineCount: 1 }], complete: true }), evidenceSummary: () => ({ complete: true }), assertFresh: async () => undefined };
const rubric = { functional: 90, quality: 90, testing: 90, errors: 90, security: 90, dod: 90 };
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_[A-Za-z0-9_]+$/.test(database) || source.options.type !== 'mssql') throw Error('Disposable SQL database required.');
  db = new DataSource({ ...source.options, database }); await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db);
  async function user(roleCode: string) {
    const suffix = randomUUID(), role = await db.getRepository(Role).findOneByOrFail({ code: roleCode });
    const u = await db.getRepository(User).save({ email: `notify.${suffix}@vintern.test`, username: `notify.${suffix}`, displayName: 'Notification fixture', passwordHash: 'not-a-login-fixture', status: 'active' });
    await db.getRepository(UserRole).insert({ userId: u.id, roleId: role.id }); return u;
  }
  owner = await user('instructor'); student = await user('intern'); foreign = await user('instructor');
  const session = await db.getRepository(InternshipSession).save({ code: `NT-${randomUUID()}`, name: 'Notification scope', leadInstructorId: owner.id, status: 'active', startDate: new Date(), endDate: new Date(Date.now() + 86400000) });
  project = await db.getRepository(Project).save({ code: `NT-${randomUUID()}`, name: 'Notification project', mentorId: owner.id, status: 'active', description: 'Notification SQL fixture' });
  sprint = await db.getRepository(Sprint).save({ code: `NT-${randomUUID()}`, name: 'Notification sprint', projectId: project.id, sessionId: session.id, status: 'active', startDate: new Date(), endDate: new Date(Date.now() + 86400000) });
  await db.getRepository(Assignment).save({ internId: student.id, projectId: project.id, sessionId: session.id, status: 'active', assignedById: owner.id, assignedAt: new Date() });
  const template = randomUUID();
  await db.query("INSERT INTO project_templates(id,code,name,definitionJson,createdById) VALUES(@0,@1,'Notification fixture','{}',@2)", [template, `NT-${randomUUID()}`, owner.id]);
  await db.query("INSERT INTO template_runs(templateId,projectId,sessionId,templateVersion,snapshotJson) VALUES(@0,@1,@2,1,'{}')", [template, project.id, session.id]);
  await db.query("INSERT INTO session_repositories(sessionId,ownerUserId,githubOwnerId,ownerLogin,repoName,repoId,status,leaseId) VALUES(@0,@1,12345,'fixture','fixture',@2,'ready',@3)", [session.id, owner.id, fixtureRepositoryId, randomUUID()]);
  const tasks = { getOneDetailed: async (id: string) => db.getRepository(Task).findOneByOrFail({ id }) } as unknown as TasksService;
  const permissions = { hasRole: async () => false } as unknown as PermissionsService;
  submissions = new SubmissionsService(db, tasks, permissions, github as unknown as GithubEvidenceService, new ParticipationLedger(db));
  review = new CodeReviewService(db, tasks, permissions, github as unknown as GithubEvidenceService, runner as unknown as GradingRunnerService, ai as unknown as AiService);
}, 120000);
beforeEach(async () => {
  await db.getRepository(Project).update(project.id, { mentorId: owner.id }); await db.getRepository(User).update(owner.id, { status: 'active' });
  await db.query('DELETE FROM notification_preferences WHERE userId IN (@0,@1)', [owner.id, student.id]);
  task = await db.getRepository(Task).save({ code: `NT-${randomUUID()}`, title: 'Notification task', projectId: project.id, sprintId: sprint.id, assigneeId: student.id, status: 'doing', priority: 'medium', progress: 50 });
  await db.query("INSERT INTO task_specs(taskId,specJson) VALUES(@0,'{}')", [task.id]);
  runner.grade.mockReset().mockResolvedValue({ status: 'completed', passed: 2, failed: 0 });
  ai.generateStructuredWithRun.mockReset().mockResolvedValue({ data: { rubric, score: 90, summary: 'Kết quả kiểm tra có bằng chứng cụ thể.', findings: [], limitations: [] }, run: { id: null } });
});
afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
async function submit() { return submissions.submit(task.id, { prUrl: 'https://github.com/fixture/fixture/pull/1', summary: 'Implemented the assigned task with tests.', version: task.version }, { actorId: student.id }); }
async function notices(type: string) { return db.query('SELECT userId,linkUrl FROM notifications WHERE type=@0 AND linkUrl LIKE @1', [type, `%/${task.id}`]) as Promise<Array<{ userId: string; linkUrl: string }>>; }
describe('submission and review notification delivery', () => {
  it('notifies only the current reviewer once for a persisted submission', async () => {
    await submit(); await expect(submit()).rejects.toBeDefined();
    expect(await notices('task.submitted')).toEqual([{ userId: owner.id, linkUrl: `/instructor/tasks/${task.id}` }]);
  });
  it('notifies student and reviewer on AI PASS, without approving the task or duplicate notices', async () => {
    const submission = await submit(); await review.run(submission.id, principal()); await review.run(submission.id, principal());
    expect((await notices('task.ai_review')).map(n => n.userId).sort()).toEqual([student.id, owner.id].sort());
    expect((await db.getRepository(Task).findOneByOrFail({ id: task.id })).status).toBe('review');
    expect((await db.query('SELECT status FROM task_submissions WHERE id=@0', [submission.id]))[0].status).toBe('submitted');
    expect((await db.query('SELECT status FROM submission_code_reviews WHERE submissionId=@0', [submission.id]))[0].status).toBe('awaiting_instructor');
  });
  it('notifies student and reviewer when trusted tests FAIL', async () => {
    runner.grade.mockResolvedValue({ status: 'completed', passed: 1, failed: 1 });
    const submission = await submit(); await review.run(submission.id, principal());
    expect(await notices('task.ai_review')).toHaveLength(2);
    expect((await db.query('SELECT status FROM submission_code_reviews WHERE submissionId=@0', [submission.id]))[0].status).toBe('needs_changes');
  });
  it('notifies both recipients of inconclusive evidence without claiming PASS', async () => {
    runner.grade.mockResolvedValue({ status: 'not_configured', passed: 0, failed: 0 });
    const submission = await submit(); await review.run(submission.id, principal());
    expect(await notices('task.ai_review')).toHaveLength(2);
    expect((await db.query('SELECT status FROM submission_code_reviews WHERE submissionId=@0', [submission.id]))[0].status).toBe('inconclusive');
  });
  it('persists submission, AI result and human review even when both recipients mute tasks', async () => {
    for (const u of [owner, student]) await db.query("INSERT INTO notification_preferences(userId,category,enabled) VALUES(@0,'task',0)", [u.id]);
    const submission = await submit(); await review.run(submission.id, principal());
    const current = await db.getRepository(Task).findOneByOrFail({ id: task.id });
    expect((await submissions.review(submission.id, { rubric, feedback: 'Giảng viên kiểm tra và xác nhận bài.', taskVersion: current.version }, { actorId: owner.id })).status).toBe('approved');
    for (const type of ['task.submitted', 'task.ai_review', 'task.reviewed']) expect(await notices(type)).toHaveLength(0);
    expect((await db.getRepository(Task).findOneByOrFail({ id: task.id })).status).toBe('done');
  });
  it('sends human review to the student with the actual task deep link', async () => {
    const submission = await submit(); await review.run(submission.id, principal());
    const current = await db.getRepository(Task).findOneByOrFail({ id: task.id });
    await submissions.review(submission.id, { rubric, feedback: 'Giảng viên kiểm tra và xác nhận bài.', taskVersion: current.version }, { actorId: owner.id });
    expect(await notices('task.reviewed')).toEqual([{ userId: student.id, linkUrl: `/intern/work/${task.id}` }]);
  });
  it('does not send task evidence to a new mentor outside the session or a locked reviewer', async () => {
    await db.getRepository(Project).update(project.id, { mentorId: foreign.id });
    await db.transaction(em => notifySubmissionReviewer(em, task.id, { type: 'task.submitted', title: 'Scope guard' }));
    expect(await notices('task.submitted')).toHaveLength(0);
    await db.getRepository(Project).update(project.id, { mentorId: owner.id }); await db.getRepository(User).update(owner.id, { status: 'locked' });
    await db.transaction(em => notifySubmissionReviewer(em, task.id, { type: 'task.submitted', title: 'Locked guard' }));
    expect(await notices('task.submitted')).toHaveLength(0);
  });
});
