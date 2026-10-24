import { createDatabaseSql } from '../src/database/create-database-sql';
import { scriptedBusinessDecision } from './fixtures/business-agent-provider';
import { createConnection } from 'node:net';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AI_PROVIDER_TOKEN, type AiProvider } from '../src/ai/ai-provider.interface';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { ENTITIES } from '../src/database/entities';
import migrationSource from '../src/database/data-source';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { ensureRecruitedProfile, userIdByEmail } from './recruitment-fixtures';

interface ScriptedStep {
  wait?: Promise<void>;
  respond?: unknown;
  fail?: string;
}

class ScriptableTestAiProvider implements AiProvider {
  readonly name = 'test-ai';
  readonly model = 'test-model-sprint-plan';
  private steps: ScriptedStep[] = [];
  script(steps: ScriptedStep[]): void {
    this.steps = [...steps];
  }
  async generateStructured<T>(req: {
    task: string;
    validate: (raw: unknown) => T;
  }): Promise<{ data: T; provider: string; model: string; latencyMs: number; inputTokens: number | null; outputTokens: number | null }> {
    const control = scriptedBusinessDecision(req, this.name, this.model); if (control) return control;
    const step = this.steps.shift();
    if (!step) throw new Error('No scripted AI step left');
    if (step.wait) await step.wait;
    if (step.fail) {
      const err = new Error(step.fail);
      (err as { retryable?: boolean }).retryable = false;
      throw err;
    }
    return { data: req.validate(step.respond), provider: this.name, model: this.model, latencyMs: 1, inputTokens: 11, outputTokens: 22 };
  }
}

/**
 * M5 Start Session + automatic AI planning (WP-5): team preconditions,
 * async auto-trigger, persisted drafts, review/confirm publish, idempotency.
 *
 * SAFETY: disposable DB only (E2E_DB_NAME), real migrations, deterministic
 * test AI provider (no external calls), no mocks.
 */
const DB_HOST = process.env.DB_HOST ?? 'localhost';
const DB_PORT = Number(process.env.DB_PORT ?? 1433);
const DB_NAME = process.env.E2E_DB_NAME ?? '';
const DB_USER = process.env.DB_USERNAME ?? 'vintern_app';
const DB_PASS = process.env.DB_PASSWORD ?? '';

function tcpReachable(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

let app: INestApplication;
let dataSource: DataSource;
let testProvider: ScriptableTestAiProvider;
const RUN = Date.now().toString(36);
const PW = 'E2e-Password-1';

function templateDef(code: string) {
  return {
    code,
    name: `M5 template ${code}`,
    description: 'M5 start-session fixture with enough detail.',
    difficulty: 'intermediate',
    category: 'web',
    techStack: ['React', 'NestJS'],
    roles: ['frontend', 'backend'],
    roleDetails: [
      { code: 'frontend', title: 'FE', countMin: 1, countMax: 1 },
      { code: 'backend', title: 'BE', countMin: 1, countMax: 1 },
    ],
    modules: ['Shop'],
    sprints: [
      {
        name: 'Build', goal: 'Ship', durationDays: 14,
        tasks: [{ title: 'Work', requirements: 'Do the thing well', dod: ['Done'], role: 'frontend', storyPoints: 3 }],
      },
    ],
    dod: ['Done'], rubricVersion: 'task-review-v1', scenarios: ['Happy'],
    documentation: 'README plus API documentation with sufficient length.',
  };
}

function planPayload(feId: string, beId: string) {
  return {
    sprints: [{
      name: 'Sprint 1', goal: 'Foundation',
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-14T00:00:00.000Z',
      tasks: [
        { title: 'FE task', description: 'Frontend work', priority: 'high', storyPoints: 3, dueDate: '2026-11-05T00:00:00.000Z', suggestedRole: 'frontend', assigneeId: feId },
        { title: 'BE task', description: 'Backend work', priority: 'high', storyPoints: 5, dueDate: '2026-11-06T00:00:00.000Z', suggestedRole: 'backend', assigneeId: beId },
      ],
    }],
  };
}

beforeAll(async () => {
  if (!DB_NAME) {
    throw new Error('[E2E BLOCKED] E2E_DB_NAME is not set. Point it at a DISPOSABLE database.');
  }
  if (!(await tcpReachable(DB_HOST, DB_PORT))) {
    throw new Error(`[E2E BLOCKED] SQL Server ${DB_HOST}:${DB_PORT} unreachable.`);
  }
  const adminDs = new DataSource({
    type: 'mssql', host: DB_HOST, port: DB_PORT, database: 'master', username: DB_USER, password: DB_PASS,
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true }, logging: false,
  });
  await adminDs.initialize();
  await adminDs.query(createDatabaseSql(DB_NAME, process.env.DB_FILES_ROOT));
  await adminDs.destroy();

  const migDs = new DataSource({
    type: 'mssql', host: DB_HOST, port: DB_PORT, database: DB_NAME, username: DB_USER, password: DB_PASS,
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    synchronize: false, logging: false, entities: ENTITIES,
    // This boots the current AppModule. A truncated historical registry only
    // worked when another suite had already installed the missing tables.
    migrations: migrationSource.options.migrations,
    migrationsRun: false,
  });
  await migDs.initialize();
  await migDs.runMigrations();
  await migDs.destroy();

  dataSource = new DataSource({
    type: 'mssql', host: DB_HOST, port: DB_PORT, database: DB_NAME, username: DB_USER, password: DB_PASS,
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    synchronize: false, logging: false, entities: ENTITIES, migrationsRun: false,
  });
  await dataSource.initialize();

  testProvider = new ScriptableTestAiProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_PROVIDER_TOKEN)
    .useValue(testProvider)
    .compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0);

  await ensureRbac(dataSource);
  const roles = dataSource.getRepository(Role);
  const users = dataSource.getRepository(User);
  const userRoles = dataSource.getRepository(UserRole);
  const instructorRole = await roles.findOneOrFail({ where: { code: 'instructor' } });
  const internRole = await roles.findOneOrFail({ where: { code: 'intern' } });
  const mk = async (tag: string, roleId: string, displayName: string) => {
    const email = `e2e-m5-${tag}-${RUN}@vintern.test`;
    const created = await users.save(
      users.create({
        email, username: `e2e-m5-${tag}-${RUN}`, displayName,
        passwordHash: await hash(PW, 10), status: 'active',
      }),
    );
    await userRoles.insert({ userId: created.id, roleId });
    return email;
  };
  await mk('a', instructorRole.id, 'M5 Instructor');
  await mk('fe', internRole.id, 'M5 Frontend');
  await mk('be', internRole.id, 'M5 Backend');
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-m5-fe-${RUN}@vintern.test`));
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-m5-be-${RUN}@vintern.test`), 'backend');
}, 180_000);

afterAll(async () => {
  await app?.close();
  await dataSource?.destroy();
});

function apiBase(): string {
  const addr = app.getHttpServer().address() as { port: number };
  return `http://127.0.0.1:${addr.port}`;
}

async function login(email: string): Promise<string> {
  const res = await request(apiBase()).post('/api/v1/auth/login').send({ email, password: PW });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.body.accessToken as string;
}

async function waitForPlan(token: string, sessionId: string, timeoutMs = 20000, status = 'ready') {
  const start = Date.now();
  for (;;) {
    const r = await request(apiBase()).get(`/api/v1/ai-generations/plans?sessionId=${sessionId}`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    const ready = r.body.find((p: { status: string }) => p.status === status);
    if (ready) return ready;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for a ${status} AI plan`);
    await new Promise((resolve) => { setTimeout(resolve, 500); });
  }
}

describe('M5 Start Session and automatic AI planning', () => {
  let token: string;
  let templateId: string;

  beforeAll(async () => {
    token = await login(`e2e-m5-a-${RUN}@vintern.test`);
    const created = await request(apiBase()).post('/api/v1/project-templates').set('Authorization', `Bearer ${token}`).send(templateDef(`M5-${RUN}`.toUpperCase()));
    expect(created.status).toBe(201);
    templateId = created.body.id;
  });

  async function startRun(tag: string) {
    const started = await request(apiBase()).post(`/api/v1/project-templates/${templateId}/start`).set('Authorization', `Bearer ${token}`).send({
      name: `M5 ${tag} ${RUN}`, startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z', requestId: randomUUID(),
    });
    expect(started.status).toBe(201);
    return started.body as { id: string; projectId: string; sessionId: string };
  }

  async function assignAll(projectId: string, sessionId: string) {
    const fe = await userIdByEmail(dataSource, `e2e-m5-fe-${RUN}@vintern.test`);
    const be = await userIdByEmail(dataSource, `e2e-m5-be-${RUN}@vintern.test`);
    const ids: string[] = [];
    for (const [internId, role] of [[fe, 'frontend'], [be, 'backend']] as const) {
      const r = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${token}`).send({ internId, projectId, sessionId, role });
      expect(r.status).toBe(201);
      ids.push(r.body.id);
    }
    return { fe, be, ids };
  }

  async function releaseAssignments(ids: string[]) {
    for (const id of ids) {
      const detail = await request(apiBase()).get(`/api/v1/assignments/${id}`).set('Authorization', `Bearer ${token}`);
      expect(detail.status).toBe(200);
      const session = await request(apiBase()).get(`/api/v1/sessions/${detail.body.sessionId}`).set('Authorization', `Bearer ${token}`);
      expect(session.status).toBe(200);
      const action = session.body.status === 'upcoming' ? 'cancel' : 'complete';
      const r = await request(apiBase()).post(`/api/v1/assignments/${id}/${action}`).set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(201);
    }
  }

  it('blocks Start while required slots are unfilled', async () => {
    const run = await startRun('thin');
    const fe = await userIdByEmail(dataSource, `e2e-m5-fe-${RUN}@vintern.test`);
    const assigned = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${token}`).send({
      internId: fe, projectId: run.projectId, sessionId: run.sessionId, role: 'frontend',
    });
    expect(assigned.status).toBe(201);
    const start = await request(apiBase()).patch(`/api/v1/sessions/${run.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(start.status).toBe(409);
    expect(start.body.code).toBe('SESSION_TEAM_INCOMPLETE');
    expect(JSON.stringify(start.body.details)).toContain('backend');
    await releaseAssignments([assigned.body.id]);
  });

  it('blocks Start when a member lost eligibility', async () => {
    const run = await startRun('drift');
    const { fe, ids } = await assignAll(run.projectId, run.sessionId);
    await dataSource.query(`UPDATE recruitment_profiles SET status = 'failed' WHERE userId = @0`, [fe]);
    const start = await request(apiBase()).patch(`/api/v1/sessions/${run.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(start.status).toBe(409);
    expect(start.body.code).toBe('INTERN_NOT_RECRUITED');
    await dataSource.query(`UPDATE recruitment_profiles SET status = 'passed' WHERE userId = @0`, [fe]);
    await releaseAssignments(ids);
  });

  it('starts a complete team and auto-generates a persisted draft plan', async () => {
    const run = await startRun('full');
    const { fe, be, ids } = await assignAll(run.projectId, run.sessionId);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    testProvider.script([{ wait, respond: planPayload(fe, be) }]);
    const start = await request(apiBase()).patch(`/api/v1/sessions/${run.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(start.status).toBe(200);
    expect(start.body.status).toBe('active');

    try {
      const concurrent = await Promise.all([randomUUID(), randomUUID()].map((requestId) =>
        request(apiBase()).post('/api/v1/ai-generations/plans/generate').set('Authorization', `Bearer ${token}`)
          .send({ projectId: run.projectId, sessionId: run.sessionId, requestId }),
      ));
      expect(concurrent.map((r) => r.status)).toEqual([201, 201]);
      expect(concurrent[0].body.planId).toBe(concurrent[1].body.planId);
      expect(concurrent[0].body.status).toBe('generating');
      // The detached Start trigger and these callers may race to reserve it.
      // Exactly one reservation wins; every caller must see the same plan.
      expect(concurrent.some(r => r.body.deduped === true)).toBe(true);
    } finally { release(); }

    const plan = await waitForPlan(token, run.sessionId);
    expect(plan.templateVersion).toBe(1);
    const detail = await request(apiBase()).get(`/api/v1/ai-generations/plans/${plan.planId ?? plan.id}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.draft.sprints).toHaveLength(1);
    expect(detail.body.draft.sprints[0].tasks).toHaveLength(2);
    expect(Array.isArray(detail.body.warnings)).toBe(true);

    // Double Start stays active without triggering a second generation
    // (no scripted AI step left — a regeneration attempt would 503).
    const again = await request(apiBase()).patch(`/api/v1/sessions/${run.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(again.status).toBe(200);
    const plans = await request(apiBase()).get(`/api/v1/ai-generations/plans?sessionId=${run.sessionId}`).set('Authorization', `Bearer ${token}`);
    expect(plans.body.filter((p: { status: string }) => p.status === 'ready')).toHaveLength(1);
    await releaseAssignments(ids);
  });

  it('confirms the reviewed plan into scoped sprints/tasks, idempotently', async () => {
    const run = await startRun('confirm');
    const { fe, be, ids } = await assignAll(run.projectId, run.sessionId);
    testProvider.script([{ respond: planPayload(fe, be) }]);
    const start = await request(apiBase()).patch(`/api/v1/sessions/${run.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(start.status).toBe(200);
    const plan = await waitForPlan(token, run.sessionId);
    const planDetail = await request(apiBase()).get(`/api/v1/ai-generations/plans/${plan.planId ?? plan.id}`).set('Authorization', `Bearer ${token}`);
    expect(planDetail.status).toBe(200);
    const draftObj = planDetail.body.draft;
    draftObj.sprints[0].tasks[0].title = 'Instructor reviewed task';
    draftObj.sprints[0].tasks[0].acceptanceCriteria = ['The approved behaviour is covered by tests'];

    const incomplete = JSON.parse(JSON.stringify(draftObj));
    incomplete.sprints[0].tasks[1].description = null;
    const rejected = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/confirm').set('Authorization', `Bearer ${token}`).send({
      projectId: run.projectId, sessionId: run.sessionId, draft: incomplete, requestId: randomUUID(), planId: plan.planId,
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('GENERATION_DESCRIPTION_REQUIRED');
    const rolledBackSprints = await request(apiBase()).get(`/api/v1/sprints?sessionId=${run.sessionId}`).set('Authorization', `Bearer ${token}`);
    const rolledBackTasks = await request(apiBase()).get(`/api/v1/tasks?sessionId=${run.sessionId}`).set('Authorization', `Bearer ${token}`);
    expect(rolledBackSprints.body.meta.total).toBe(0);
    expect(rolledBackTasks.body.meta.total).toBe(0);

    const requestId = randomUUID();
    const first = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/confirm').set('Authorization', `Bearer ${token}`).send({
      projectId: run.projectId, sessionId: run.sessionId, draft: draftObj,
      requestId, planId: plan.planId ?? plan.id,
    });
    expect(first.status).toBe(201);
    expect(first.body.sprintCount).toBe(1);
    expect(first.body.taskCount).toBe(2);

    const before = await request(apiBase()).get(`/api/v1/sprints?projectId=${run.projectId}`).set('Authorization', `Bearer ${token}`);
    const second = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/confirm').set('Authorization', `Bearer ${token}`).send({
      projectId: run.projectId, sessionId: run.sessionId, draft: draftObj, requestId, planId: plan.planId ?? plan.id,
    });
    expect(second.body.deduped).toBe(true);
    const after = await request(apiBase()).get(`/api/v1/sprints?projectId=${run.projectId}`).set('Authorization', `Bearer ${token}`);
    expect(after.body.meta.total).toBe(before.body.meta.total);

    // A reload, another tab or another instructor creates a new client key.
    // The persisted plan itself must still publish only once.
    const replays = await Promise.all([randomUUID(), randomUUID()].map((key) =>
      request(apiBase()).post('/api/v1/ai-generations/sprint-plan/confirm')
        .set('Authorization', `Bearer ${token}`).send({
          projectId: run.projectId, sessionId: run.sessionId, draft: draftObj,
          requestId: key, planId: plan.planId ?? plan.id,
        }),
    ));
    for (const replay of replays) {
      expect(replay.status).toBe(201);
      expect(replay.body.deduped).toBe(true);
      expect(replay.body.sprintIds).toEqual(first.body.sprintIds);
    }
    const unchanged = await request(apiBase()).get(`/api/v1/sprints?projectId=${run.projectId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(unchanged.body.meta.total).toBe(1);

    // Tasks belong to this session's project/sprint with the right assignees.
    const tasks = await request(apiBase()).get(`/api/v1/tasks?projectId=${run.projectId}`).set('Authorization', `Bearer ${token}`);
    const assignees = new Set(tasks.body.data.map((t: { assigneeId: string }) => t.assigneeId));
    expect(assignees.has(fe)).toBe(true);
    expect(assignees.has(be)).toBe(true);
    const reviewed = tasks.body.data.find((t: { title: string }) => t.title === 'Instructor reviewed task');
    expect(reviewed).toBeTruthy();
    const spec = await request(apiBase()).get(`/api/v1/tasks/${reviewed.id}/spec`).set('Authorization', `Bearer ${token}`);
    expect(spec.status).toBe(200);
    expect(spec.body.dod).toEqual(['The approved behaviour is covered by tests']);

    // Plan row is marked confirmed.
    const history = await request(apiBase()).get(`/api/v1/ai-generations/plans?sessionId=${run.sessionId}`).set('Authorization', `Bearer ${token}`);
    expect(history.body.some((p: { status: string }) => p.status === 'confirmed')).toBe(true);
    // The confirm idempotency record itself is NOT listed as a new plan.
    expect(history.body.filter((p: { hasDraft: boolean }) => !p.hasDraft)).toHaveLength(0);

    const performance = await request(apiBase()).get(`/api/v1/performance/interns?projectId=${run.projectId}&sessionId=${run.sessionId}`).set('Authorization', `Bearer ${token}`);
    expect(performance.status).toBe(200);
    expect(performance.body.items).toHaveLength(2);
    expect(performance.body.items.reduce((n: number, member: { totalTaskCount: number }) => n + member.totalTaskCount, 0)).toBe(2);
    const reportInput = { title: 'Reviewed session report', kind: 'progress', projectId: run.projectId, sessionId: run.sessionId, requestId: randomUUID() };
    const report = await request(apiBase()).post('/api/v1/reports').set('Authorization', `Bearer ${token}`).send(reportInput);
    expect(report.status).toBe(201);
    expect(report.body.snapshot.scope.sessionId).toBe(run.sessionId);
    expect(report.body.snapshot.members).toHaveLength(2);
    expect(report.body.snapshot.schemaVersion).toBe(2);
    expect(report.body.snapshot.details.summary).toMatchObject({ total: 2, completed: 0, unassigned: 0 });
    expect(report.body.snapshot.details.tasks).toHaveLength(2);
    expect(report.body.snapshot.details.sprints).toHaveLength(1);
    expect(report.body.snapshot.details.timeline.length).toBeGreaterThan(0);
    const replayReport = await request(apiBase()).post('/api/v1/reports').set('Authorization', `Bearer ${token}`).send(reportInput);
    expect(replayReport.body.id).toBe(report.body.id);
    const scopedReports = await request(apiBase()).get(`/api/v1/reports?projectId=${run.projectId}&sessionId=${run.sessionId}`).set('Authorization', `Bearer ${token}`);
    expect(scopedReports.status).toBe(200);
    expect(scopedReports.body.total).toBe(1);
    const focused = await request(apiBase()).post('/api/v1/reports').set('Authorization', `Bearer ${token}`).send({ ...reportInput, requestId: randomUUID(), title: 'Focused student sprint report', studentId: fe, sprintId: reviewed.sprintId });
    expect(focused.status).toBe(201);
    expect(focused.body.snapshot.scope).toMatchObject({ studentId: fe, sprintId: reviewed.sprintId });
    expect(focused.body.snapshot.members).toHaveLength(1);
    expect(focused.body.snapshot.details.tasks.every((task: { assigneeId: string }) => task.assigneeId.toLowerCase() === fe.toLowerCase())).toBe(true);
    const invalidScope = await request(apiBase()).post('/api/v1/reports').set('Authorization', `Bearer ${token}`).send({ ...reportInput, requestId: randomUUID(), sprintId: randomUUID() });
    expect(invalidScope.status).toBe(400);
    const [priorDeadline] = await dataSource.query('SELECT dueDate FROM tasks WHERE id=@0', [reviewed.id]);
    try {
      await dataSource.query('UPDATE tasks SET dueDate=DATEADD(day,-1,SYSUTCDATETIME()) WHERE id=@0', [reviewed.id]);
      const risk = await request(apiBase()).post('/api/v1/reports').set('Authorization', `Bearer ${token}`).send({ ...reportInput, requestId: randomUUID(), kind: 'risk', title: 'Measured overdue risk' });
      expect(risk.status).toBe(201);
      expect(risk.body.snapshot.details.summary.risk).toBe('high');
      expect(risk.body.snapshot.details.summary.overdue).toBeGreaterThan(0);
      const pinned = await request(apiBase()).get(`/api/v1/reports/${report.body.id}`).set('Authorization', `Bearer ${token}`);
      expect(pinned.body.snapshot.details.summary).toEqual(report.body.snapshot.details.summary);
    } finally { await dataSource.query('UPDATE tasks SET dueDate=@1 WHERE id=@0', [reviewed.id, priorDeadline.dueDate]); }
    const otherScope = await request(apiBase()).get(`/api/v1/reports?sessionId=${randomUUID()}`).set('Authorization', `Bearer ${token}`);
    expect(otherScope.body.total).toBe(0);
    for (const [format, contentType] of [['pdf', 'application/pdf'], ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]) {
      const exported = await request(apiBase()).get(`/api/v1/reports/${report.body.id}/${format}`).set('Authorization', `Bearer ${token}`).buffer(true).parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
        response.on('error', callback);
      });
      expect(exported.status).toBe(200);
      expect(exported.headers['content-type']).toContain(contentType);
      expect(Buffer.isBuffer(exported.body)).toBe(true);
      expect(exported.body.subarray(0, format === 'pdf' ? 4 : 2).toString()).toBe(format === 'pdf' ? '%PDF' : 'PK');
    }
    await releaseAssignments(ids);
  }, 30_000); // Full SQL publish + report generation/export journey, bounded separately from units.

  it('serializes a reused AI request key across different sessions as a scoped conflict', async () => {
    const first = await startRun('global-key-a');
    const second = await startRun('global-key-b');
    const fe = await userIdByEmail(dataSource, `e2e-m5-fe-${RUN}@vintern.test`);
    const be = await userIdByEmail(dataSource, `e2e-m5-be-${RUN}@vintern.test`);
    const ids: string[] = [];
    for (const [run, internId, role] of [[first, fe, 'frontend'], [second, be, 'backend']] as const) {
      const assigned = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${token}`)
        .send({ projectId: run.projectId, sessionId: run.sessionId, internId, role });
      expect(assigned.status).toBe(201);
      ids.push(assigned.body.id);
      // Fixture precondition isolates the idempotency race; normal Start team
      // validation and auto-trigger are exercised separately in this suite.
      await dataSource.query("UPDATE internship_sessions SET status='active' WHERE id=@0", [run.sessionId]);
    }
    try {
      testProvider.script([{ respond: planPayload(fe, be) }]);
      const requestId = randomUUID();
      const responses = await Promise.all([first, second].map(run => request(apiBase()).post('/api/v1/ai-generations/plans/generate')
        .set('Authorization', `Bearer ${token}`).send({ projectId: run.projectId, sessionId: run.sessionId, requestId })));
      expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
      expect(responses.find(r => r.status === 409)?.body.code).toBe('GENERATION_REQUEST_CONFLICT');
      const rows = await dataSource.query('SELECT id FROM ai_generation_batches WHERE requestId=@0', [requestId]);
      expect(rows).toHaveLength(1);
      const winner = responses.find(r => r.status === 201)!;
      await waitForPlan(token, winner.body.sessionId);
    } finally { await releaseAssignments(ids); }
  });

  it('legacy sessions without a template run still start freely', async () => {
    const session = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${token}`).send({
      code: `E2E-M5-SS-${RUN}`, name: 'Legacy session', description: 'no template run',
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(session.status).toBe(201);
    const start = await request(apiBase()).patch(`/api/v1/sessions/${session.body.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(start.status).toBe(200);
    expect(start.body.status).toBe('active');
  });

  it('preserves classified provider failure without creating delivery rows', async () => {
    const run = await startRun('provider-failure');
    const { ids } = await assignAll(run.projectId, run.sessionId);
    try {
      testProvider.script([{ fail: 'Scripted provider failure' }]);
      const started = await request(apiBase()).patch(`/api/v1/sessions/${run.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
      expect(started.status).toBe(200);
      const failed = await waitForPlan(token, run.sessionId, 20000, 'failed');
      const detail = await request(apiBase()).get(`/api/v1/ai-generations/plans/${failed.planId}`).set('Authorization', `Bearer ${token}`);
      expect(detail.body.error.code).toBe('AI_EVALUATION_FAILED');
      const sprints = await request(apiBase()).get(`/api/v1/sprints?sessionId=${run.sessionId}`).set('Authorization', `Bearer ${token}`);
      expect(sprints.body.meta.total).toBe(0);
    } finally { await releaseAssignments(ids); }
  }, 30_000);
  it('supports historic roles-only templates and requires their real team before Start', async () => {
    const def = templateDef(`M5-LEGACY-${RUN}`.toUpperCase());
    const legacy: Omit<typeof def, 'roleDetails'> & { roleDetails?: typeof def.roleDetails } = { ...def };
    delete legacy.roleDetails;
    const created = await request(apiBase()).post('/api/v1/project-templates').set('Authorization', `Bearer ${token}`).send(legacy);
    expect(created.status).toBe(201);
    const run = await request(apiBase()).post(`/api/v1/project-templates/${created.body.id}/start`).set('Authorization', `Bearer ${token}`).send({ name: `Legacy ${RUN}`, startDate: '2026-11-01', endDate: '2026-12-31', requestId: randomUUID() });
    expect(run.status).toBe(201);
    const emptyStart = await request(apiBase()).patch(`/api/v1/sessions/${run.body.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(emptyStart.status).toBe(409);
    expect(emptyStart.body.code).toBe('SESSION_TEAM_INCOMPLETE');
    const { fe, be, ids } = await assignAll(run.body.projectId, run.body.sessionId);
    try {
      testProvider.script([{ respond: planPayload(fe, be) }]);
      const started = await request(apiBase()).patch(`/api/v1/sessions/${run.body.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
      expect(started.status).toBe(200);
      await waitForPlan(token, run.body.sessionId);
      const rejected = await request(apiBase()).post(`/api/v1/assignments/${ids[0]}/cancel`).set('Authorization', `Bearer ${token}`);
      expect(rejected.status).toBe(409);
      expect(rejected.body.code).toBe('SESSION_NOT_SETUP');
      const members = await request(apiBase()).get(`/api/v1/sessions/${run.body.sessionId}/members`).set('Authorization', `Bearer ${token}`);
      expect(members.body.members).toHaveLength(2);
    } finally { await releaseAssignments(ids); }
  });

});
