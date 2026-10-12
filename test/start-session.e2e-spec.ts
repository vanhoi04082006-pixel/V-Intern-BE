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
import { InitPlatformCore1759872000000 } from '../src/database/migrations/1759872000000-InitPlatformCore';
import { CreateAcademicCoreTables1759958400000 } from '../src/database/migrations/1759958400000-CreateAcademicCoreTables';
import { CreateSprintTaskCoreTables1760044800000 } from '../src/database/migrations/1760044800000-CreateSprintTaskCoreTables';
import { CreateRecruitmentAiCoreTables1760131200000 } from '../src/database/migrations/1760131200000-CreateRecruitmentAiCoreTables';
import { CreateProjectTemplates1760563200000 } from '../src/database/migrations/1760563200000-CreateProjectTemplates';
import { CreateProjectRoleSlots1761254400000 } from '../src/database/migrations/1761254400000-CreateProjectRoleSlots';
import { CreateAiGenerationBatches1761340800000 } from '../src/database/migrations/1761340800000-CreateAiGenerationBatches';
import { AddTemplateLibraryColumns1761427200000 } from '../src/database/migrations/1761427200000-AddTemplateLibraryColumns';
import { AddTemplateRunRequest1761513600000 } from '../src/database/migrations/1761513600000-AddTemplateRunRequest';
import { AddAiPlanLifecycle1761600000000 } from '../src/database/migrations/1761600000000-AddAiPlanLifecycle';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { ensureRecruitedProfile, userIdByEmail } from './recruitment-fixtures';

interface ScriptedStep {
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
    const step = this.steps.shift();
    if (!step) throw new Error('No scripted AI step left');
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
  await adminDs.query(`IF DB_ID(N'${DB_NAME}') IS NULL CREATE DATABASE [${DB_NAME}];`);
  await adminDs.destroy();

  const migDs = new DataSource({
    type: 'mssql', host: DB_HOST, port: DB_PORT, database: DB_NAME, username: DB_USER, password: DB_PASS,
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    synchronize: false, logging: false, entities: ENTITIES,
    migrations: [
      InitPlatformCore1759872000000,
      CreateAcademicCoreTables1759958400000,
      CreateSprintTaskCoreTables1760044800000,
      CreateRecruitmentAiCoreTables1760131200000,
      CreateProjectTemplates1760563200000,
      CreateProjectRoleSlots1761254400000,
      CreateAiGenerationBatches1761340800000,
      AddTemplateLibraryColumns1761427200000,
      AddTemplateRunRequest1761513600000,
      AddAiPlanLifecycle1761600000000,
    ],
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
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-m5-be-${RUN}@vintern.test`));
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

async function waitForPlan(token: string, sessionId: string, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    const r = await request(apiBase()).get(`/api/v1/ai-generations/plans?sessionId=${sessionId}`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    const ready = r.body.find((p: { status: string }) => p.status === 'ready');
    if (ready) return ready;
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for a ready AI plan');
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

  async function cancelAll(ids: string[]) {
    for (const id of ids) {
      const r = await request(apiBase()).post(`/api/v1/assignments/${id}/cancel`).set('Authorization', `Bearer ${token}`);
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
    await cancelAll([assigned.body.id]);
  });

  it('blocks Start when a member lost eligibility', async () => {
    const run = await startRun('drift');
    const { fe, ids } = await assignAll(run.projectId, run.sessionId);
    await dataSource.query(`UPDATE recruitment_profiles SET status = 'failed' WHERE userId = @0`, [fe]);
    const start = await request(apiBase()).patch(`/api/v1/sessions/${run.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(start.status).toBe(409);
    expect(start.body.code).toBe('INTERN_NOT_RECRUITED');
    await dataSource.query(`UPDATE recruitment_profiles SET status = 'passed' WHERE userId = @0`, [fe]);
    await cancelAll(ids);
  });

  it('starts a complete team and auto-generates a persisted draft plan', async () => {
    const run = await startRun('full');
    const { fe, be, ids } = await assignAll(run.projectId, run.sessionId);
    testProvider.script([{ respond: planPayload(fe, be) }]);
    const start = await request(apiBase()).patch(`/api/v1/sessions/${run.sessionId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(start.status).toBe(200);
    expect(start.body.status).toBe('active');

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
    await cancelAll(ids);
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

    // Tasks belong to this session's project/sprint with the right assignees.
    const tasks = await request(apiBase()).get(`/api/v1/tasks?projectId=${run.projectId}`).set('Authorization', `Bearer ${token}`);
    const assignees = new Set(tasks.body.data.map((t: { assigneeId: string }) => t.assigneeId));
    expect(assignees.has(fe)).toBe(true);
    expect(assignees.has(be)).toBe(true);

    // Plan row is marked confirmed.
    const history = await request(apiBase()).get(`/api/v1/ai-generations/plans?sessionId=${run.sessionId}`).set('Authorization', `Bearer ${token}`);
    expect(history.body.some((p: { status: string }) => p.status === 'confirmed')).toBe(true);
    await cancelAll(ids);
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
});
