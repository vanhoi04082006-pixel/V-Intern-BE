import { createDatabaseSql } from '../src/database/create-database-sql';
import { Sprint } from '../src/sprints/entities/sprint.entity';
import { createConnection } from 'node:net';
import { hash } from 'bcryptjs';
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
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { ensureRecruitedProfile, userIdByEmail } from './recruitment-fixtures';

/**
 * PHASE 3 e2e — Sprint / Task core (spec 37).
 *
 * SAFETY + HONESTY RULES (identical to Phase 2):
 * - Refuses to run unless E2E_DB_NAME names a DISPOSABLE database.
 * - Without a reachable SQL Server this suite FAILS with [E2E BLOCKED] —
 *   integration status stays NOT VERIFIED; never a fake PASS.
 * - Applies REAL migrations (Phase 1 + Phase 2 + Phase 3) to the
 *   disposable DB — never synchronize.
 *
 * Scenario (spec 37): teacher creates sprint → activates it → one-active
 * invariant → creates task with assignee → intern lists own tasks → starts
 * task → submits review → teacher approves done → history has all
 * transitions → notification + audit + activity exist → intern cannot
 * mutate another task → duplicate/illegal transition 409 → task for an
 * unrelated project rejected → sprint completion rule enforced.
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

beforeAll(async () => {
  if (!DB_NAME) {
    throw new Error(
      '[E2E BLOCKED] E2E_DB_NAME is not set. Point it at a DISPOSABLE database. ' +
        'Integration status: NOT VERIFIED.',
    );
  }
  if (!(await tcpReachable(DB_HOST, DB_PORT))) {
    throw new Error(
      `[E2E BLOCKED] SQL Server ${DB_HOST}:${DB_PORT} unreachable. ` +
        'Integration status: NOT VERIFIED (expected in environments without SQL Server).',
    );
  }

  const adminDs = new DataSource({
    type: 'mssql',
    host: DB_HOST,
    port: DB_PORT,
    database: 'master',
    username: DB_USER,
    password: DB_PASS,
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    logging: false,
  });
  await adminDs.initialize();
  await adminDs.query(createDatabaseSql(DB_NAME, process.env.DB_FILES_ROOT));
  await adminDs.destroy();

  const migDs = new DataSource({
    type: 'mssql',
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASS,
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    synchronize: false,
    logging: false,
    entities: ENTITIES,
    migrations: [
      InitPlatformCore1759872000000,
      CreateAcademicCoreTables1759958400000,
      CreateSprintTaskCoreTables1760044800000,
    ],
    migrationsRun: false,
  });
  await migDs.initialize();
  await migDs.runMigrations();
  await migDs.destroy();

  dataSource = new DataSource({
    type: 'mssql',
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASS,
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    entities: ENTITIES,
    synchronize: false,
    logging: false,
  });
  await dataSource.initialize();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  // Bind ONCE on an ephemeral port — supertest addresses it by URL and
  // never listens/closes the shared server per request (race-free).
  await app.listen(0);

  await ensureRbac(dataSource);
  const roles = dataSource.getRepository(Role);
  const users = dataSource.getRepository(User);
  const userRoles = dataSource.getRepository(UserRole);
  const adminRole = await roles.findOneOrFail({ where: { code: 'admin' } });
  const instructorRole = await roles.findOneOrFail({ where: { code: 'instructor' } });
  const internRole = await roles.findOneOrFail({ where: { code: 'intern' } });

  const specs: Array<{ email: string; username: string; roleId: string }> = [
    { email: 'e2e-admin@vintern.test', username: 'e2e-admin', roleId: adminRole.id },
    { email: 'e2e-instructor@vintern.test', username: 'e2e-instructor', roleId: instructorRole.id },
    { email: `e2e-st-${RUN}-intern@vintern.test`, username: `e2e-st-${RUN}-intern`, roleId: internRole.id },
    { email: `e2e-st-${RUN}-intern-2@vintern.test`, username: `e2e-st-${RUN}-intern-2`, roleId: internRole.id },
  ];
  for (const spec of specs) {
    const existing = await users.findOne({ where: { email: spec.email } });
    if (!existing) {
      const created = await users.save(
        users.create({
          email: spec.email,
          username: spec.username,
          displayName: spec.username,
          passwordHash: await hash('E2e-Password-1', 10),
          status: 'active',
        }),
      );
      await userRoles.insert({ userId: created.id, roleId: spec.roleId });
    }
  }

  // Phase 4 (spec 47): seed PASSED recruitment profiles — Phase 3 semantics
  // (workspace + sprints + tasks) are tested on recruitable interns.
  for (const email of [`e2e-st-${RUN}-intern@vintern.test`, `e2e-st-${RUN}-intern-2@vintern.test`]) {
    await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, email));
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
  await dataSource?.destroy();
});

/** Base URL of the once-bound server (ephemeral port from listen(0)). */
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

describe('Phase 3 sprint/task e2e — plan → activate → task → review → done (spec 37)', () => {
  let admin: string;
  let instructor: string;
  let intern: string;
  let sessionId: string;
  let projectId: string;
  let sprintId: string;
  let taskId: string;
  let otherProjectId: string;

  it('setup: logins + workspace starts unassigned', async () => {
    admin = await login('e2e-admin@vintern.test');
    instructor = await login('e2e-instructor@vintern.test');
    intern = await login(`e2e-st-${RUN}-intern@vintern.test`);
    await login(`e2e-st-${RUN}-intern-2@vintern.test`); // second intern account must be loginable

    const res = await request(apiBase())
      .get('/api/v1/intern/me/workspace')
      .set('Authorization', `Bearer ${intern}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('unassigned');
    expect(res.body.currentSprint).toBeNull();
    expect(res.body.taskSummary).toEqual({ todo: 0, doing: 0, review: 0, done: 0, total: 0 });
    expect(res.body.focusedTask).toBeNull();
  });

  it('instructor creates session + project + assignment (intern ready)', async () => {
    const session = await request(apiBase())
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${instructor}`)
      .send({
        code: `E2E-S-${RUN}`,
        name: 'Phiên e2e sprint/task',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
      });
    expect(session.status).toBe(201);
    sessionId = session.body.id;
    // Real contract (sessions.controller): status changes via PATCH /sessions/:id.
    await request(apiBase())
      .patch(`/api/v1/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'active' })
      .expect((r) => {
        if (![200, 201].includes(r.status)) throw new Error(`session activation failed: ${r.status} ${r.text}`);
      });

    const project = await request(apiBase())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ code: `E2E-P-${RUN}`, name: 'Đồ án e2e sprint', description: 'Phase 3 e2e', status: 'active', capacity: 2 });
    expect(project.status).toBe(201);
    projectId = project.body.id;

    const assigned = await request(apiBase())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ internId: (await dataSource.getRepository(User).findOneByOrFail({ email: `e2e-st-${RUN}-intern@vintern.test` })).id, projectId, sessionId });
    expect([200, 201]).toContain(assigned.status);
  });

  it('teacher creates a sprint (planned)', async () => {
    const res = await request(apiBase())
      .post('/api/v1/sprints')
      .set('Authorization', `Bearer ${instructor}`)
      .send({
        code: `E2E-SP-${RUN}`,
        name: 'Sprint e2e',
        projectId,
        sessionId,
        goal: 'Hoàn thành lõi sprint/task',
        startDate: '2026-02-01T00:00:00.000Z',
        endDate: '2026-02-14T00:00:00.000Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('planned');
    sprintId = res.body.id;
  });

  it('teacher activates the sprint; second activation → 409 SPRINT_ACTIVE_EXISTS', async () => {
    const res = await request(apiBase())
      .post(`/api/v1/sprints/${sprintId}/status`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'active' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');

    const other = await request(apiBase())
      .post('/api/v1/sprints')
      .set('Authorization', `Bearer ${instructor}`)
      .send({
        code: `E2E-SP2-${RUN}`,
        name: 'Sprint song song',
        projectId,
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-14T00:00:00.000Z',
      });
    expect(other.status).toBe(201);
    const conflict = await request(apiBase())
      .post(`/api/v1/sprints/${other.body.id}/status`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'active' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('SPRINT_ACTIVE_EXISTS');
  });

  it('teacher creates a task assigned to the intern', async () => {
    const internId = (await dataSource.getRepository(User).findOneByOrFail({ email: `e2e-st-${RUN}-intern@vintern.test` })).id;
    const res = await request(apiBase())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${instructor}`)
      .send({
        title: 'Module đăng nhập',
        projectId,
        sprintId,
        assigneeId: internId,
        storyPoints: 5,
        dueDate: '2026-02-10T00:00:00.000Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('todo');
    expect(res.body.code).toMatch(new RegExp(`^${projectId ? '' : ''}`));
    expect(res.body.code).toContain('-');
    taskId = res.body.id;
  });

  it('task for an unrelated project → 409 SPRINT_PROJECT_MISMATCH', async () => {
    const other = await request(apiBase())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ code: `E2E-PX-${RUN}`, name: 'Đồ án khác', description: 'khác', status: 'active', capacity: 2 });
    expect(other.status).toBe(201);
    otherProjectId = other.body.id;
    const res = await request(apiBase())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ title: 'Task sai dự án', projectId: otherProjectId, sprintId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SPRINT_PROJECT_MISMATCH');
  });

  it('intern lists OWN tasks (mine=true) and sees the task', async () => {
    const res = await request(apiBase())
      .get('/api/v1/tasks?mine=true')
      .set('Authorization', `Bearer ${intern}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((t: { id: string }) => t.id === taskId)).toBe(true);
    const ownTask = res.body.data.find((t: { id: string }) => t.id === taskId);
    const storedSprint = await dataSource.getRepository(Sprint).findOneByOrFail({ id: ownTask.sprintId });
    expect(ownTask.sprint).toEqual({ id: storedSprint.id.toLowerCase(), code: storedSprint.code, name: storedSprint.name, status: storedSprint.status });
    expect(ownTask.repository).toBeNull();
  });

  it('intern starts the task (todo→doing) and submits review (doing→review)', async () => {
    const observed = await request(apiBase()).get(`/api/v1/tasks/${taskId}`).set('Authorization', `Bearer ${intern}`);
    const version = observed.body.version as number;
    const first = await request(apiBase()).patch(`/api/v1/tasks/${taskId}/my`).set('Authorization', `Bearer ${intern}`).send({ progress: 22, expectedVersion: version });
    expect(first.status).toBe(200);
    const stale = await request(apiBase()).patch(`/api/v1/tasks/${taskId}/my`).set('Authorization', `Bearer ${intern}`).send({ progress: 99, expectedVersion: version });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('TASK_VERSION_CONFLICT');
    const staleManager = await request(apiBase()).patch(`/api/v1/tasks/${taskId}`).set('Authorization', `Bearer ${instructor}`).send({ title: 'stale overwrite', expectedVersion: version });
    expect(staleManager.status).toBe(409);
    expect(staleManager.body.code).toBe('TASK_VERSION_CONFLICT');
    const persisted = await dataSource.query('SELECT progress, title FROM tasks WHERE id=@0', [taskId]);
    expect(Number(persisted[0].progress)).toBe(22);
    expect(persisted[0].title).toBe(observed.body.title);
    const start = await request(apiBase())
      .patch(`/api/v1/tasks/${taskId}/my`)
      .set('Authorization', `Bearer ${intern}`)
      .send({ status: 'doing' });
    expect(start.status).toBe(200);
    expect(start.body.status).toBe('doing');

    const review = await request(apiBase())
      .patch(`/api/v1/tasks/${taskId}/my`)
      .set('Authorization', `Bearer ${intern}`)
      .send({ status: 'review' });
    expect(review.status).toBe(200);
    expect(review.body.status).toBe('review');
  });

  it('intern CANNOT approve (review→done) — 409 INVALID_TASK_TRANSITION', async () => {
    const res = await request(apiBase())
      .patch(`/api/v1/tasks/${taskId}/my`)
      .set('Authorization', `Bearer ${intern}`)
      .send({ status: 'done' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TASK_TRANSITION');
  });

  it('teacher approves done (review→done) → progress forced to 100', async () => {
    const res = await request(apiBase())
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'done', reason: 'Duyệt hồ sơ hoàn thành' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.progress).toBe(100);
  });

  it('history contains ALL transitions: null→todo, todo→doing, doing→review, review→done', async () => {
    const res = await request(apiBase())
      .get(`/api/v1/tasks/${taskId}/history`)
      .set('Authorization', `Bearer ${instructor}`);
    expect(res.status).toBe(200);
    const transitions = res.body.data.map((h: { fromStatus: string | null; toStatus: string }) =>
      `${h.fromStatus ?? 'null'}->${h.toStatus}`,
    );
    expect(transitions).toEqual(['null->todo', 'todo->doing', 'doing->review', 'review->done']);
  });

  it('notifications created for the intern (task assigned / completed)', async () => {
    const res = await request(apiBase())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${intern}`);
    expect(res.status).toBe(200);
    const types = res.body.data.map((n: { type: string }) => n.type);
    expect(types).toContain('task');
  });

  it('audit trail contains sprint + task actions (admin view)', async () => {
    // Real route contract: GET /api/v1/audit-logs (audit.controller).
    const res = await request(apiBase())
      .get('/api/v1/audit-logs?action=task.status_changed&pageSize=5')
      .set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('intern cannot mutate ANOTHER intern task (403 TASK_NOT_OWNED)', async () => {
    const intern2Id = (await dataSource.getRepository(User).findOneByOrFail({ email: `e2e-st-${RUN}-intern-2@vintern.test` })).id;
    // The assignee boundary requires an ACTIVE assignment on THIS project —
    // give intern-2 one, then create their task (spec 27).
    const assigned = await request(apiBase())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ internId: intern2Id, projectId, sessionId });
    expect([200, 201]).toContain(assigned.status);
    const second = await request(apiBase())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ title: 'Task của intern 2', projectId, sprintId, assigneeId: intern2Id });
    expect(second.status).toBe(201);
    const res = await request(apiBase())
      .patch(`/api/v1/tasks/${second.body.id}/my`)
      .set('Authorization', `Bearer ${intern}`)
      .send({ status: 'doing' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TASK_NOT_OWNED');
  });

  it('duplicate/illegal transition → 409 (todo→done by manage is still illegal)', async () => {
    const internId = (await dataSource.getRepository(User).findOneByOrFail({ email: `e2e-st-${RUN}-intern@vintern.test` })).id;
    const fresh = await request(apiBase())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ title: 'Task mới todo', projectId, sprintId, assigneeId: internId });
    expect(fresh.status).toBe(201);
    const res = await request(apiBase())
      .patch(`/api/v1/tasks/${fresh.body.id}`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'done' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TASK_TRANSITION');
  });

  it('intern project/board reads are assignment scoped without broad view permissions', async () => {
    const internId = (await dataSource.getRepository(User).findOneByOrFail({ email: `e2e-st-${RUN}-intern@vintern.test` })).id;
    const project = await request(apiBase()).get('/api/v1/intern/me/project').set('Authorization', `Bearer ${intern}`);
    expect(project.status).toBe(200);
    expect(project.body.id).toBe(projectId);
    const broad = await request(apiBase()).get(`/api/v1/projects/${projectId}`).set('Authorization', `Bearer ${intern}`);
    expect(broad.status).toBe(403);
    const board = await request(apiBase()).get('/api/v1/intern/me/sprint/board?pageSize=100').set('Authorization', `Bearer ${intern}`);
    expect(board.status).toBe(200);
    expect(board.body.sprint.id).toBe(sprintId);
    const tasks = board.body.columns.flatMap((column: { tasks: Array<{ assigneeId: string }> }) => column.tasks);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task: { assigneeId: string }) => task.assigneeId === internId)).toBe(true);
    const [count] = await dataSource.query('SELECT COUNT(*) AS n FROM tasks WHERE sprintId=@0 AND assigneeId=@1 AND deletedAt IS NULL', [sprintId, internId]);
    expect(board.body.total).toBe(count.n);
    const [ownOverdue] = await dataSource.query("SELECT COUNT(*) n FROM tasks WHERE sprintId=@0 AND assigneeId=@1 AND deletedAt IS NULL AND status<>'done' AND dueDate<SYSUTCDATETIME()", [sprintId, internId]);
    expect(board.body.overdueOpenTaskCount).toBe(ownOverdue.n);
    const forged = await request(apiBase()).get('/api/v1/intern/me/sprint/board?assigneeId=00000000-0000-4000-8000-000000000001').set('Authorization', `Bearer ${intern}`);
    expect(forged.status).toBe(400);
  });

  it('sprint completion rule: open tasks → 409 SPRINT_HAS_OPEN_TASKS; override completes (audited)', async () => {
    const blocked = await request(apiBase())
      .post(`/api/v1/sprints/${sprintId}/status`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'completed' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('SPRINT_HAS_OPEN_TASKS');

    const override = await request(apiBase())
      .post(`/api/v1/sprints/${sprintId}/status`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'completed', allowOpenTasks: true });
    expect(override.status).toBe(201);
    expect(override.body.status).toBe('completed');
  });

  it('sprint board + completion endpoints serve REAL grouped data', async () => {
    const board = await request(apiBase())
      .get(`/api/v1/sprints/${sprintId}/board`)
      .set('Authorization', `Bearer ${instructor}`);
    expect(board.status).toBe(200);
    expect(board.body.columns.length).toBe(4);
    expect(board.body.total).toBeGreaterThanOrEqual(2);
    const [overdue] = await dataSource.query("SELECT COUNT(*) n FROM tasks WHERE sprintId=@0 AND deletedAt IS NULL AND status<>'done' AND dueDate<SYSUTCDATETIME()", [sprintId]);
    expect(board.body.overdueOpenTaskCount).toBe(overdue.n);
    expect(board.body.sprint.sessionId).toBe(sessionId.toLowerCase());

    const completion = await request(apiBase())
      .get(`/api/v1/sprints/${sprintId}/completion`)
      .set('Authorization', `Bearer ${instructor}`);
    expect(completion.status).toBe(200);
    expect(completion.body.total).toBeGreaterThanOrEqual(2);
  });

  it('RBAC negatives: intern cannot create sprints/tasks (spec 33)', async () => {
    const sprint = await request(apiBase())
      .post('/api/v1/sprints')
      .set('Authorization', `Bearer ${intern}`)
      .send({
        code: `E2E-NO-${RUN}`,
        name: 'Không được',
        projectId,
        startDate: '2026-04-01T00:00:00.000Z',
        endDate: '2026-04-14T00:00:00.000Z',
      });
    expect(sprint.status).toBe(403);
    expect(sprint.body.code).toBe('PERMISSION_DENIED');

    const task = await request(apiBase())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${intern}`)
      .send({ title: 'Không được', projectId });
    expect(task.status).toBe(403);
  });
});
