import { createHmac, randomInt, randomUUID } from 'crypto';
import { hash } from 'bcryptjs';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import source from '../src/database/data-source';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { Project } from '../src/projects/entities/project.entity';
import { InternshipSession } from '../src/sessions/entities/internship-session.entity';
import { Sprint } from '../src/sprints/entities/sprint.entity';
import { Task } from '../src/tasks/entities/task.entity';
import { GithubClient } from '../src/github/github-client';
import { normalizeBodyParserError } from '../src/common/filters/global-exception.filter';

jest.setTimeout(30000);
const SECRET = 'test-only-webhook-secret-not-used-by-runtime';
const PASSWORD = 'E2e-Webhook-123!';
const priorSecret = process.env.GITHUB_WEBHOOK_SECRET;
process.env.GITHUB_WEBHOOK_SECRET = SECRET;
let db: DataSource, app: INestApplication;
let owner: User, foreign: User, student: User;
let ownerToken: string, foreignToken: string, sessionId: string, taskId: string, submissionId: string, foreignSubmissionId: string;
const repoId = randomInt(1000000000, 2000000000), githubOwnerId = randomInt(1000000000, 2000000000);
const beforeSha = 'a'.repeat(40), changedSha = 'b'.repeat(40);
const endpoint = '/api/v1/github/webhook';
const body = (id = repoId, sha = changedSha) => JSON.stringify({ repository: { id, owner: { id: githubOwnerId } }, action: 'synchronize', number: 3, pull_request: { head: { sha } }, label: 'Cập nhật tiếng Việt — chữ ký theo byte' });
const signature = (raw: string) => 'sha256=' + createHmac('sha256', SECRET).update(Buffer.from(raw)).digest('hex');

beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_(?:E2E|Test)_[A-Za-z0-9_]+$/.test(database)) throw Error('Explicit disposable SQL database required.');
  const options = source.options;
  if (options.type !== 'mssql') throw Error('SQL Server required.');
  db = new DataSource({ ...options, database, synchronize: false });
  await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db);
  async function user(code: string) {
    const suffix = randomUUID().slice(0, 8), role = await db.getRepository(Role).findOneByOrFail({ code });
    const u = await db.getRepository(User).save({ email: `hook.${suffix}@vintern.test`, username: `hook.${suffix}`, displayName: `Hook ${suffix}`, passwordHash: await hash(PASSWORD, 10), status: 'active' });
    await db.getRepository(UserRole).insert({ userId: u.id, roleId: role.id }); return u;
  }
  owner = await user('instructor'); foreign = await user('instructor'); student = await user('intern');
  const session = await db.getRepository(InternshipSession).save({ code: `HOOK-${randomUUID().slice(0, 8)}`, name: 'Signed webhook SQL', leadInstructorId: owner.id, status: 'active', startDate: new Date(), endDate: new Date(Date.now() + 86400000) }); sessionId = session.id;
  const project = await db.getRepository(Project).save({ code: `HOOK-P-${randomUUID().slice(0, 8)}`, name: 'Webhook scoped project', description: 'Test-owned webhook fixtures', mentorId: owner.id, status: 'active', difficulty: 'beginner' });
  const sprint = await db.getRepository(Sprint).save({ code: `HOOK-S-${randomUUID().slice(0, 8)}`, name: 'Webhook sprint', projectId: project.id, sessionId, status: 'active', startDate: new Date(), endDate: new Date(Date.now() + 86400000) });
  const task = await db.getRepository(Task).save({ code: `HOOK-T-${randomUUID().slice(0, 8)}`, title: 'Submitted source', projectId: project.id, sprintId: sprint.id, assigneeId: student.id, status: 'review', priority: 'medium', progress: 50 }); taskId = task.id;
  await db.query("INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes) VALUES(@0,@1,'fixture-owner','fixture-ciphertext','public_repo')", [owner.id, githubOwnerId]);
  await db.query("INSERT INTO session_repositories(sessionId,ownerUserId,githubOwnerId,ownerLogin,repoName,repoId,status,leaseId) VALUES(@0,@1,@2,'fixture-owner','learning',@3,'ready',@4)", [sessionId, owner.id, githubOwnerId, repoId, randomUUID()]);
  submissionId = randomUUID();
  await db.query("INSERT INTO task_submissions(id,taskId,internId,prUrl,summary,status,headSha,baseSha,repositoryId,sourceKind,sourceRef,pullNumber) VALUES(@0,@1,@2,'https://github.com/fixture-owner/learning/pull/3','Test-owned immutable source','submitted',@3,@4,@5,'pull','3',3)", [submissionId, taskId, student.id, beforeSha, 'c'.repeat(40), repoId]);
  const otherSession = await db.getRepository(InternshipSession).save({ code: `HOOK-OTHER-${randomUUID().slice(0, 8)}`, name: 'Other scope', leadInstructorId: foreign.id, status: 'active', startDate: new Date(), endDate: new Date(Date.now() + 86400000) });
  const otherProject = await db.getRepository(Project).save({ code: `HOOK-OTHER-P-${randomUUID().slice(0, 8)}`, name: 'Other scope', description: 'Cross-scope defensive fixture', mentorId: foreign.id, status: 'active' });
  const otherSprint = await db.getRepository(Sprint).save({ code: `HOOK-OTHER-S-${randomUUID().slice(0, 8)}`, name: 'Other scope', projectId: otherProject.id, sessionId: otherSession.id, status: 'active', startDate: new Date(), endDate: new Date(Date.now() + 86400000) });
  const otherTask = await db.getRepository(Task).save({ code: `HOOK-OTHER-T-${randomUUID().slice(0, 8)}`, title: 'Foreign task', projectId: otherProject.id, sprintId: otherSprint.id, assigneeId: student.id, status: 'review', priority: 'medium', progress: 50 });
  foreignSubmissionId = randomUUID();
  // Deliberately malformed internal fixture: even a reused source ID must not cross session boundaries.
  await db.query("INSERT INTO task_submissions(id,taskId,internId,prUrl,summary,status,headSha,baseSha,repositoryId,sourceKind,sourceRef,pullNumber) VALUES(@0,@1,@2,'https://github.com/fixture-owner/learning/pull/3','Foreign scope fixture','submitted',@3,@4,@5,'pull','3',3)", [foreignSubmissionId, otherTask.id, student.id, beforeSha, 'c'.repeat(40), repoId]);
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(GithubClient).useValue({ call: jest.fn(async () => { throw Error('External GitHub transport is not allowed in webhook ingestion tests.'); }) }).compile();
  const server = module.createNestApplication<NestExpressApplication>({ rawBody: true, logger: false });
  server.useBodyParser('json', { limit: '1mb' }); server.use(normalizeBodyParserError); server.setGlobalPrefix('api'); server.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  server.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await server.listen(0); app = server;
  async function login(u: User) { const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: u.email, password: PASSWORD }).expect(200); return response.body.accessToken as string; }
  ownerToken = await login(owner); foreignToken = await login(foreign);
}, 120000);
afterAll(async () => { await app?.close(); if (db?.isInitialized) await db.destroy(); if (priorSecret === undefined) delete process.env.GITHUB_WEBHOOK_SECRET; else process.env.GITHUB_WEBHOOK_SECRET = priorSecret; });

function deliver(raw: string, delivery = randomUUID(), sig = signature(raw)) {
  return request(app.getHttpServer()).post(endpoint).set('Content-Type', 'application/json').set('X-GitHub-Event', 'pull_request').set('X-GitHub-Delivery', delivery).set('X-Hub-Signature-256', sig).send(raw);
}
describe('signed GitHub webhook HTTP/SQL integration', () => {
  it('rejects tampered raw bytes before creating receipts or source observations', async () => {
    const raw = body(); await deliver(raw + ' ', randomUUID(), signature(raw)).expect(401);
    expect((await db.query('SELECT COUNT(*) AS n FROM github_repository_events WHERE sessionId=@0', [sessionId]))[0].n).toBe(0);
  });
  it('rejects oversized deliveries without writing event data', async () => {
    const oversized = JSON.stringify({ ...JSON.parse(body()), label: 'x'.repeat(1024 * 1024) });
    await deliver(oversized).expect(413);
  });
  it('returns a safe JSON parse error without echoing the submitted body', async () => {
    const response = await deliver('{"private-answer-marker": invalid').expect(400);
    expect(response.body.code).toBe('INVALID_JSON');
    expect(JSON.stringify(response.body)).not.toContain('private-answer-marker');
  });
  it('handles duplicate delivery once, records change separately and never approves or rewrites the submission', async () => {
    const raw = body(), id = randomUUID();
    expect((await deliver(raw, id).expect(200)).body).toMatchObject({ status: 'processed', deduped: false });
    expect((await deliver(raw, id).expect(200)).body).toMatchObject({ status: 'processed', deduped: true });
    const [submission] = await db.query('SELECT headSha,observedHeadSha,status,score,sourceChangedAt FROM task_submissions WHERE id=@0', [submissionId]);
    expect(submission).toMatchObject({ headSha: beforeSha, observedHeadSha: changedSha, status: 'submitted', score: null }); expect(submission.sourceChangedAt).not.toBeNull();
    expect((await db.query('SELECT status FROM tasks WHERE id=@0', [taskId]))[0].status).toBe('review');
    expect((await db.query('SELECT observedHeadSha,status FROM task_submissions WHERE id=@0', [foreignSubmissionId]))[0]).toEqual({ observedHeadSha: null, status: 'submitted' });
    expect((await db.query('SELECT COUNT(*) AS n FROM github_repository_events WHERE sessionId=@0', [sessionId]))[0].n).toBe(1);
    expect((await db.query("SELECT COUNT(*) AS n FROM notifications WHERE userId IN (@0,@1) AND type='submission.source_changed'", [owner.id, student.id]))[0].n).toBe(2);
    await deliver(body(repoId, 'd'.repeat(40)), id).expect(409);
  });
  it('ignores an unknown repository and does not let another teacher read activity', async () => {
    expect((await deliver(body(repoId + 10)).expect(200)).body.status).toBe('ignored');
    await request(app.getHttpServer()).get(`/api/v1/sessions/${sessionId}/github/activity?page=1&pageSize=5`).set('Authorization', `Bearer ${foreignToken}`).expect(403);
    const response = await request(app.getHttpServer()).get(`/api/v1/sessions/${sessionId}/github/activity?page=1&pageSize=5`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(response.body.total).toBe(1); expect(response.body.items[0]).toMatchObject({ eventType: 'pull_request', pullNumber: 3, headSha: changedSha });
    expect(JSON.stringify(response.body)).not.toMatch(/fixture-ciphertext|webhook-secret/);
  });
  it('stops accepting repository events after the owner disconnects GitHub', async () => {
    await db.query('DELETE FROM github_connections WHERE userId=@0', [owner.id]);
    expect((await deliver(body()).expect(200)).body.status).toBe('ignored');
    expect((await db.query('SELECT COUNT(*) AS n FROM github_repository_events WHERE sessionId=@0', [sessionId]))[0].n).toBe(1);
  });
});
