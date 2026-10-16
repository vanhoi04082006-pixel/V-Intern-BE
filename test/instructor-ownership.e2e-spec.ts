import { createDatabaseSql } from '../src/database/create-database-sql';
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
import { CreateRecruitmentAiCoreTables1760131200000 } from '../src/database/migrations/1760131200000-CreateRecruitmentAiCoreTables';
import { AddRecruitmentReviewProvenance1760390400000 } from '../src/database/migrations/1760390400000-AddRecruitmentReviewProvenance';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { ensureRecruitedProfile, userIdByEmail } from './recruitment-fixtures';

/**
 * Instructor ownership e2e (redesign §5/§38/§39).
 *
 * - Reads/writes on sessions/projects/sprints/tasks/assignments/members
 *   are scoped to the authenticated instructor's own scope; cross-instructor
 *   access is 403, admin bypasses.
 * - Business rules stay authoritative: passed-only assignment,
 *   1-active-project (409), completed → reassignable.
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

beforeAll(async () => {
  if (!DB_NAME) {
    throw new Error(
      '[E2E BLOCKED] E2E_DB_NAME is not set. Point it at a DISPOSABLE database.',
    );
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
    migrations: [InitPlatformCore1759872000000, CreateAcademicCoreTables1759958400000, CreateSprintTaskCoreTables1760044800000, CreateRecruitmentAiCoreTables1760131200000, AddRecruitmentReviewProvenance1760390400000],
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
  const adminRole = await roles.findOneOrFail({ where: { code: 'admin' } });
  const instructorRole = await roles.findOneOrFail({ where: { code: 'instructor' } });
  const internRole = await roles.findOneOrFail({ where: { code: 'intern' } });
  const specs = [
    { email: `e2e-own-admin-${RUN}@vintern.test`, username: `e2e-own-admin-${RUN}`, roleId: adminRole.id },
    { email: `e2e-own-a-${RUN}@vintern.test`, username: `e2e-own-a-${RUN}`, roleId: instructorRole.id },
    { email: `e2e-own-b-${RUN}@vintern.test`, username: `e2e-own-b-${RUN}`, roleId: instructorRole.id },
    { email: `e2e-own-i1-${RUN}@vintern.test`, username: `e2e-own-i1-${RUN}`, roleId: internRole.id },
    { email: `e2e-own-i2-${RUN}@vintern.test`, username: `e2e-own-i2-${RUN}`, roleId: internRole.id },
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
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-own-i1-${RUN}@vintern.test`));
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-own-i2-${RUN}@vintern.test`));
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

describe('Instructor ownership — sessions/projects/sprints/tasks/assignments', () => {
  let admin: string;
  let instructorA: string;
  let instructorB: string;
  let sessionA: string;
  let projectA: string;

  beforeAll(async () => {
    admin = await login(`e2e-own-admin-${RUN}@vintern.test`);
    instructorA = await login(`e2e-own-a-${RUN}@vintern.test`);
    instructorB = await login(`e2e-own-b-${RUN}@vintern.test`);
  });

  it('A creates a session and becomes its instructor; B sees neither list nor detail', async () => {
    const code = `E2E-OWN-SS-${RUN}`;
    const created = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${instructorA}`).send({
      code, name: 'Owned session', description: 'ownership fixture', startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(created.status).toBe(201);
    sessionA = created.body.id;
    const mine = await request(apiBase()).get('/api/v1/sessions').set('Authorization', `Bearer ${instructorA}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.some((s: { id: string }) => s.id === sessionA)).toBe(true);
    const foreign = await request(apiBase()).get('/api/v1/sessions').set('Authorization', `Bearer ${instructorB}`);
    expect(foreign.status).toBe(200);
    expect(foreign.body.data.some((s: { id: string }) => s.id === sessionA)).toBe(false);
    const detail = await request(apiBase()).get(`/api/v1/sessions/${sessionA}`).set('Authorization', `Bearer ${instructorB}`);
    expect(detail.status).toBe(403);
    const adminDetail = await request(apiBase()).get(`/api/v1/sessions/${sessionA}`).set('Authorization', `Bearer ${admin}`);
    expect(adminDetail.status).toBe(200);
  });

  it('A creates a project; B cannot read, patch, or list it, admin can', async () => {
    const code = `E2E-OWN-PJ-${RUN}`;
    const created = await request(apiBase()).post('/api/v1/projects').set('Authorization', `Bearer ${instructorA}`).send({
      code, name: 'Owned project', description: 'ownership fixture with a real description',
    });
    expect(created.status).toBe(201);
    projectA = created.body.id;
    const activated = await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${instructorA}`).send({ status: 'active' });
    expect(activated.status).toBe(200);
    const foreignList = await request(apiBase()).get('/api/v1/projects').set('Authorization', `Bearer ${instructorB}`);
    expect(foreignList.body.data.some((p: { id: string }) => p.id === projectA)).toBe(false);
    expect((await request(apiBase()).get(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${instructorB}`)).status).toBe(403);
    expect((await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${instructorB}`).send({ description: 'hijack' })).status).toBe(403);
    expect((await request(apiBase()).get(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${admin}`)).status).toBe(200);
  });

  it('A assigns intern1; B sees no assignment, reads 403; second active assignment 409', async () => {
    const internId = await userIdByEmail(dataSource, `e2e-own-i1-${RUN}@vintern.test`);
    const assigned = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId, projectId: projectA, sessionId: sessionA,
    });
    expect(assigned.status).toBe(201);
    const mine = await request(apiBase()).get('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`);
    expect(mine.body.data.some((a: { id: string }) => a.id === assigned.body.id)).toBe(true);
    const foreign = await request(apiBase()).get('/api/v1/assignments').set('Authorization', `Bearer ${instructorB}`);
    expect(foreign.body.data.some((a: { id: string }) => a.id === assigned.body.id)).toBe(false);
    expect((await request(apiBase()).get(`/api/v1/assignments/${assigned.body.id}`).set('Authorization', `Bearer ${instructorB}`)).status).toBe(403);
    const dup = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId, projectId: projectA, sessionId: sessionA,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('ASSIGNMENT_CONFLICT');
  });

  it('failed intern cannot be assigned; recruiter rule stays authoritative', async () => {
    const users = dataSource.getRepository(User);
    const internRole = await dataSource.getRepository(Role).findOneOrFail({ where: { code: 'intern' } });
    const email = `e2e-own-fail-${RUN}@vintern.test`;
    const created = await users.save(users.create({
      email, username: `e2e-own-fail-${RUN}`, displayName: 'fail', passwordHash: await hash('E2e-Password-1', 10), status: 'active',
    }));
    await dataSource.getRepository(UserRole).insert({ userId: created.id, roleId: internRole.id });
    const res = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId: created.id, projectId: projectA, sessionId: sessionA,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INTERN_NOT_RECRUITED');
  });

  it('completed assignment frees the intern for a new project', async () => {
    const internId = await userIdByEmail(dataSource, `e2e-own-i2-${RUN}@vintern.test`);
    const first = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId, projectId: projectA, sessionId: sessionA,
    });
    expect(first.status).toBe(201);
    const done = await request(apiBase()).post(`/api/v1/assignments/${first.body.id}/complete`).set('Authorization', `Bearer ${instructorA}`);
    expect(done.status).toBe(201);
    const second = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId, projectId: projectA, sessionId: sessionA,
    });
    expect(second.status).toBe(201);
  });

  it('sprint and task under A are invisible to B, including the board', async () => {
    const sprint = await request(apiBase()).post('/api/v1/sprints').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-OWN-SP-${RUN}`, name: 'Owned sprint', projectId: projectA, sessionId: sessionA,
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-30T00:00:00.000Z',
    });
    expect(sprint.status).toBe(201);
    const activated = await request(apiBase()).post(`/api/v1/sprints/${sprint.body.id}/status`).set('Authorization', `Bearer ${instructorA}`).send({ status: 'active' });
    expect(activated.status).toBe(201);
    expect((await request(apiBase()).get(`/api/v1/sprints/${sprint.body.id}/board`).set('Authorization', `Bearer ${instructorB}`)).status).toBe(403);
    expect((await request(apiBase()).post(`/api/v1/sprints/${sprint.body.id}/status`).set('Authorization', `Bearer ${instructorB}`).send({ status: 'cancelled' })).status).toBe(403);
    const internId = await userIdByEmail(dataSource, `e2e-own-i2-${RUN}@vintern.test`);
    const task = await request(apiBase()).post('/api/v1/tasks').set('Authorization', `Bearer ${instructorA}`).send({
      title: 'Owned task', description: 'ownership fixture task', projectId: projectA, sprintId: sprint.body.id, assigneeId: internId,
    });
    expect(task.status).toBe(201);
    const taskListB = await request(apiBase()).get('/api/v1/tasks').set('Authorization', `Bearer ${instructorB}`);
    expect(taskListB.body.data.some((t: { id: string }) => t.id === task.body.id)).toBe(false);
    expect((await request(apiBase()).get(`/api/v1/tasks/${task.body.id}`).set('Authorization', `Bearer ${instructorB}`)).status).toBe(403);
  });

  it('candidate pool stays readable for hiring; admin sees the session', async () => {
    const pool = await request(apiBase()).get('/api/v1/recruitment/candidates').set('Authorization', `Bearer ${instructorB}`);
    expect(pool.status).toBe(200);
    const internId = await userIdByEmail(dataSource, `e2e-own-i1-${RUN}@vintern.test`);
    expect(pool.body.items.some((candidate: { userId: string }) => candidate.userId.toLowerCase() === internId.toLowerCase())).toBe(false);
    const searched = await request(apiBase()).get(`/api/v1/recruitment/candidates?search=e2e-own-i1-${RUN}`).set('Authorization', `Bearer ${instructorB}`);
    expect(searched.body.total).toBe(0);
    await request(apiBase()).get(`/api/v1/recruitment/candidates/${internId}`).set('Authorization', `Bearer ${instructorB}`).expect(403);
    await request(apiBase()).get(`/api/v1/recruitment/candidates/${internId}`).set('Authorization', `Bearer ${instructorA}`).expect(200);
    await request(apiBase()).get(`/api/v1/recruitment/candidates/${internId}`).set('Authorization', `Bearer ${admin}`).expect(200);
  });
});
