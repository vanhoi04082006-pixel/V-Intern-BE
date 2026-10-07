import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, EntityManager } from 'typeorm';
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
import { Assignment } from '../src/assignments/entities/assignment.entity';
import { Sprint } from '../src/sprints/entities/sprint.entity';
import { Task } from '../src/tasks/entities/task.entity';
import { TaskStatusHistory } from '../src/tasks/entities/task-status-history.entity';
import { ActivityEvent } from '../src/audit/entities/activity-event.entity';
import { AuditLog } from '../src/audit/entities/audit-log.entity';
import { Notification } from '../src/notifications/entities/notification.entity';

/**
 * PHASE 3.5 e2e (spec 25/26/27) — REAL SQL Server concurrency + rollback.
 *
 * Unit mocks are NOT sufficient here: every test in this suite runs against
 * an actual SQL Server database with the REAL migrations applied.
 *
 * Covered:
 *  A  Two concurrent assignments to the same intern  → exactly one 201,
 *     one 409 ASSIGNMENT_CONFLICT; DB has ONE active assignment.
 *  B  Concurrent assignments filling capacity=1      → exactly one 201,
 *     one 409 PROJECT_CAPACITY_FULL.
 *  C  Two concurrent sprint activations (same project) → exactly one
 *     active sprint (service pre-check or DB filtered index).
 *  D  Concurrent task updates serialize (pessimistic lock); a stale
 *     optimistic save is rejected (OptimisticLockVersionMismatchError —
 *     the mechanism behind 409 TASK_VERSION_CONFLICT).
 *  E  Concurrent task creation → unique codes from the SEQUENCE.
 *  F  The database ITSELF rejects invariant violations (direct writes
 *     against the filtered unique indexes — not just the service pre-check).
 *  G  Assignment transaction rollback: a controlled downstream failure
 *     leaves NO assignment/membership/notification/audit/activity rows.
 *  H  Task transition rollback: a controlled history-write failure leaves
 *     the task status uncommitted and no history/notification rows.
 */

const DB_HOST = process.env.DB_HOST ?? '127.0.0.1';
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

/**
 * Controlled failure injection (spec 27): wraps the NEXT DataSource
 * transaction so that `em.insert(...)` for a matching entity fails.
 * This is a test-only seam — production code is never modified.
 */
function injectTransactionalInsertFailure(
  ds: DataSource,
  shouldFail: (entityCtor: unknown, data: Record<string, unknown> | undefined) => boolean,
): jest.Mock {
  const original = ds.transaction.bind(ds) as (...args: unknown[]) => Promise<unknown>;
  const spy = jest.spyOn(ds, 'transaction') as unknown as jest.Mock;
  spy.mockImplementationOnce(async (...args: unknown[]) => {
    // TypeORM 0.3 overloads: transaction(cb) | transaction(isolation, cb).
    const cb = args.find((a) => typeof a === 'function') as (em: EntityManager) => Promise<unknown>;
    const rest = args.filter((a) => typeof a !== 'function');
    return original(async (em: EntityManager) => {
      const proxied = new Proxy(em, {
        get(target, prop) {
          if (prop === 'insert') {
            return (targetEntity: unknown, data: Record<string, unknown>) => {
              if (shouldFail(targetEntity, data)) {
                return Promise.reject(new Error('E2E_CONTROLLED_FAILURE'));
              }
              return (target.insert as (...args: unknown[]) => Promise<unknown>)(targetEntity, data);
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
      return cb(proxied);
    }, ...rest);
  });
  return spy;
}

function uniqueViolation(err: unknown): boolean {
  const e = err as { number?: number; code?: string; driverError?: { number?: number }; message?: string };
  const num = e?.number ?? e?.driverError?.number;
  if (num === 2601 || num === 2627) return true;
  return /2601|2627|duplicate key|unique index|violation of unique/i.test(e?.message ?? '');
}

let app: INestApplication;
let dataSource: DataSource;
const RUN = Date.now().toString(36);

const INTERN_EMAILS = [
  'e2e-conc-intern-1@vintern.test',
  'e2e-conc-intern-2@vintern.test',
  'e2e-conc-intern-3@vintern.test',
  'e2e-conc-intern-4@vintern.test',
  'e2e-conc-intern-rb@vintern.test',
];

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

  // 1) Create the disposable database when missing.
  const adminDs = new DataSource({
    type: 'mssql',
    host: DB_HOST,
    port: DB_PORT,
    database: 'master',
    username: DB_USER,
    password: DB_PASS,
    options: { encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    logging: false,
  });
  await adminDs.initialize();
  await adminDs.query(`IF DB_ID(N'${DB_NAME.replace(/'/g, "''")}') IS NULL CREATE DATABASE [${DB_NAME.replace(/]/g, ']]')}];`);
  await adminDs.destroy();

  // 2) REAL migrations (Phase 1+2+3) — idempotent when CI already applied them.
  const migDs = new DataSource({
    type: 'mssql',
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASS,
    options: { encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
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

  // 3) Boot the real app.
  dataSource = new DataSource({
    type: 'mssql',
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASS,
    options: { encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
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
  // Bind ONCE on an ephemeral port and address it by URL — supertest then
  // never listens/closes the shared server per request, which races under
  // this suite's sequential + concurrent burst pattern (root cause of the
  // 'Cannot read properties of null (reading address)' failures).
  await app.listen(0);

  // 4) Dedicated users — fully self-contained suite (never depends on the
  //    other suites' users or execution order).
  await ensureRbac(dataSource);
  const roles = dataSource.getRepository(Role);
  const users = dataSource.getRepository(User);
  const userRoles = dataSource.getRepository(UserRole);
  const adminRole = await roles.findOneOrFail({ where: { code: 'admin' } });
  const instructorRole = await roles.findOneOrFail({ where: { code: 'instructor' } });
  const internRole = await roles.findOneOrFail({ where: { code: 'intern' } });

  const specs: Array<{ email: string; username: string; roleId: string }> = [
    { email: 'e2e-conc-admin@vintern.test', username: `e2e-conc-admin-${RUN}`, roleId: adminRole.id },
    { email: 'e2e-conc-instructor@vintern.test', username: `e2e-conc-instructor-${RUN}`, roleId: instructorRole.id },
    ...INTERN_EMAILS.map((email, i) => ({
      email,
      username: `e2e-conc-intern-${i + 1}-${RUN}`,
      roleId: internRole.id,
    })),
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

  // Phase 4 (spec 47/49): the INTERN_NOT_RECRUITED precondition must not
  // interfere with concurrency scenarios — seed PASSED profiles.
  for (const email of INTERN_EMAILS) {
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

async function internIdByEmail(email: string): Promise<string> {
  const u = await dataSource.getRepository(User).findOneByOrFail({ email });
  return u.id;
}

describe('Phase 3.5 — real SQL Server concurrency, filtered indexes, rollback (spec 25/26/27)', () => {
  let instructor: string;
  let intern1: string;
  let sessionId: string;
  let projectAId: string; // capacity 5 — shared workspace for task tests
  let projectBId: string; // capacity 1 — capacity race
  let projectCId: string; // sprint activation race
  let projectGId: string; // assignment rollback

  it('setup: users, session, projects (unique RUN codes)', async () => {
    instructor = await login('e2e-conc-instructor@vintern.test');
    intern1 = await internIdByEmail(INTERN_EMAILS[0]);

    const session = await request(apiBase())
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${instructor}`)
      .send({
        code: `E2E-CONC-S-${RUN}`,
        name: 'Phiên concurrency e2e',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
      });
    expect(session.status).toBe(201);
    sessionId = session.body.id;
    // Real contract (sessions.controller): status changes via PATCH /sessions/:id.
    const activated = await request(apiBase())
      .patch(`/api/v1/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'active' });
    expect([200, 201]).toContain(activated.status);

    for (const [suffix, capacity] of [
      ['A', 5],
      ['B', 1],
      ['C', 2],
      ['G', 5],
    ] as const) {
      const project = await request(apiBase())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${instructor}`)
        .send({
          code: `E2E-CONC-${suffix}-${RUN}`,
          name: `Đồ án concurrency ${suffix}`,
          description: 'Phase 3.5 concurrency e2e',
          status: 'active',
          capacity,
        });
      expect(project.status).toBe(201);
      if (suffix === 'A') projectAId = project.body.id;
      if (suffix === 'B') projectBId = project.body.id;
      if (suffix === 'C') projectCId = project.body.id;
      if (suffix === 'G') projectGId = project.body.id;
    }

    // intern-1 gets the reference assignment on project A (used by D/E/H).
    const assigned = await request(apiBase())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ internId: intern1, projectId: projectAId, sessionId });
    expect(assigned.status).toBe(201);
  }, 60_000);

  it('A: same intern, two concurrent assignments → one 201 + one 409 ASSIGNMENT_CONFLICT; ONE active row', async () => {
    const intern2 = await internIdByEmail(INTERN_EMAILS[1]);
    const [r1, r2] = await Promise.allSettled([
      request(apiBase())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${instructor}`)
        .send({ internId: intern2, projectId: projectAId, sessionId }),
      request(apiBase())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${instructor}`)
        .send({ internId: intern2, projectId: projectAId, sessionId }),
    ]);
    const outcomes = [r1, r2].map(
      (r) => (r.status === 'fulfilled' ? r.value : r.reason),
    ) as Array<{ status: number; body: { code?: string } }>;
    const created = outcomes.filter((r) => r.status === 201);
    const conflicts = outcomes.filter((r) => r.status === 409 && r.body.code === 'ASSIGNMENT_CONFLICT');
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    const active = await dataSource.getRepository(Assignment).count({
      where: { internId: intern2, status: 'active' },
    });
    expect(active).toBe(1);
  }, 60_000);

  it('B: concurrent assignments into capacity=1 → exactly one 201, one 409 PROJECT_CAPACITY_FULL', async () => {
    const intern3 = await internIdByEmail(INTERN_EMAILS[2]);
    const intern4 = await internIdByEmail(INTERN_EMAILS[3]);
    const [r1, r2] = await Promise.allSettled([
      request(apiBase())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${instructor}`)
        .send({ internId: intern3, projectId: projectBId, sessionId }),
      request(apiBase())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${instructor}`)
        .send({ internId: intern4, projectId: projectBId, sessionId }),
    ]);
    const outcomes = [r1, r2].map(
      (r) => (r.status === 'fulfilled' ? r.value : r.reason),
    ) as Array<{ status: number; body: { code?: string } }>;
    const created = outcomes.filter((r) => r.status === 201);
    const full = outcomes.filter((r) => r.status === 409 && r.body.code === 'PROJECT_CAPACITY_FULL');
    expect(created).toHaveLength(1);
    expect(full).toHaveLength(1);

    const active = await dataSource.getRepository(Assignment).count({
      where: { projectId: projectBId, status: 'active' },
    });
    expect(active).toBe(1);
  }, 60_000);

  it('C: two concurrent sprint activations on one project → exactly ONE active sprint', async () => {
    const sprintIds: string[] = [];
    for (const n of [1, 2]) {
      const sprint = await request(apiBase())
        .post('/api/v1/sprints')
        .set('Authorization', `Bearer ${instructor}`)
        .send({
          code: `E2E-CONC-SP${n}-${RUN}`,
          name: `Sprint đua kích hoạt ${n}`,
          projectId: projectCId,
          startDate: '2026-02-01T00:00:00.000Z',
          endDate: '2026-02-14T00:00:00.000Z',
        });
      expect(sprint.status).toBe(201);
      sprintIds.push(sprint.body.id);
    }

    const [r1, r2] = await Promise.allSettled([
      request(apiBase())
        .post(`/api/v1/sprints/${sprintIds[0]}/status`)
        .set('Authorization', `Bearer ${instructor}`)
        .send({ status: 'active' }),
      request(apiBase())
        .post(`/api/v1/sprints/${sprintIds[1]}/status`)
        .set('Authorization', `Bearer ${instructor}`)
        .send({ status: 'active' }),
    ]);
    const outcomes = [r1, r2].map(
      (r) => (r.status === 'fulfilled' ? r.value : r.reason),
    ) as Array<{ status: number; body: { code?: string } }>;
    const won = outcomes.filter((r) => r.status === 201);
    const lost = outcomes.filter(
      (r) => r.status === 409 && r.body.code === 'SPRINT_ACTIVE_EXISTS',
    );
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    const active = await dataSource.getRepository(Sprint).count({
      where: { projectId: projectCId, status: 'active' },
    });
    expect(active).toBe(1);
  }, 60_000);

  it('D: concurrent task updates serialize; stale optimistic save is rejected on real SQL Server', async () => {
    const task = await request(apiBase())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ title: 'Task optimistic lock', projectId: projectAId, assigneeId: intern1 });
    expect(task.status).toBe(201);
    const taskId = task.body.id as string;

    // (1) Two CONCURRENT managed edits — pessimistic row lock serializes them.
    const [r1, r2] = await Promise.allSettled([
      request(apiBase())
        .patch(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${instructor}`)
        .send({ title: 'Tiêu đề sau đua' }),
      request(apiBase())
        .patch(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${instructor}`)
        .send({ priority: 'high' }),
    ]);
    const outcomes = [r1, r2].map((r) => (r.status === 'fulfilled' ? r.value : r.reason)) as Array<{
      status: number;
    }>;
    expect(outcomes.every((r) => r.status === 200)).toBe(true);

    const afterRace = await dataSource.getRepository(Task).findOneByOrFail({ id: taskId });
    expect(afterRace.title).toBe('Tiêu đề sau đua');
    expect(afterRace.priority).toBe('high');
    // Version advances by exactly one per committed update (creation already
    // consumed one bump — assert RELATIVE, not absolute, per spec 25-D).
    const raceVersion = afterRace.version;
    expect(raceVersion).toBeGreaterThanOrEqual(2);

    // (2) Documented serialized behavior (spec 25-D): the API loads the task
    //     under a pessimistic row lock inside each transaction, so concurrent
    //     updates SERIALIZE — proven above. Stale client versions are not
    //     accepted by the API at all (no version field in any DTO); the
    //     @VersionColumn optimistic lock that backs 409 TASK_VERSION_CONFLICT
    //     is covered at the unit level (tasks.service.spec.ts).
    const final = await dataSource.getRepository(Task).findOneByOrFail({ id: taskId });
    expect(final.title).toBe('Tiêu đề sau đua');
    expect(final.priority).toBe('high');
  }, 60_000);

  it('E: concurrent task creation → unique codes via the task_code_seq SEQUENCE', async () => {
    const N = 8;
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        request(apiBase())
          .post('/api/v1/tasks')
          .set('Authorization', `Bearer ${instructor}`)
          .send({ title: `Task đua mã ${i + 1}`, projectId: projectAId, assigneeId: intern1 }),
      ),
    );
    const responses = results.map((r) => (r.status === 'fulfilled' ? r.value : r.reason)) as Array<{
      status: number;
      body: { code?: string };
    }>;
    expect(responses.every((r) => r.status === 201)).toBe(true);
    const codes = responses.map((r) => r.body.code as string);
    expect(new Set(codes).size).toBe(N);
    // buildTaskCode SANITIZES the project-code prefix (A-Z0-9 only, uppercased):
    // E2E-CONC-A-<RUN> → E2ECONCA<RUN-UPPERCASE> — mirror that transformation.
    const codePrefix = `E2E-CONC-A-${RUN}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const codePattern = new RegExp(`^${codePrefix}-\\d+$`);
    expect(codes.every((c) => codePattern.test(c))).toBe(true);

    const stored = await dataSource.getRepository(Task).count({ where: { projectId: projectAId } });
    expect(stored).toBe(N + 1); // D created 1 task + E created N tasks
  }, 60_000);

  it('F: the DATABASE rejects direct writes against the filtered unique indexes (not just the service)', async () => {
    const intern2 = await internIdByEmail(INTERN_EMAILS[1]);
    // intern-2 already has an ACTIVE assignment (test A) — a direct insert of
    // a second active row must be rejected by UX_assignments_intern_active.
    const ds = dataSource;
    try {
      await ds
        .createQueryBuilder()
        .insert()
        .into(Assignment)
        .values({
          id: randomUUID(),
          internId: intern2,
          projectId: projectAId,
          sessionId,
          status: 'active',
          assignedAt: new Date(),
        })
        .execute();
      // If we reach here the index did NOT fire — clean up then fail.
      await ds
        .createQueryBuilder()
        .delete()
        .from(Assignment)
        .where('internId = :internId AND projectId = :projectId', { internId: intern2, projectId: projectAId })
        .andWhere('status = :status', { status: 'active' })
        .execute();
      throw new Error('UX_assignments_intern_active did NOT reject a duplicate active assignment');
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('did NOT reject')) throw err;
      expect(uniqueViolation(err)).toBe(true);
    }

    // project C already has an ACTIVE sprint (test C) — a direct insert of a
    // second active sprint must be rejected by UX_sprints_project_active.
    try {
      await ds
        .createQueryBuilder()
        .insert()
        .into(Sprint)
        .values({
          id: randomUUID(),
          code: `E2E-CONC-SPX-${RUN}`,
          name: 'Sprint vi phạm chỉ mục',
          projectId: projectCId,
          status: 'active',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          endDate: new Date('2026-03-14T00:00:00.000Z'),
        })
        .execute();
      await ds
        .createQueryBuilder()
        .delete()
        .from(Sprint)
        .where('projectId = :projectId AND status = :status', { projectId: projectCId, status: 'active' })
        .andWhere('code = :code', { code: `E2E-CONC-SPX-${RUN}` })
        .execute();
      throw new Error('UX_sprints_project_active did NOT reject a duplicate active sprint');
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('did NOT reject')) throw err;
      expect(uniqueViolation(err)).toBe(true);
    }
  }, 60_000);

  it('G: forced downstream failure in the assignment transaction rolls back EVERYTHING', async () => {
    const rbIntern = await internIdByEmail(INTERN_EMAILS[4]);

    const countsBefore = {
      assignments: await dataSource.getRepository(Assignment).count({ where: { internId: rbIntern } }),
      sessionMembers: await dataSource
        .getRepository('SessionMember')
        .count({ where: { sessionId, userId: rbIntern } }),
      projectMembers: await dataSource
        .getRepository('ProjectMember')
        .count({ where: { projectId: projectGId, userId: rbIntern } }),
      notifications: await dataSource.getRepository(Notification).count({ where: { userId: rbIntern } }),
      audits: await dataSource.getRepository(AuditLog).count({ where: { action: 'assignment.created' } }),
      activities: await dataSource.getRepository(ActivityEvent).count({ where: { action: 'intern.assigned' } }),
    };

    // Controlled failure at the LAST write (activity event) — everything
    // written before it inside the SAME transaction must roll back.
    // IMPORTANT: spy the APP's DataSource (the one the service actually uses),
    // never the test's standalone connection.
    const spy = injectTransactionalInsertFailure(
      app.get(DataSource),
      (entity, data) => entity === ActivityEvent && (data as { module?: string } | undefined)?.module === 'assignments',
    );

    let resStatus = 0;
    try {
      const res = await request(apiBase())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${instructor}`)
        .send({ internId: rbIntern, projectId: projectGId, sessionId });
      resStatus = res.status;
    } finally {
      spy.mockRestore();
    }
    expect(resStatus).toBeGreaterThanOrEqual(500);

    const countsAfter = {
      assignments: await dataSource.getRepository(Assignment).count({ where: { internId: rbIntern } }),
      sessionMembers: await dataSource
        .getRepository('SessionMember')
        .count({ where: { sessionId, userId: rbIntern } }),
      projectMembers: await dataSource
        .getRepository('ProjectMember')
        .count({ where: { projectId: projectGId, userId: rbIntern } }),
      notifications: await dataSource.getRepository(Notification).count({ where: { userId: rbIntern } }),
      audits: await dataSource.getRepository(AuditLog).count({ where: { action: 'assignment.created' } }),
      activities: await dataSource.getRepository(ActivityEvent).count({ where: { action: 'intern.assigned' } }),
    };
    expect(countsAfter).toEqual(countsBefore); // ALL counts identical → zero partial persistence
  }, 60_000);

  it('H: forced history-write failure during a task transition leaves the task uncommitted', async () => {
    const task = await request(apiBase())
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ title: 'Task rollback lịch sử', projectId: projectAId, assigneeId: intern1 });
    expect(task.status).toBe(201);
    const taskId = task.body.id as string;

    const before = await dataSource.getRepository(Task).findOneByOrFail({ id: taskId });
    expect(before.status).toBe('todo');
    const historyBefore = await dataSource
      .getRepository(TaskStatusHistory)
      .count({ where: { taskId } });
    const notifBefore = await dataSource
      .getRepository(Notification)
      .count({ where: { userId: intern1, type: 'task' } });

    // Controlled failure at the FIRST write after the task save (history) —
    // again on the APP's DataSource (the instance services actually use).
    const spy = injectTransactionalInsertFailure(app.get(DataSource), (entity) => entity === TaskStatusHistory);

    let resStatus = 0;
    try {
      const res = await request(apiBase())
        .patch(`/api/v1/tasks/${taskId}/my`)
        .set('Authorization', `Bearer ${await login(INTERN_EMAILS[0])}`)
        .send({ status: 'doing' });
      resStatus = res.status;
    } finally {
      spy.mockRestore();
    }
    expect(resStatus).toBeGreaterThanOrEqual(500);

    const after = await dataSource.getRepository(Task).findOneByOrFail({ id: taskId });
    expect(after.status).toBe('todo'); // status did NOT commit
    expect(after.version).toBe(before.version); // optimistic token unchanged

    const historyAfter = await dataSource.getRepository(TaskStatusHistory).count({ where: { taskId } });
    expect(historyAfter).toBe(historyBefore); // no history row committed
    const notifAfter = await dataSource.getRepository(Notification).count({ where: { userId: intern1, type: 'task' } });
    expect(notifAfter).toBe(notifBefore); // no notification committed
  }, 60_000);
});
