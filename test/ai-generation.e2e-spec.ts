import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
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
import { AddRecruitmentReviewProvenance1760390400000 } from '../src/database/migrations/1760390400000-AddRecruitmentReviewProvenance';
import { CreateEvaluationKpiSalaryCertificateTables1760217600000 } from '../src/database/migrations/1760217600000-CreateEvaluationKpiSalaryCertificateTables';
import { CreateProjectRoleSlots1761254400000 } from '../src/database/migrations/1761254400000-CreateProjectRoleSlots';
import { CreateAiGenerationBatches1761340800000 } from '../src/database/migrations/1761340800000-CreateAiGenerationBatches';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { ensureRecruitedProfile, userIdByEmail } from './recruitment-fixtures';

/**
 * AI sprint/task generation e2e (redesign §17-19/§41-42).
 *
 * - Draft comes from a SCRIPTED provider (no network), is validated, and
 *   persists nothing.
 * - Confirm re-validates, creates sprints+tasks transactionally, and is
 *   idempotent per requestId (retry never duplicates).
 * - Cross-instructor draft/confirm is 403; tampered drafts are 400.
 *
 * SAFETY: disposable DB only (E2E_DB_NAME), real migrations, scripted AI.
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

let app: INestApplication;
let dataSource: DataSource;
let testProvider: ScriptableTestAiProvider;
const RUN = Date.now().toString(36);

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
    migrations: [InitPlatformCore1759872000000, CreateAcademicCoreTables1759958400000, CreateSprintTaskCoreTables1760044800000, CreateRecruitmentAiCoreTables1760131200000, AddRecruitmentReviewProvenance1760390400000, CreateEvaluationKpiSalaryCertificateTables1760217600000, CreateProjectRoleSlots1761254400000, CreateAiGenerationBatches1761340800000],
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
  const specs = [
    { email: `e2e-gen-a-${RUN}@vintern.test`, username: `e2e-gen-a-${RUN}`, roleId: instructorRole.id },
    { email: `e2e-gen-b-${RUN}@vintern.test`, username: `e2e-gen-b-${RUN}`, roleId: instructorRole.id },
    { email: `e2e-gen-fe-${RUN}@vintern.test`, username: `e2e-gen-fe-${RUN}`, roleId: internRole.id },
    { email: `e2e-gen-be-${RUN}@vintern.test`, username: `e2e-gen-be-${RUN}`, roleId: internRole.id },
  ];
  for (const spec of specs) {
    const existing = await users.findOne({ where: { email: spec.email } });
    if (!existing) {
      const created = await users.save(
        users.create({
          email: spec.email, username: spec.username, displayName: spec.username,
          passwordHash: await hash('E2e-Password-1', 10), status: 'active',
        }),
      );
      await userRoles.insert({ userId: created.id, roleId: spec.roleId });
    }
  }
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-gen-fe-${RUN}@vintern.test`));
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-gen-be-${RUN}@vintern.test`), 'backend');
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
  const res = await request(apiBase())
    .post('/api/v1/auth/login')
    .send({ email, password: 'E2e-Password-1' });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

describe('AI sprint/task generation', () => {
  let instructorA: string;
  let instructorB: string;
  let sessionA: string;
  let projectA: string;
  let feId: string;
  let beId: string;

  beforeAll(async () => {
    instructorA = await login(`e2e-gen-a-${RUN}@vintern.test`);
    instructorB = await login(`e2e-gen-b-${RUN}@vintern.test`);
    feId = await userIdByEmail(dataSource, `e2e-gen-fe-${RUN}@vintern.test`);
    beId = await userIdByEmail(dataSource, `e2e-gen-be-${RUN}@vintern.test`);
    const session = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-GEN-SS-${RUN}`, name: 'Generation session', description: 'ai generation fixture',
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(session.status).toBe(201);
    sessionA = session.body.id;
    const project = await request(apiBase()).post('/api/v1/projects').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-GEN-PJ-${RUN}`, name: 'Generation project', description: 'ai generation fixture with a real description',
    });
    expect(project.status).toBe(201);
    projectA = project.body.id;
    expect((await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${instructorA}`).send({ status: 'active' })).status).toBe(200);
    await request(apiBase()).put(`/api/v1/projects/${projectA}/slots`).set('Authorization', `Bearer ${instructorA}`).send({
      slots: [{ roleCode: 'frontend', requiredCount: 1 }, { roleCode: 'backend', requiredCount: 1 }],
    });
    for (const [internId, role] of [[feId, 'frontend'], [beId, 'backend']] as const) {
      const assigned = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
        internId, projectId: projectA, sessionId: sessionA, role,
      });
      expect(assigned.status).toBe(201);
    }
  });

  it('drafts a plan from real context without persisting anything', async () => {
    testProvider.script([{
      respond: {
        sprints: [{
          name: 'Sprint 1', goal: 'Scaffold',
          startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-14T00:00:00.000Z',
          tasks: [
            { title: 'Login UI', priority: 'high', storyPoints: 3, dueDate: '2026-11-05T00:00:00.000Z', suggestedRole: 'frontend', assigneeId: feId },
            { title: 'Auth API', priority: 'high', storyPoints: 5, dueDate: '2026-11-06T00:00:00.000Z', suggestedRole: 'backend', assigneeId: beId },
          ],
        }],
      },
    }]);
    const res = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/draft').set('Authorization', `Bearer ${instructorA}`).send({
      projectId: projectA, sessionId: sessionA, sprintCount: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.draft.sprints).toHaveLength(1);
    expect(res.body.draft.sprints[0].tasks).toHaveLength(2);
    expect(res.body.run.provider).toBe('test-ai');
    const count = await request(apiBase()).get('/api/v1/sprints').set('Authorization', `Bearer ${instructorA}`);
    expect(count.body.meta.total).toBe(0);
  });

  it('flags role mismatches and strips unknown assignees instead of failing', async () => {
    testProvider.script([{
      respond: {
        sprints: [{
          name: 'Sprint X', startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-14T00:00:00.000Z',
          tasks: [
            { title: 'Migrate DB', suggestedRole: 'backend', assigneeId: feId },
            { title: 'Ghost task', assigneeId: '00000000-0000-4000-8000-000000000000' },
          ],
        }],
      },
    }]);
    const res = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/draft').set('Authorization', `Bearer ${instructorA}`).send({
      projectId: projectA, sessionId: sessionA,
    });
    expect(res.status).toBe(201);
    expect(res.body.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('confirms a reviewed draft, retries idempotently, rejects tampered drafts and strangers', async () => {
    const requestId = randomUUID();
    const draft = {
      sprints: [{
        name: 'Confirmed Sprint', goal: 'Ship it',
        startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-14T00:00:00.000Z',
        tasks: [{ title: 'Confirmed task', priority: 'medium', storyPoints: 2, suggestedRole: 'frontend', assigneeId: feId }],
      }],
    };
    const first = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/confirm').set('Authorization', `Bearer ${instructorA}`).send({
      projectId: projectA, sessionId: sessionA, draft, requestId,
    });
    expect(first.status).toBe(201);
    expect(first.body.sprintCount).toBe(1);
    expect(first.body.taskCount).toBe(1);
    expect(first.body.deduped).toBe(false);
    const replay = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/confirm').set('Authorization', `Bearer ${instructorA}`).send({
      projectId: projectA, sessionId: sessionA, draft, requestId,
    });
    expect(replay.status).toBe(201);
    expect(replay.body.deduped).toBe(true);
    expect(replay.body.sprintCount).toBe(1);
    const tampered = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/confirm').set('Authorization', `Bearer ${instructorA}`).send({
      projectId: projectA, sessionId: sessionA, draft: { sprints: [] }, requestId: randomUUID(),
    });
    expect(tampered.status).toBe(400);
    expect(tampered.body.code).toBe('AI_INVALID_RESPONSE');
    const stranger = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/confirm').set('Authorization', `Bearer ${instructorB}`).send({
      projectId: projectA, sessionId: sessionA, draft, requestId: randomUUID(),
    });
    expect(stranger.status).toBe(403);
    const board = await request(apiBase()).get('/api/v1/sprints').set('Authorization', `Bearer ${instructorA}`);
    expect(board.body.meta.total).toBe(1);
  });
});
