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
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';

/**
 * PHASE 2 e2e — the Waiting → Active acceptance scenario (spec 30/43).
 *
 * SAFETY + HONESTY RULES:
 * - Refuses to run unless E2E_DB_NAME names a DISPOSABLE database.
 * - Without a reachable SQL Server this suite FAILS with [E2E BLOCKED] —
 *   integration status stays NOT VERIFIED; never a fake PASS.
 * - Applies REAL migrations (Phase 1 + Phase 2) to the disposable DB.
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
const RUN = Date.now().toString(36); // unique codes per run → rerunnable suite

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

  // 1) Create the disposable database.
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
  await adminDs.query(`IF DB_ID(N'${DB_NAME}') IS NULL CREATE DATABASE [${DB_NAME}];`);
  await adminDs.destroy();

  // 2) Apply REAL migrations (Phase 1 + Phase 2) — migrations are the only schema mechanism.
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
    migrations: [InitPlatformCore1759872000000, CreateAcademicCoreTables1759958400000],
    migrationsRun: false,
  });
  await migDs.initialize();
  await migDs.runMigrations();
  await migDs.destroy();

  // 3) Boot the app.
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
  await app.init();

  // 4) Idempotent RBAC + dedicated e2e users (admin / instructor / 2 interns).
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
    { email: 'e2e-intern@vintern.test', username: 'e2e-intern', roleId: internRole.id },
    { email: 'e2e-intern-2@vintern.test', username: 'e2e-intern-2', roleId: internRole.id },
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
}, 120_000);

afterAll(async () => {
  await app?.close();
  await dataSource?.destroy();
});

async function login(email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'E2e-Password-1' });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

describe('Phase 2 academic core e2e — Waiting → Active (spec 30)', () => {
  let admin: string;
  let instructor: string;
  let intern: string;
  let sessionId: string;
  let projectId: string;
  let assignmentId: string;

  it('intern workspace starts UNASSIGNED (step 3-4: no source change)', async () => {
    admin = await login('e2e-admin@vintern.test');
    instructor = await login('e2e-instructor@vintern.test');
    intern = await login('e2e-intern@vintern.test');
    await login('e2e-intern-2@vintern.test'); // second intern account must be loginable

    const res = await request(app.getHttpServer())
      .get('/api/v1/intern/me/workspace')
      .set('Authorization', `Bearer ${intern}`);
    expect(res.status).toBe(200);
    // Phase 3 extended the workspace contract with REAL sprint/task data
    // (documented in the Phase 3 contract docs) — the unassigned shape is:
    expect(res.body).toEqual({
      status: 'unassigned',
      assignment: null,
      currentSprint: null,
      taskSummary: { todo: 0, doing: 0, review: 0, done: 0, total: 0 },
      focusedTask: null,
    });
  });

  it('instructor creates a session (upcoming) → activates it', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${instructor}`)
      .send({
        code: `E2E-S-${RUN}`,
        name: 'Phiên e2e',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('upcoming');
    sessionId = created.body.id;

    // Illegal transition first: upcoming → completed must 409 (spec 43).
    const illegal = await request(app.getHttpServer())
      .patch(`/api/v1/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'completed' });
    expect(illegal.status).toBe(409);
    expect(illegal.body.code).toBe('INVALID_SESSION_TRANSITION');

    const activated = await request(app.getHttpServer())
      .patch(`/api/v1/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${instructor}`)
      .send({ status: 'active' });
    expect(activated.status).toBe(200);
    expect(activated.body.status).toBe('active');
  });

  it('instructor creates an ACTIVE project with capacity 1', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${instructor}`)
      .send({
        code: `E2E-P-${RUN}`,
        name: 'Đồ án e2e',
        description: 'Đồ án dùng cho kịch bản e2e.',
        status: 'active',
        capacity: 1,
        technologies: ['nestjs', 'sqlserver'],
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('active');
    expect(created.body.technologies).toEqual(['nestjs', 'sqlserver']);
    projectId = created.body.id;
  });

  it('assignment transaction commits → workspace becomes ACTIVE (steps 7-13)', async () => {
    const internRow = await dataSource.getRepository(User).findOneOrFail({ where: { email: 'e2e-intern@vintern.test' } });
    const created = await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ internId: internRow.id, projectId, sessionId });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('active');
    assignmentId = created.body.id;

    // Notification exists (type=assignment):
    const notif = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${intern}`);
    expect(notif.status).toBe(200);
    const assignmentNotification = (notif.body.data as Array<{ type: string }>).find((n) => n.type === 'assignment');
    expect(assignmentNotification).toBeTruthy();

    // Audit exists (assignment.created):
    const audit = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?action=assignment.created')
      .set('Authorization', `Bearer ${admin}`);
    expect(audit.status).toBe(200);
    expect((audit.body.data as unknown[]).length).toBeGreaterThan(0);

    // Activity exists (intern.assigned):
    const activity = await request(app.getHttpServer())
      .get('/api/v1/activity-events?module=assignments')
      .set('Authorization', `Bearer ${admin}`);
    expect(activity.status).toBe(200);
    expect((activity.body.data as Array<{ action: string }>).some((e) => e.action === 'intern.assigned')).toBe(true);

    // Workspace is now ACTIVE — DB-driven, no source change:
    const workspace = await request(app.getHttpServer())
      .get('/api/v1/intern/me/workspace')
      .set('Authorization', `Bearer ${intern}`);
    expect(workspace.status).toBe(200);
    expect(workspace.body.status).toBe('active');
    expect(workspace.body.assignment.id).toBe(assignmentId);
    expect(workspace.body.assignment.project.code).toBe(`E2E-P-${RUN}`);
    expect(workspace.body.assignment.session.code).toBe(`E2E-S-${RUN}`);
  });

  it('duplicate assignment → 409 ASSIGNMENT_CONFLICT (filtered unique index)', async () => {
    // The service checks project capacity BEFORE the intern-conflict
    // pre-check — on the capacity-1 project above a duplicate would be
    // reported as PROJECT_CAPACITY_FULL (also true). For a deterministic
    // ASSIGNMENT_CONFLICT, attempt the duplicate against a NON-full project:
    // the intern-level invariant (at most one ACTIVE assignment) fires.
    const other = await request(app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ code: `E2E-P2-${RUN}`, name: 'Đồ án phụ e2e', description: 'duplicate-scenario project', status: 'active', capacity: 2 });
    expect(other.status).toBe(201);

    const internRow = await dataSource.getRepository(User).findOneOrFail({ where: { email: 'e2e-intern@vintern.test' } });
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ internId: internRow.id, projectId: other.body.id, sessionId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ASSIGNMENT_CONFLICT');
  });

  it('project capacity full → 409 PROJECT_CAPACITY_FULL (second intern)', async () => {
    const intern2Row = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email: 'e2e-intern-2@vintern.test' } });
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructor}`)
      .send({ internId: intern2Row.id, projectId, sessionId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROJECT_CAPACITY_FULL');
  });

  it('RBAC negatives: intern cannot assign self, cannot manage sessions (spec 43)', async () => {
    const internRow = await dataSource.getRepository(User).findOneOrFail({ where: { email: 'e2e-intern@vintern.test' } });
    const selfAssign = await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${intern}`)
      .send({ internId: internRow.id, projectId, sessionId });
    expect(selfAssign.status).toBe(403);
    expect(selfAssign.body.code).toBe('PERMISSION_DENIED');

    const manageSession = await request(app.getHttpServer())
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${intern}`)
      .send({
        code: `E2E-FORBIDDEN-${RUN}`,
        name: 'Không được phép',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-06-30T00:00:00.000Z',
      });
    expect(manageSession.status).toBe(403);
    expect(manageSession.body.code).toBe('PERMISSION_DENIED');
  });

  it('complete assignment → history preserved; workspace returns to unassigned', async () => {
    const completed = await request(app.getHttpServer())
      .post(`/api/v1/assignments/${assignmentId}/complete`)
      .set('Authorization', `Bearer ${instructor}`);
    // NestJS POST lifecycle endpoint → 201 Created (accepted 200 too).
    expect([200, 201]).toContain(completed.status);
    expect(completed.body.status).toBe('completed');
    expect(completed.body.completedAt).toBeTruthy();

    const workspace = await request(app.getHttpServer())
      .get('/api/v1/intern/me/workspace')
      .set('Authorization', `Bearer ${intern}`);
    expect(workspace.status).toBe(200);
    // Documented Phase 2 contract: workspace reflects ACTIVE assignment state;
    // a completed assignment returns the intern to unassigned (available again).
    expect(workspace.body.status).toBe('unassigned');

    // Double completion is an illegal transition → 409:
    const again = await request(app.getHttpServer())
      .post(`/api/v1/assignments/${assignmentId}/complete`)
      .set('Authorization', `Bearer ${instructor}`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_ASSIGNMENT_TRANSITION');
  });
});
