import { createDatabaseSql } from '../src/database/create-database-sql';
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
 * M6 session overview (WP-6): one aggregated query per page — project,
 * members, sprint/task progress — with managed scope, filters and paging.
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

function templateDef(code: string) {
  return {
    code,
    name: `M6 template ${code}`,
    description: 'M6 session-overview fixture with enough detail.',
    difficulty: 'beginner',
    category: 'web',
    techStack: ['React'],
    roles: ['frontend'],
    roleDetails: [{ code: 'frontend', title: 'FE', countMin: 1, countMax: 1 }],
    modules: ['Shop'],
    sprints: [
      {
        name: 'Build', goal: 'Ship', durationDays: 7,
        tasks: [{ title: 'Work', requirements: 'Do the thing well', dod: ['Done'], role: 'frontend', storyPoints: 2 }],
      },
    ],
    dod: ['Done'], rubricVersion: 'task-review-v1', scenarios: ['Happy'],
    documentation: 'README plus API documentation with sufficient length.',
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
    const email = `e2e-m6-${tag}-${RUN}@vintern.test`;
    const created = await users.save(
      users.create({
        email, username: `e2e-m6-${tag}-${RUN}`, displayName: `M6 ${tag}`,
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

describe('M6 session overview', () => {
  let tokenA: string;
  let tokenB: string;
  let sessionA: string;

  beforeAll(async () => {
    tokenA = await login(`e2e-m6-a-${RUN}@vintern.test`);
    tokenB = await login(`e2e-m6-b-${RUN}@vintern.test`);

    // A: template session with a member, one sprint and two tasks (one done).
    const tpl = await request(apiBase()).post('/api/v1/project-templates').set('Authorization', `Bearer ${tokenA}`).send(templateDef(`M6-${RUN}`.toUpperCase()));
    expect(tpl.status).toBe(201);
    const started = await request(apiBase()).post(`/api/v1/project-templates/${tpl.body.id}/start`).set('Authorization', `Bearer ${tokenA}`).send({
      name: `M6 overview ${RUN}`, startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z', requestId: randomUUID(),
    });
    expect(started.status).toBe(201);
    sessionA = started.body.sessionId;
    const projectId: string = started.body.projectId;
    // Roster member: the second instructor exists in the DB (cross-instructor
    // membership is allowed at the roster level; assignments stay scoped).
    const instructorB = await dataSource.query(
      `SELECT TOP(1) id FROM users WHERE email = @0`,
      [`e2e-m6-b-${RUN}@vintern.test`],
    );
    const member = await request(apiBase()).post(`/api/v1/sessions/${sessionA}/members`).set('Authorization', `Bearer ${tokenA}`).send({
      userIds: [instructorB[0].id],
    });
    expect(member.status).toBe(201);
    const sprint = await request(apiBase()).post('/api/v1/sprints').set('Authorization', `Bearer ${tokenA}`).send({
      projectId, sessionId: sessionA, code: `M6-SP-${RUN}`, name: 'Sprint one',
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-14T00:00:00.000Z',
    });
    expect(sprint.status).toBe(201);
    expect(sprint.body.sessionId).toBe(sessionA);
    for (const [i, status, deleted] of [[0, 'done', false], [1, 'review', false], [2, 'done', true]] as const) {
      await dataSource.query(`INSERT INTO tasks(code,title,projectId,sprintId,status,deletedAt,assigneeId,dueDate)
        VALUES(@0,@1,@2,@3,@4,@5,@6,@7)`, [`M6-T-${RUN}-${i}`, `Task ${i}`, projectId, sprint.body.id, status, deleted ? new Date() : null, instructorB[0].id, new Date(i === 1 ? '2000-01-01T00:00:00.000Z' : '2026-11-10T00:00:00.000Z')]);
    }

    // B: legacy session with no template, members or sprints.
    const legacy = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${tokenB}`).send({
      code: `E2E-M6-SS-${RUN}`, name: 'M6 legacy', description: 'no template run',
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(legacy.status).toBe(201);
  }, 120_000);

  it('returns aggregated rows for the owner with zeros for legacy sessions', async () => {
    const res = await request(apiBase()).get('/api/v1/sessions/overview?page=1&pageSize=20').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const row = res.body.data.find((s: { id: string }) => s.id === sessionA);
    expect(row).toBeTruthy();
    expect(row.project).toMatchObject({ templateVersion: 1 });
    expect(row.memberCount).toBe(1);
    expect(row.sprintCount).toBe(1);
    expect(row.taskTotal).toBe(2);
    expect(row.taskDone).toBe(1);
    expect(row.taskPercent).toBe(50);
    expect(row.currentSprint).toBeNull();
    expect(row.alerts).toEqual({ overdueTasks: 1, pendingReview: 1, sessionOverdue: false });
    expect(row.taskDone).toBeLessThanOrEqual(row.taskTotal);
    expect(row.taskPercent).toBe(row.taskTotal === 0 ? 0 : Math.round((row.taskDone / row.taskTotal) * 100));
  });

  it('scopes ownership: B never sees the template session', async () => {
    const res = await request(apiBase()).get('/api/v1/sessions/overview?page=1&pageSize=20').set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((s: { id: string }) => s.id === sessionA)).toBe(false);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const forbidden = await request(apiBase()).get(`/api/v1/sessions/${sessionA}`).set('Authorization', `Bearer ${tokenB}`);
    expect(forbidden.status).toBe(403);
  });

  it('selects only an active Sprint and keeps it inside the managed session', async () => {
    await dataSource.query("UPDATE sprints SET status='active' WHERE sessionId=@0", [sessionA]);
    try {
      const res = await request(apiBase()).get(`/api/v1/sessions/overview?q=M6%20overview%20${RUN}`).set('Authorization', `Bearer ${tokenA}`);
      expect(res.status).toBe(200);
      expect(res.body.data[0].currentSprint).toMatchObject({ name: 'Sprint one', code: `M6-SP-${RUN}` });
      const foreign = await request(apiBase()).get(`/api/v1/sessions/overview?q=M6%20overview%20${RUN}`).set('Authorization', `Bearer ${tokenB}`);
      expect(foreign.body.meta.total).toBe(0);
    } finally {
      await dataSource.query("UPDATE sprints SET status='planned' WHERE sessionId=@0", [sessionA]);
    }
  });

  it('sorts the complete scoped result before applying pagination', async () => {
    for (const letter of ['A', 'B']) {
      const created = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${tokenA}`).send({
        code: `M6-SORT-${RUN}-${letter}`, name: `M6 sort ${RUN} ${letter}`,
        startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
      });
      expect(created.status).toBe(201);
    }
    const sorted = await request(apiBase()).get(`/api/v1/sessions/overview?q=M6%20sort%20${RUN}&sortBy=name&sortDirection=desc&pageSize=1&page=2`).set('Authorization', `Bearer ${tokenA}`);
    expect(sorted.status).toBe(200);
    expect(sorted.body.meta.total).toBe(2);
    expect(sorted.body.data[0].name).toBe(`M6 sort ${RUN} A`);
    const progress = await request(apiBase()).get(`/api/v1/sessions/overview?q=${RUN}&sortBy=progress&sortDirection=desc&pageSize=1`).set('Authorization', `Bearer ${tokenA}`);
    expect(progress.body.meta.total).toBe(3);
    expect(progress.body.data[0].id).toBe(sessionA);
    expect(progress.body.data[0].taskPercent).toBe(50);
  });

  it('rejects unsupported sort keys and SQL fragments at the DTO boundary', async () => {
    for (const query of ['sortBy=name%3BDROP%20TABLE%20tasks', 'sortDirection=DESC%3BSELECT%201', 'sortBy=__proto__']) {
      const invalid = await request(apiBase()).get(`/api/v1/sessions/overview?${query}`).set('Authorization', `Bearer ${tokenA}`);
      expect(invalid.status).toBe(400);
    }
  });

  it('returns complete detail counters, pinned snapshot, members and sprint rollups', async () => {
    const detail = await request(apiBase()).get(`/api/v1/sessions/${sessionA}`).set('Authorization', `Bearer ${tokenA}`);
    expect(detail.status).toBe(200);
    expect(detail.body.overview).toMatchObject({ taskTotal: 2, taskDone: 1, taskPercent: 50 });
    expect(detail.body.members).toHaveLength(1);
    expect(detail.body.projectSnapshot.techStack).toEqual(['React']);
    expect(detail.body.sprintProgress).toEqual([expect.objectContaining({ taskTotal: 2, taskDone: 1, taskReview: 1 })]);
  });

  it('searches roster identities only inside managed sessions and rejects foreign scope', async () => {
    const endpoint = `/api/v1/sessions/member-options?sessionId=${sessionA}&page=1&pageSize=1`;
    const own = await request(apiBase()).get(endpoint).set('Authorization', `Bearer ${tokenA}`);
    expect(own.status).toBe(200);
    expect(own.body.meta.total).toBe(1);
    expect(own.body.data[0].email).toBe(`e2e-m6-b-${RUN}@vintern.test`);
    expect(own.body.data[0].passwordHash).toBeUndefined();
    const foreign = await request(apiBase()).get(endpoint).set('Authorization', `Bearer ${tokenB}`);
    expect(foreign.status).toBe(200);
    expect(foreign.body.meta.total).toBe(0);
    const missing = await request(apiBase()).get(`${endpoint}&q=not-present`).set('Authorization', `Bearer ${tokenA}`);
    expect(missing.body.meta.total).toBe(0);
    const detail = await request(apiBase()).get(`/api/v1/sessions/${sessionA}`).set('Authorization', `Bearer ${tokenA}`);
    const sessions = await request(apiBase()).get(`/api/v1/sessions?projectId=${detail.body.overview.project.id}`).set('Authorization', `Bearer ${tokenA}`);
    expect(sessions.body.data.some((s: { id: string }) => s.id.toLowerCase() === sessionA)).toBe(true);
  });

  it('filters by search and status with stable paging', async () => {
    const byName = await request(apiBase()).get(`/api/v1/sessions/overview?q=M6%20overview&page=1&pageSize=20`).set('Authorization', `Bearer ${tokenA}`);
    expect(byName.status).toBe(200);
    expect(byName.body.meta.total).toBe(1);
    expect(byName.body.data[0].id).toBe(sessionA);

    const active = await request(apiBase()).get('/api/v1/sessions/overview?status=upcoming&page=1&pageSize=20').set('Authorization', `Bearer ${tokenA}`);
    expect(active.status).toBe(200);
    expect(active.body.data.every((s: { status: string }) => s.status === 'upcoming')).toBe(true);
  });

  it('filters cross-session delivery by member, status and deadlines without widening ownership', async () => {
    const detail = await request(apiBase()).get(`/api/v1/sessions/${sessionA}`).set('Authorization', `Bearer ${tokenA}`);
    const assignee = detail.body.members[0].userId;
    const scope = `sessionId=${sessionA}&assigneeId=${assignee}`;
    const sprints = await request(apiBase()).get(`/api/v1/sprints?${scope}&dueFrom=2026-11-13&dueTo=2026-11-15`).set('Authorization', `Bearer ${tokenA}`);
    expect(sprints.status).toBe(200);
    expect(sprints.body.meta.total).toBe(1);
    const lateSprints = await request(apiBase()).get(`/api/v1/sprints?${scope}&dueFrom=2026-11-15`).set('Authorization', `Bearer ${tokenA}`);
    expect(lateSprints.body.meta.total).toBe(0);
    const doneTasks = await request(apiBase()).get(`/api/v1/tasks?${scope}&status=done&dueTo=2026-11-11`).set('Authorization', `Bearer ${tokenA}`);
    expect(doneTasks.status).toBe(200);
    expect(doneTasks.body.meta.total).toBe(1);
    const foreign = await request(apiBase()).get(`/api/v1/sprints?${scope}`).set('Authorization', `Bearer ${tokenB}`);
    expect(foreign.body.meta.total).toBe(0);
  });
});
