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
import { CreateProjectRoleSlots1761254400000 } from '../src/database/migrations/1761254400000-CreateProjectRoleSlots';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { ensureRecruitedProfile, userIdByEmail } from './recruitment-fixtures';

/**
 * Project role slots e2e (redesign §7/§12/§15/§39).
 *
 * - Slots define required roles + headcount per project.
 * - Assignment with a role enforces slot caps (409 ROLE_SLOT_FULL).
 * - Role-less assignment stays open (backward compatible).
 * - 1-active-project stays authoritative (409 ASSIGNMENT_CONFLICT).
 * - Cross-instructor slot writes are 403.
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
    migrations: [InitPlatformCore1759872000000, CreateAcademicCoreTables1759958400000, CreateSprintTaskCoreTables1760044800000, CreateRecruitmentAiCoreTables1760131200000, AddRecruitmentReviewProvenance1760390400000, CreateProjectRoleSlots1761254400000],
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
    { email: `e2e-slot-admin-${RUN}@vintern.test`, username: `e2e-slot-admin-${RUN}`, roleId: adminRole.id },
    { email: `e2e-slot-a-${RUN}@vintern.test`, username: `e2e-slot-a-${RUN}`, roleId: instructorRole.id },
    { email: `e2e-slot-b-${RUN}@vintern.test`, username: `e2e-slot-b-${RUN}`, roleId: instructorRole.id },
    { email: `e2e-slot-i1-${RUN}@vintern.test`, username: `e2e-slot-i1-${RUN}`, roleId: internRole.id },
    { email: `e2e-slot-i2-${RUN}@vintern.test`, username: `e2e-slot-i2-${RUN}`, roleId: internRole.id },
    { email: `e2e-slot-i3-${RUN}@vintern.test`, username: `e2e-slot-i3-${RUN}`, roleId: internRole.id },
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
  for (const suffix of ['i1', 'i2', 'i3']) {
    await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-slot-${suffix}-${RUN}@vintern.test`));
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
  const res = await request(apiBase())
    .post('/api/v1/auth/login')
    .send({ email, password: 'E2e-Password-1' });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

describe('Project role slots + assignment with role', () => {
  let instructorA: string;
  let instructorB: string;
  let sessionA: string;
  let projectA: string;

  beforeAll(async () => {
    instructorA = await login(`e2e-slot-a-${RUN}@vintern.test`);
    instructorB = await login(`e2e-slot-b-${RUN}@vintern.test`);
    const session = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-SLOT-SS-${RUN}`, name: 'Slot session', description: 'slot fixture',
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(session.status).toBe(201);
    sessionA = session.body.id;
    const project = await request(apiBase()).post('/api/v1/projects').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-SLOT-PJ-${RUN}`, name: 'Slot project', description: 'slot fixture with a real description',
    });
    expect(project.status).toBe(201);
    projectA = project.body.id;
    const active = await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${instructorA}`).send({ status: 'active' });
    expect(active.status).toBe(200);
  });

  it('defines FE:1 + BE:1 slots and reports filled counts', async () => {
    const put = await request(apiBase()).put(`/api/v1/projects/${projectA}/slots`).set('Authorization', `Bearer ${instructorA}`).send({
      slots: [
        { roleCode: 'frontend', requiredCount: 1 },
        { roleCode: 'backend', requiredCount: 1 },
      ],
    });
    expect(put.status).toBe(200);
    expect(put.body.slots).toHaveLength(2);
    const got = await request(apiBase()).get(`/api/v1/projects/${projectA}/slots`).set('Authorization', `Bearer ${instructorA}`);
    expect(got.status).toBe(200);
    expect(got.body.slots.find((s: { roleCode: string }) => s.roleCode === 'frontend')).toMatchObject({ requiredCount: 1, filledCount: 0 });
  });

  it('rejects invalid slot payloads without touching stored slots', async () => {
    const bad = await request(apiBase()).put(`/api/v1/projects/${projectA}/slots`).set('Authorization', `Bearer ${instructorA}`).send({
      slots: [{ roleCode: '', requiredCount: 0 }],
    });
    expect(bad.status).toBe(400);
    const got = await request(apiBase()).get(`/api/v1/projects/${projectA}/slots`).set('Authorization', `Bearer ${instructorA}`);
    expect(got.body.slots).toHaveLength(2);
  });

  it('a stranger cannot rewrite slots or read them', async () => {
    expect((await request(apiBase()).put(`/api/v1/projects/${projectA}/slots`).set('Authorization', `Bearer ${instructorB}`).send({ slots: [] })).status).toBe(403);
    expect((await request(apiBase()).get(`/api/v1/projects/${projectA}/slots`).set('Authorization', `Bearer ${instructorB}`)).status).toBe(403);
  });

  it('assigns FE then blocks the second FE with ROLE_SLOT_FULL', async () => {
    const i1 = await userIdByEmail(dataSource, `e2e-slot-i1-${RUN}@vintern.test`);
    const first = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId: i1, projectId: projectA, sessionId: sessionA, role: 'frontend',
    });
    expect(first.status).toBe(201);
    const i2 = await userIdByEmail(dataSource, `e2e-slot-i2-${RUN}@vintern.test`);
    const overflow = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId: i2, projectId: projectA, sessionId: sessionA, role: 'frontend',
    });
    expect(overflow.status).toBe(409);
    expect(overflow.body.code).toBe('ROLE_SLOT_FULL');
    const got = await request(apiBase()).get(`/api/v1/projects/${projectA}/slots`).set('Authorization', `Bearer ${instructorA}`);
    expect(got.body.slots.find((s: { roleCode: string }) => s.roleCode === 'frontend')).toMatchObject({ filledCount: 1 });
  });

  it('role-less assignment stays open and member rows carry the role', async () => {
    const i3 = await userIdByEmail(dataSource, `e2e-slot-i3-${RUN}@vintern.test`);
    const open = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId: i3, projectId: projectA, sessionId: sessionA,
    });
    expect(open.status).toBe(201);
    const members = await request(apiBase()).get(`/api/v1/projects/${projectA}/members`).set('Authorization', `Bearer ${instructorA}`);
    const i1 = await userIdByEmail(dataSource, `e2e-slot-i1-${RUN}@vintern.test`);
    expect(members.body.members.find((m: { userId: string }) => m.userId === i1)?.roleInProject).toBe('frontend');
    expect(members.body.members.find((m: { userId: string }) => m.userId === i3)?.roleInProject).toBe('intern');
  });
});
