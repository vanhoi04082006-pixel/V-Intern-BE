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
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { RecruitmentProfile } from '../src/recruitment/entities/recruitment-profile.entity';
import { ensureRecruitedProfile, userIdByEmail } from './recruitment-fixtures';

/**
 * M4 eligible candidates + assignment lifecycle (WP-4): server-side search/
 * filter/pagination, cancel flow restoring availability, concurrent
 * double-assign safety, ineligible visibility.
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
  const internRole = await roles.findOneOrFail({ where: { code: 'intern' } });
  const mk = async (tag: string, roleId: string, displayName: string) => {
    const email = `e2e-m4-${tag}-${RUN}@vintern.test`;
    const created = await users.save(
      users.create({
        email, username: `e2e-m4-${tag}-${RUN}`, displayName,
        passwordHash: await hash(PW, 10), status: 'active',
      }),
    );
    await userRoles.insert({ userId: created.id, roleId });
    return email;
  };
  await mk('a', instructorRole.id, 'M4 Instructor A');
  await mk('b', instructorRole.id, 'M4 Instructor B');
  await mk('i1', internRole.id, 'M4 Frontend Star');
  await mk('i2', internRole.id, 'M4 Backend Pro');
  await mk('i3', internRole.id, 'M4 Failed Candidate');
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-m4-i1-${RUN}@vintern.test`));
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-m4-i2-${RUN}@vintern.test`));
  // Failed profile for i3 (visible but ineligible).
  const profiles = dataSource.getRepository(RecruitmentProfile);
  await profiles.save(
    profiles.create({
      userId: await userIdByEmail(dataSource, `e2e-m4-i3-${RUN}@vintern.test`),
      selectedRole: 'frontend', status: 'failed', attemptCount: 1,
    }),
  );
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

describe('M4 eligible candidates and assignment lifecycle', () => {
  let instructorA: string;
  let instructorB: string;
  let internTok: string;
  let sessionA: string;
  let projectA: string;

  beforeAll(async () => {
    instructorA = await login(`e2e-m4-a-${RUN}@vintern.test`);
    instructorB = await login(`e2e-m4-b-${RUN}@vintern.test`);
    internTok = await login(`e2e-m4-i1-${RUN}@vintern.test`);
    const session = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-M4-SS-${RUN}`, name: 'M4 session', description: 'm4 fixture',
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(session.status).toBe(201);
    sessionA = session.body.id;
    const project = await request(apiBase()).post('/api/v1/projects').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-M4-PJ-${RUN}`, name: 'M4 project', description: 'm4 fixture with a real description',
    });
    expect(project.status).toBe(201);
    projectA = project.body.id;
    const activated = await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${instructorA}`).send({ status: 'active' });
    expect(activated.status).toBe(200);
  }, 120_000);

  it('searches by name/email/role/status with correct totals and stable paging', async () => {
    const byName = await request(apiBase()).get('/api/v1/recruitment/candidates?search=M4%20Frontend&page=1&pageSize=20').set('Authorization', `Bearer ${instructorA}`);
    expect(byName.status).toBe(200);
    expect(byName.body.total).toBe(1);
    expect(byName.body.items[0].email).toBe(`e2e-m4-i1-${RUN}@vintern.test`);
    expect(byName.body.items[0].status).toBe('passed');

    const byEmail = await request(apiBase()).get(`/api/v1/recruitment/candidates?search=e2e-m4-i2-${RUN}&page=1&pageSize=20`).set('Authorization', `Bearer ${instructorA}`);
    expect(byEmail.body.total).toBe(1);

    const byRole = await request(apiBase()).get('/api/v1/recruitment/candidates?role=frontend&page=1&pageSize=20').set('Authorization', `Bearer ${instructorA}`);
    expect(byRole.body.total).toBeGreaterThanOrEqual(2);

    const failed = await request(apiBase()).get('/api/v1/recruitment/candidates?status=failed&page=1&pageSize=20').set('Authorization', `Bearer ${instructorA}`);
    expect(failed.body.items.some((c: { email: string }) => c.email === `e2e-m4-i3-${RUN}@vintern.test`)).toBe(true);

    const p1 = await request(apiBase()).get('/api/v1/recruitment/candidates?page=1&pageSize=2').set('Authorization', `Bearer ${instructorA}`);
    const p2 = await request(apiBase()).get('/api/v1/recruitment/candidates?page=2&pageSize=2').set('Authorization', `Bearer ${instructorA}`);
    const ids1 = new Set(p1.body.items.map((c: { userId: string }) => c.userId));
    expect(p2.body.items.every((c: { userId: string }) => !ids1.has(c.userId))).toBe(true);
    expect(p1.body.total).toBe(p2.body.total);
  });

  it('availability filter hides assigned and non-passed interns', async () => {
    const internId = await userIdByEmail(dataSource, `e2e-m4-i1-${RUN}@vintern.test`);
    const assigned = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId, projectId: projectA, sessionId: sessionA,
    });
    expect(assigned.status).toBe(201);

    const avail = await request(apiBase()).get('/api/v1/recruitment/candidates?eligibility=available&page=1&pageSize=50').set('Authorization', `Bearer ${instructorA}`);
    const emails = avail.body.items.map((c: { email: string }) => c.email);
    expect(emails).not.toContain(`e2e-m4-i1-${RUN}@vintern.test`);
    expect(emails).toContain(`e2e-m4-i2-${RUN}@vintern.test`);
    expect(emails).not.toContain(`e2e-m4-i3-${RUN}@vintern.test`);
    for (const c of avail.body.items) {
      expect(c.status).toBe('passed');
      expect(c.hasActiveAssignment).toBe(false);
    }

    // Cleanup: cancel so later tests start clean.
    const cancelled = await request(apiBase()).post(`/api/v1/assignments/${assigned.body.id}/cancel`).set('Authorization', `Bearer ${instructorA}`);
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe('cancelled');
  });

  it('cancel restores availability and rejects repeats and foreign actors', async () => {
    const internId = await userIdByEmail(dataSource, `e2e-m4-i1-${RUN}@vintern.test`);
    const assigned = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId, projectId: projectA, sessionId: sessionA,
    });
    expect(assigned.status).toBe(201);

    const foreign = await request(apiBase()).post(`/api/v1/assignments/${assigned.body.id}/cancel`).set('Authorization', `Bearer ${instructorB}`);
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('ASSIGNMENT_SCOPE_FORBIDDEN');

    const cancelled = await request(apiBase()).post(`/api/v1/assignments/${assigned.body.id}/cancel`).set('Authorization', `Bearer ${instructorA}`);
    expect(cancelled.status).toBe(201);

    const again = await request(apiBase()).post(`/api/v1/assignments/${assigned.body.id}/cancel`).set('Authorization', `Bearer ${instructorA}`);
    expect(again.status).toBe(409);

    const ws = await request(apiBase()).get('/api/v1/intern/me/workspace').set('Authorization', `Bearer ${internTok}`);
    expect(ws.body.status).toBe('unassigned');

    const reassign = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId, projectId: projectA, sessionId: sessionA,
    });
    expect(reassign.status).toBe(201);
    // Leave active for the concurrency test isolation (different intern there).
    const cleanup = await request(apiBase()).post(`/api/v1/assignments/${reassign.body.id}/cancel`).set('Authorization', `Bearer ${instructorA}`);
    expect(cleanup.status).toBe(201);
  });

  it('concurrent double-assign yields exactly one active assignment', async () => {
    const internId = await userIdByEmail(dataSource, `e2e-m4-i2-${RUN}@vintern.test`);
    const payload = { internId, projectId: projectA, sessionId: sessionA };
    const [first, second] = await Promise.all([
      request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send(payload),
      request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send(payload),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = first.status === 201 ? first.body.id : second.body.id;
    const rows = await dataSource.query(
      `SELECT COUNT(*) AS n FROM assignments WHERE internId = @0 AND status = 'active'`, [internId],
    );
    expect(Number(rows[0].n)).toBe(1);
    await request(apiBase()).post(`/api/v1/assignments/${winner}/cancel`).set('Authorization', `Bearer ${instructorA}`);
  });
});
