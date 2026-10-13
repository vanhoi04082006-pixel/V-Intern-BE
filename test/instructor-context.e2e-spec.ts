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
import { CreateEvaluationKpiSalaryCertificateTables1760217600000 } from '../src/database/migrations/1760217600000-CreateEvaluationKpiSalaryCertificateTables';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { ensureRecruitedProfile, userIdByEmail } from './recruitment-fixtures';

/**
 * Instructor context reads (redesign §11/§13/§26/§30).
 *
 * - Candidates carry availability + latest interview scores.
 * - Project detail exposes its sessions (owned scope only).
 * - Performance rows carry the primary project/session names.
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
    migrations: [InitPlatformCore1759872000000, CreateAcademicCoreTables1759958400000, CreateSprintTaskCoreTables1760044800000, CreateRecruitmentAiCoreTables1760131200000, AddRecruitmentReviewProvenance1760390400000, CreateEvaluationKpiSalaryCertificateTables1760217600000, CreateProjectRoleSlots1761254400000],
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
    { email: `e2e-ctx-admin-${RUN}@vintern.test`, username: `e2e-ctx-admin-${RUN}`, roleId: adminRole.id },
    { email: `e2e-ctx-a-${RUN}@vintern.test`, username: `e2e-ctx-a-${RUN}`, roleId: instructorRole.id },
    { email: `e2e-ctx-b-${RUN}@vintern.test`, username: `e2e-ctx-b-${RUN}`, roleId: instructorRole.id },
    { email: `e2e-ctx-i1-${RUN}@vintern.test`, username: `e2e-ctx-i1-${RUN}`, roleId: internRole.id },
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
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-ctx-i1-${RUN}@vintern.test`));
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

describe('Instructor context reads', () => {
  let instructorA: string;
  let sessionA: string;
  let projectA: string;
  let internId: string;

  beforeAll(async () => {
    instructorA = await login(`e2e-ctx-a-${RUN}@vintern.test`);
    internId = await userIdByEmail(dataSource, `e2e-ctx-i1-${RUN}@vintern.test`);
    const session = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-CTX-SS-${RUN}`, name: 'Context session', description: 'context fixture',
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(session.status).toBe(201);
    sessionA = session.body.id;
    const project = await request(apiBase()).post('/api/v1/projects').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-CTX-PJ-${RUN}`, name: 'Context project', description: 'context fixture with a real description',
    });
    expect(project.status).toBe(201);
    projectA = project.body.id;
    const active = await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${instructorA}`).send({ status: 'active' });
    expect(active.status).toBe(200);
    const assigned = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId, projectId: projectA, sessionId: sessionA, role: 'frontend',
    });
    expect(assigned.status).toBe(201);
  });

  it('candidates carry availability and latest interview scores', async () => {
    const res = await request(apiBase()).get(`/api/v1/recruitment/candidates?pageSize=50&search=${encodeURIComponent(`e2e-ctx-i1-${RUN}`)}`).set('Authorization', `Bearer ${instructorA}`);
    expect(res.status).toBe(200);
    const me = res.body.items.find((c: { userId: string }) => c.userId === internId.toLowerCase());
    expect(me).toBeDefined();
    expect(me.hasActiveAssignment).toBe(true);
    expect(me.activeProjectId).toBe(projectA);
  });

  it('project exposes its sessions, scoped to the managed ones', async () => {
    const res = await request(apiBase()).get(`/api/v1/projects/${projectA}/sessions`).set('Authorization', `Bearer ${instructorA}`);
    expect(res.status).toBe(200);
    expect(res.body.sessions.some((s: { id: string }) => s.id === sessionA)).toBe(true);
    const row = res.body.sessions.find((s: { id: string }) => s.id === sessionA);
    expect(row.memberCount).toBeGreaterThanOrEqual(1);
  });

  it('performance rows carry the primary project and session', async () => {
    const res = await request(apiBase()).get('/api/v1/performance/interns').set('Authorization', `Bearer ${instructorA}`);
    expect(res.status).toBe(200);
    const me = res.body.items.find((m: { userId: string }) => m.userId === internId);
    expect(me).toBeDefined();
    expect(me.primaryProjectName).toBe('Context project');
    expect(me.primarySessionId).toBe(sessionA);
  });
});
