import { createConnection } from 'node:net';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { ENTITIES } from '../src/database/entities';
import { InitPlatformCore1759872000000 } from '../src/database/migrations/1759872000000-InitPlatformCore';
import { CreateAcademicCoreTables1759958400000 } from '../src/database/migrations/1759958400000-CreateAcademicCoreTables';
import { CreateSprintTaskCoreTables1760044800000 } from '../src/database/migrations/1760044800000-CreateSprintTaskCoreTables';
import { CreateProjectTemplates1760563200000 } from '../src/database/migrations/1760563200000-CreateProjectTemplates';
import { CreateProjectRoleSlots1761254400000 } from '../src/database/migrations/1761254400000-CreateProjectRoleSlots';
import { AddTemplateLibraryColumns1761427200000 } from '../src/database/migrations/1761427200000-AddTemplateLibraryColumns';
import { AddTemplateRunRequest1761513600000 } from '../src/database/migrations/1761513600000-AddTemplateRunRequest';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';

/**
 * M2 Project Template Library (WP-3): library search/filter, detail, versioned
 * update, archive, Start (upcoming session + active project + slots + snapshot),
 * idempotent replay, session independence across runs.
 *
 * SAFETY: disposable DB only (E2E_DB_NAME), real migrations, no mocks.
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
const RUN = Date.now().toString(36);
const PW = 'E2e-Password-1';

function definition(code: string) {
  return {
    code,
    name: `E2E Library ${code}`,
    description: 'E-commerce template with enough detail for the library.',
    difficulty: 'intermediate',
    category: 'web',
    slug: 'ecommerce-library', estimatedDurationDays: 14, recommendedTeamSize: 3,
    businessRules: ['Server determines prices; order creation is atomic.'],
    architecture: { overview: 'React REST client, NestJS service and SQL Server transaction.', entities: ['Product', 'Order'], apiSuggestions: ['POST /orders'], frontendPages: ['/products', '/checkout'] },
    milestones: [{ title: 'Foundation demo', day: 14, taskKeys: ['auth-api'], acceptance: 'Login API passes integration tests.' }],
    expectedOutcome: 'A shop with tested order and authentication flows.',
    techStack: ['React', 'NestJS', 'SQL Server'],
    roles: ['frontend', 'backend'],
    roleDetails: [
      { code: 'frontend', title: 'Frontend Developer', countMin: 1, countMax: 2, requiredSkills: ['React', 'REST'] },
      { code: 'backend', title: 'Backend Developer', countMin: 1, countMax: 1, requiredSkills: ['NestJS', 'SQL'] },
    ],
    modules: ['Auth', 'Catalog', 'Cart', 'Checkout', 'Admin'],
    objectives: { business: 'Sell goods online', learning: ['Full-stack delivery'], product: ['Working shop'] },
    scopeIn: ['Web shop'], scopeOut: ['Mobile app'],
    functionalRequirements: ['Authentication', 'Product catalog', 'Cart', 'Checkout'],
    nonFunctionalRequirements: ['p95 list under 300ms'],
    sprints: [
      {
        name: 'Foundation', goal: 'Setup and auth', durationDays: 14,
        tasks: [{ key: 'auth-api', dependsOn: [] as string[], estimatedHours: 12, complexity: 'medium', priority: 'high', recommendedOrder: 1, skillTags: ['REST', 'auth'], title: 'Auth API', requirements: 'JWT login with refresh cookies', dod: ['Login works'], role: 'backend', storyPoints: 5 }],
      },
    ],
    dod: ['Main flows work', 'Demo succeeds'],
    rubricVersion: 'task-review-v1',
    scenarios: ['E2E happy path'],
    documentation: 'README plus API documentation with sufficient length.',
    expectedOutputs: { deliverables: ['Shop frontend', 'Shop API'], artifacts: ['Demo video'] },
    acceptance: { definitionOfDone: ['DoD item one'], qualityGates: ['No blocker defects'] },
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
      CreateProjectTemplates1760563200000,
      CreateProjectRoleSlots1761254400000,
      AddTemplateLibraryColumns1761427200000,
      AddTemplateRunRequest1761513600000,
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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
  for (const tag of ['a', 'b']) {
    const email = `e2e-m2-${tag}-${RUN}@vintern.test`;
    const created = await users.save(
      users.create({
        email, username: `e2e-m2-${tag}-${RUN}`, displayName: `M2 ${tag}`,
        passwordHash: await hash(PW, 10), status: 'active',
      }),
    );
    await userRoles.insert({ userId: created.id, roleId: instructorRole.id });
  }
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

describe('M2 Project Template Library', () => {
  let token: string;
  let templateId: string;
  const templateCode = `ECOM-${RUN}`.toUpperCase();

  beforeAll(async () => {
    token = await login(`e2e-m2-a-${RUN}@vintern.test`);
  });

  it('creates a rich template and lists it with search/filter/pagination', async () => {
    const created = await request(apiBase()).post('/api/v1/project-templates').set('Authorization', `Bearer ${token}`).send(definition(templateCode));
    expect(created.status).toBe(201);
    expect(created.body.code).toBe(templateCode);
    expect(created.body.version).toBe(1);
    templateId = created.body.id;

    const dup = await request(apiBase()).post('/api/v1/project-templates').set('Authorization', `Bearer ${token}`).send(definition(templateCode));
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('TEMPLATE_CODE_TAKEN');

    const list = await request(apiBase()).get(`/api/v1/project-templates?search=${templateCode.slice(0, 8)}&category=web&difficulty=intermediate&page=1&pageSize=10`).set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1);
    const hit = list.body.data.find((t: { id: string }) => t.id === templateId);
    expect(hit).toBeTruthy();
    expect(hit.teamSize).toBe(3);
    expect(hit.sprintCount).toBe(1);
    expect(hit.status).toBe('active');
  });

  it('shows full template detail with blueprint and runs', async () => {
    const detail = await request(apiBase()).get(`/api/v1/project-templates/${templateId}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.definition.objectives.business).toBe('Sell goods online');
    expect(detail.body.definition.roleDetails).toHaveLength(2);
    expect(detail.body.definition.architecture.apiSuggestions).toContain('POST /orders');
    expect(detail.body.definition.milestones[0].taskKeys).toEqual(['auth-api']);
    expect(detail.body.definition.acceptance.definitionOfDone).toContain('DoD item one');
    expect(detail.body.runs).toEqual([]);
  });

  it('versions definition updates and archives safely', async () => {
    const def = definition(templateCode);
    (def as { techStack: string[] }).techStack = [...def.techStack, 'Redis'];
    const updated = await request(apiBase()).patch(`/api/v1/project-templates/${templateId}`).set('Authorization', `Bearer ${token}`).send({ definition: def });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);

    const archived = await request(apiBase()).patch(`/api/v1/project-templates/${templateId}`).set('Authorization', `Bearer ${token}`).send({ status: 'archived' });
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');

    const hidden = await request(apiBase()).get('/api/v1/project-templates').set('Authorization', `Bearer ${token}`);
    expect(hidden.body.data.some((t: { id: string }) => t.id === templateId)).toBe(false);
    const shown = await request(apiBase()).get('/api/v1/project-templates?status=archived').set('Authorization', `Bearer ${token}`);
    expect(shown.body.data.some((t: { id: string }) => t.id === templateId)).toBe(true);

    // Archived templates refuse new sessions.
    const blocked = await request(apiBase()).post(`/api/v1/project-templates/${templateId}/start`).set('Authorization', `Bearer ${token}`).send({
      name: 'Blocked session', startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('TEMPLATE_ARCHIVED');

    const reopened = await request(apiBase()).patch(`/api/v1/project-templates/${templateId}`).set('Authorization', `Bearer ${token}`).send({ status: 'active' });
    expect(reopened.status).toBe(200);
  });

  it('starts an upcoming session with active project, copied slots and pinned snapshot', async () => {
    const requestId = randomUUID();
    const started = await request(apiBase()).post(`/api/v1/project-templates/${templateId}/start`).set('Authorization', `Bearer ${token}`).send({
      name: `M2 session ${RUN}`, startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z', requestId,
    });
    expect(started.status).toBe(201);
    expect(started.body.deduped).toBe(false);
    expect(started.body.templateVersion).toBe(2);

    const session = await request(apiBase()).get(`/api/v1/sessions/${started.body.sessionId}`).set('Authorization', `Bearer ${token}`);
    expect(session.body.status).toBe('upcoming');
    const project = await request(apiBase()).get(`/api/v1/projects/${started.body.projectId}`).set('Authorization', `Bearer ${token}`);
    expect(project.body.status).toBe('active');

    const slots = await request(apiBase()).get(`/api/v1/projects/${started.body.projectId}/slots`).set('Authorization', `Bearer ${token}`);
    expect(slots.status).toBe(200);
    const codes = Object.fromEntries(slots.body.slots.map((s: { roleCode: string; requiredCount: number }) => [s.roleCode, s.requiredCount]));
    expect(codes).toMatchObject({ frontend: 2, backend: 1 });

    const ctx = await request(apiBase()).get(`/api/v1/projects/${started.body.projectId}/template-context`).set('Authorization', `Bearer ${token}`);
    expect(ctx.body.templateVersion).toBe(2);
    expect(ctx.body.definition.techStack).toContain('Redis');
    expect(ctx.body.definition.sprints[0].tasks[0]).toMatchObject({ key: 'auth-api', estimatedHours: 12 });

    // Idempotent replay: same requestId returns the same run, no new entities.
    const sessionsBefore = await request(apiBase()).get('/api/v1/sessions?page=1&pageSize=100').set('Authorization', `Bearer ${token}`);
    const replay = await request(apiBase()).post(`/api/v1/project-templates/${templateId}/start`).set('Authorization', `Bearer ${token}`).send({
      name: `M2 session ${RUN}`, startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z', requestId,
    });
    expect(replay.body.deduped).toBe(true);
    expect(replay.body.id).toBe(started.body.id);
    const sessionsAfter = await request(apiBase()).get('/api/v1/sessions?page=1&pageSize=100').set('Authorization', `Bearer ${token}`);
    expect(sessionsAfter.body.meta.total).toBe(sessionsBefore.body.meta.total);
  });

  it('keeps the run snapshot immutable after later template edits', async () => {
    const def = definition(templateCode);
    def.modules.push('Reports');
    def.businessRules.push('New future policy');
    const updated = await request(apiBase()).patch(`/api/v1/project-templates/${templateId}`).set('Authorization', `Bearer ${token}`).send({ definition: def });
    expect(updated.body.version).toBe(3);

    const runs = await request(apiBase()).get(`/api/v1/project-templates/${templateId}`).set('Authorization', `Bearer ${token}`);
    expect(runs.body.runs.length).toBeGreaterThanOrEqual(1);
    const run = runs.body.runs[0];
    const projectId = run.projectId;
    const ctx = await request(apiBase()).get(`/api/v1/projects/${projectId}/template-context`).set('Authorization', `Bearer ${token}`);
    expect(ctx.body.templateVersion).toBe(2);
    expect(ctx.body.definition.modules).not.toContain('Reports');
    expect(ctx.body.definition.businessRules).not.toContain('New future policy');
  });

  it('rejects invalid dependency graphs before creating a template', async () => {
    const invalid = definition(`INVALID-${RUN}`);
    invalid.sprints[0].tasks[0].dependsOn = ['missing-task'];
    const response = await request(apiBase()).post('/api/v1/project-templates').set('Authorization', `Bearer ${token}`).send(invalid);
    expect(response.status).toBe(400); expect(response.body.code).toBe('INVALID_BLUEPRINT');
    expect(await dataSource.query('SELECT id FROM project_templates WHERE code=@0', [invalid.code])).toHaveLength(0);
  });

  it('starts a second independent session from the same template', async () => {
    const other = await login(`e2e-m2-b-${RUN}@vintern.test`);
    const started = await request(apiBase()).post(`/api/v1/project-templates/${templateId}/start`).set('Authorization', `Bearer ${other}`).send({
      name: `M2 session B ${RUN}`, startDate: '2026-12-01T00:00:00.000Z', endDate: '2027-01-31T00:00:00.000Z', requestId: randomUUID(),
    });
    expect(started.status).toBe(201);
    expect(started.body.projectId).not.toBeUndefined();
    const project = await request(apiBase()).get(`/api/v1/projects/${started.body.projectId}`).set('Authorization', `Bearer ${other}`);
    expect(project.body.status).toBe('active');
    // B sees only their own project (ownership scoping, not shared).
    const mine = await request(apiBase()).get('/api/v1/projects?page=1&pageSize=100').set('Authorization', `Bearer ${other}`);
    expect(mine.body.data.some((p: { id: string }) => p.id === started.body.projectId)).toBe(true);
  });
  it('serializes concurrent keyed creates without orphan sessions or projects', async () => {
    const requestId = randomUUID();
    const name = `Concurrent library ${RUN}`;
    const [{ requesterId }] = await dataSource.query('SELECT TOP(1) requesterId FROM template_runs WHERE templateId=@0 ORDER BY createdAt', [templateId]);
    const [before] = await dataSource.query('SELECT COUNT(*) n FROM projects WHERE mentorId=@0', [requesterId]);
    const responses = await Promise.all(Array.from({ length: 3 }, () => request(apiBase()).post(`/api/v1/project-templates/${templateId}/start`).set('Authorization', `Bearer ${token}`).send({ name, startDate: '2026-11-01', endDate: '2026-12-31', requestId })));
    expect(responses.map(r => r.status)).toEqual([201, 201, 201]);
    expect(new Set(responses.map(r => r.body.id)).size).toBe(1);
    const sessions = await dataSource.query('SELECT id FROM internship_sessions WHERE name=@0', [name]);
    const [after] = await dataSource.query('SELECT COUNT(*) n FROM projects WHERE mentorId=@0', [requesterId]);
    expect(sessions).toHaveLength(1);
    expect(after.n - before.n).toBe(1);
  });

  it('shares the blueprint but protects another instructors runs, context and change requests', async () => {
    const other = await login(`e2e-m2-b-${RUN}@vintern.test`);
    const ownDetail = await request(apiBase()).get(`/api/v1/project-templates/${templateId}`).set('Authorization', `Bearer ${other}`);
    expect(ownDetail.status).toBe(200);
    expect(ownDetail.body.definition.name).toBeTruthy();
    expect(ownDetail.body.runs).toHaveLength(1);
    const projectId = ownDetail.body.runs[0].projectId;
    const mine = await request(apiBase()).get(`/api/v1/project-templates/${templateId}`).set('Authorization', `Bearer ${token}`);
    expect(mine.body.runs.every((r: { projectId: string }) => r.projectId !== projectId)).toBe(true);
    const input = { title: 'Owned change', description: 'Implement the real scoped change', reason: 'Scoped project regression coverage' };
    const change = await request(apiBase()).post(`/api/v1/projects/${projectId}/changes`).set('Authorization', `Bearer ${other}`).send(input);
    expect(change.status).toBe(201);
    for (const path of [`/api/v1/projects/${projectId}/template-context`, `/api/v1/projects/${projectId}/changes`]) {
      expect((await request(apiBase()).get(path).set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(apiBase()).get(path).set('Authorization', `Bearer ${other}`)).status).toBe(200);
    }
    expect((await request(apiBase()).post(`/api/v1/projects/${projectId}/changes`).set('Authorization', `Bearer ${token}`).send(input)).status).toBe(403);
    expect((await request(apiBase()).post(`/api/v1/project-changes/${change.body.id}/apply`).set('Authorization', `Bearer ${token}`)).status).toBe(403);
    const [persisted] = await dataSource.query('SELECT status,taskId FROM project_change_requests WHERE id=@0', [change.body.id]);
    expect(persisted.status).toBe('proposed');
    expect(persisted.taskId).toBeNull();
    expect((await request(apiBase()).post(`/api/v1/project-changes/${change.body.id}/apply`).set('Authorization', `Bearer ${other}`)).status).toBe(201);
  });

});
