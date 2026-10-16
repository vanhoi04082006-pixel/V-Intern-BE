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
import { CreateTaskSubmissions1760476800000 } from '../src/database/migrations/1760476800000-CreateTaskSubmissions';
import { CreateAiGenerationBatches1761340800000 } from '../src/database/migrations/1761340800000-CreateAiGenerationBatches';
import { Role } from '../src/rbac/entities/role.entity';
import { Permission } from '../src/rbac/entities/permission.entity';
import { RolePermission } from '../src/rbac/entities/role-permission.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { ensureRecruitedProfile, userIdByEmail } from './recruitment-fixtures';

/**
 * P0 security hotfix e2e (BE-001/BE-002/BE-004/BE-007/BE-023).
 *
 * - Role-grant policy: non-admin holders of users.create/groups.manage cannot
 *   convey permissions they do not hold (403 ROLE_GRANT_FORBIDDEN).
 * - Submission review is scoped to the managing mentor + owned session (403
 *   TASK_ACCESS_DENIED cross-scope before review processing).
 * - Project mentorId cannot be reassigned by non-admins (403 PROJECT_MENTOR_FORBIDDEN).
 * - AI generation draft endpoint throttles bursts (429) while staying usable.
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

async function mkUser(
  users: ReturnType<DataSource['getRepository']>,
  userRoles: ReturnType<DataSource['getRepository']>,
  email: string,
  roleId: string,
) {
  const created = await users.save(
    users.create({
      email,
      username: email.split('@')[0],
      displayName: email.split('@')[0],
      passwordHash: await hash(PW, 10),
      status: 'active',
    }),
  );
  await userRoles.insert({ userId: created.id, roleId });
  return created;
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
      CreateRecruitmentAiCoreTables1760131200000,
      CreateTaskSubmissions1760476800000,
      CreateAiGenerationBatches1761340800000,
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
  const adminRole = await roles.findOneOrFail({ where: { code: 'admin' } });
  const instructorRole = await roles.findOneOrFail({ where: { code: 'instructor' } });
  const internRole = await roles.findOneOrFail({ where: { code: 'intern' } });

  // Custom least-privilege roles for grant-policy tests.
  const creatorRole = await roles.save(
    roles.create({ code: `p0-creator-${RUN}`, name: 'P0 creator', isSystem: false }),
  );
  const juniorRole = await roles.save(
    roles.create({ code: `p0-junior-${RUN}`, name: 'P0 junior', isSystem: false }),
  );
  const permissions = dataSource.getRepository(Permission);
  const rolePermissions = dataSource.getRepository(RolePermission);
  for (const code of ['users.create', 'groups.manage']) {
    const perm = await permissions.findOneOrFail({ where: { code } });
    await rolePermissions.insert({ roleId: creatorRole.id, permissionId: perm.id });
  }
  const usersCreate = await permissions.findOneOrFail({ where: { code: 'users.create' } });
  await rolePermissions.insert({ roleId: juniorRole.id, permissionId: usersCreate.id });

  for (const spec of [
    { email: `e2e-p0-admin-${RUN}@vintern.test`, roleId: adminRole.id },
    { email: `e2e-p0-creator-${RUN}@vintern.test`, roleId: creatorRole.id },
    { email: `e2e-p0-a-${RUN}@vintern.test`, roleId: instructorRole.id },
    { email: `e2e-p0-b-${RUN}@vintern.test`, roleId: instructorRole.id },
    { email: `e2e-p0-i1-${RUN}@vintern.test`, roleId: internRole.id },
  ]) {
    const existing = await users.findOne({ where: { email: spec.email } });
    if (!existing) await mkUser(users, userRoles, spec.email, spec.roleId);
  }
  await ensureRecruitedProfile(dataSource, await userIdByEmail(dataSource, `e2e-p0-i1-${RUN}@vintern.test`));
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
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

describe('P0 security hotfix', () => {
  let admin: string;
  let creator: string;
  let instructorA: string;
  let instructorB: string;
  let intern1: string;
  let projectA: string;
  let sessionA: string;
  let submissionId: string;
  let taskVersion: number;

  beforeAll(async () => {
    admin = await login(`e2e-p0-admin-${RUN}@vintern.test`);
    creator = await login(`e2e-p0-creator-${RUN}@vintern.test`);
    instructorA = await login(`e2e-p0-a-${RUN}@vintern.test`);
    instructorB = await login(`e2e-p0-b-${RUN}@vintern.test`);
    intern1 = await login(`e2e-p0-i1-${RUN}@vintern.test`);

    const session = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-P0-SS-${RUN}`, name: 'P0 session', description: 'p0 fixture',
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(session.status).toBe(201);
    sessionA = session.body.id;

    const project = await request(apiBase()).post('/api/v1/projects').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-P0-PJ-${RUN}`, name: 'P0 project', description: 'p0 fixture with a real description',
    });
    expect(project.status).toBe(201);
    projectA = project.body.id;
    const activated = await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${instructorA}`).send({ status: 'active' });
    expect(activated.status).toBe(200);

    const internId = await userIdByEmail(dataSource, `e2e-p0-i1-${RUN}@vintern.test`);
    const assigned = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${instructorA}`).send({
      internId, projectId: projectA, sessionId: sessionA,
    });
    expect(assigned.status).toBe(201);

    const sprint = await request(apiBase()).post('/api/v1/sprints').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-P0-SP-${RUN}`, name: 'P0 sprint', projectId: projectA, sessionId: sessionA,
      startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-30T00:00:00.000Z',
    });
    expect(sprint.status).toBe(201);
    const sprintOn = await request(apiBase()).post(`/api/v1/sprints/${sprint.body.id}/status`).set('Authorization', `Bearer ${instructorA}`).send({ status: 'active' });
    expect(sprintOn.status).toBe(201);

    const task = await request(apiBase()).post('/api/v1/tasks').set('Authorization', `Bearer ${instructorA}`).send({
      title: 'P0 task', description: 'p0 fixture task', projectId: projectA, sprintId: sprint.body.id, assigneeId: internId,
    });
    expect(task.status).toBe(201);

    const doing = await request(apiBase()).patch(`/api/v1/tasks/${task.body.id}/my`).set('Authorization', `Bearer ${intern1}`).send({ status: 'doing' });
    expect(doing.status).toBe(200);
    const current = await request(apiBase()).get(`/api/v1/tasks/${task.body.id}`).set('Authorization', `Bearer ${intern1}`);
    taskVersion = current.body.version;
    const submitted = await request(apiBase()).post(`/api/v1/tasks/${task.body.id}/submissions`).set('Authorization', `Bearer ${intern1}`).send({
      prUrl: 'https://github.com/example/repo/pull/1', summary: ' Implements the fixture feature. ', version: taskVersion,
    });
    expect(submitted.status).toBe(201);
    submissionId = submitted.body.id;
    const after = await request(apiBase()).get(`/api/v1/tasks/${task.body.id}`).set('Authorization', `Bearer ${intern1}`);
    taskVersion = after.body.version;
  }, 120_000);

  it('P0-1: creator cannot grant intern/admin/unknown/cased roles; admin can grant instructor', async () => {
    const denied = await request(apiBase()).post('/api/v1/users').set('Authorization', `Bearer ${creator}`).send({
      email: `e2e-p0-denied-${RUN}@vintern.test`, username: `e2e-p0-denied-${RUN}`, displayName: 'Denied', password: PW, roleCodes: ['intern'],
    });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ROLE_GRANT_FORBIDDEN');

    const cases: Array<{ codes: string[]; status: number; code: string }> = [
      { codes: ['admin'], status: 403, code: 'ROLE_GRANT_FORBIDDEN' },
      { codes: ['ADMIN'], status: 403, code: 'ROLE_GRANT_FORBIDDEN' },
      { codes: [' Admin '], status: 403, code: 'ROLE_GRANT_FORBIDDEN' },
      { codes: ['no-such-role-xyz'], status: 404, code: 'ROLE_NOT_FOUND' },
    ];
    let idx = 0;
    for (const c of cases) {
      const r = await request(apiBase()).post('/api/v1/users').set('Authorization', `Bearer ${creator}`).send({
        email: `e2e-p0-x-${RUN}-${idx}@vintern.test`, username: `e2e-p0-x-${RUN}-${idx}`, displayName: 'X', password: PW, roleCodes: c.codes,
      });
      idx += 1;
      expect(r.status).toBe(c.status);
      expect(r.body.code).toBe(c.code);
    }

    const ok = await request(apiBase()).post('/api/v1/users').set('Authorization', `Bearer ${creator}`).send({
      email: `e2e-p0-junior-${RUN}@vintern.test`, username: `e2e-p0-junior-${RUN}`, displayName: 'Junior', password: PW, roleCodes: [`p0-junior-${RUN}`],
    });
    expect(ok.status).toBe(201);

    const byAdmin = await request(apiBase()).post('/api/v1/users').set('Authorization', `Bearer ${admin}`).send({
      email: `e2e-p0-byadmin-${RUN}@vintern.test`, username: `e2e-p0-byadmin-${RUN}`, displayName: 'ByAdmin', password: PW, roleCodes: ['instructor'],
    });
    expect(byAdmin.status).toBe(201);
  });

  it('P0-2: creator cannot set admin on a group; scoped grant works; unknown 404', async () => {
    const group = await request(apiBase()).post('/api/v1/groups').set('Authorization', `Bearer ${admin}`).send({
      code: `e2e-p0-g-${RUN}`.toLowerCase(), name: 'P0 group',
    });
    expect(group.status).toBe(201);
    const gid = group.body.id;

    const esc = await request(apiBase()).put(`/api/v1/groups/${gid}/roles`).set('Authorization', `Bearer ${creator}`).send({ roleCodes: ['admin'] });
    expect(esc.status).toBe(403);
    expect(esc.body.code).toBe('ROLE_GRANT_FORBIDDEN');

    const ok = await request(apiBase()).put(`/api/v1/groups/${gid}/roles`).set('Authorization', `Bearer ${creator}`).send({ roleCodes: [`p0-junior-${RUN}`] });
    expect(ok.status).toBe(200);

    const unknown = await request(apiBase()).put(`/api/v1/groups/${gid}/roles`).set('Authorization', `Bearer ${creator}`).send({ roleCodes: ['no-such-role-xyz'] });
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('ROLE_NOT_FOUND');
  });

  it('P0-4: foreign instructor cannot review; owner and admin can; self-review still blocked', async () => {
    const rubric = { functional: 80, quality: 80, testing: 80, errors: 80, security: 80, dod: 80 };
    const foreign = await request(apiBase()).post(`/api/v1/submissions/${submissionId}/review`).set('Authorization', `Bearer ${instructorB}`).send({
      rubric, feedback: 'Trying to review a foreign submission.', taskVersion,
    });
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('TASK_ACCESS_DENIED');

    const self = await request(apiBase()).post(`/api/v1/submissions/${submissionId}/review`).set('Authorization', `Bearer ${intern1}`).send({
      rubric, feedback: 'Self review attempt by the submitter.', taskVersion,
    });
    expect(self.status).toBe(403);

    const owner = await request(apiBase()).post(`/api/v1/submissions/${submissionId}/review`).set('Authorization', `Bearer ${instructorA}`).send({
      rubric, feedback: 'Thorough review by the managing mentor.', taskVersion,
    });
    expect(owner.status).toBe(201);
    expect(owner.body.status).toBe('approved');

    const byAdmin = await request(apiBase()).post(`/api/v1/submissions/${submissionId}/review`).set('Authorization', `Bearer ${admin}`).send({
      rubric, feedback: 'Admin re-review of an already reviewed item.', taskVersion,
    });
    expect(byAdmin.status).toBe(201);
  });

  it('P0-5: non-admin cannot create-for or reassign mentorId; admin can', async () => {
    const instructorBId = await userIdByEmail(dataSource, `e2e-p0-b-${RUN}@vintern.test`);
    const createFor = await request(apiBase()).post('/api/v1/projects').set('Authorization', `Bearer ${instructorA}`).send({
      code: `E2E-P0-PJ2-${RUN}`, name: 'P0 project 2', description: 'hijack attempt via mentorId', mentorId: instructorBId,
    });
    expect(createFor.status).toBe(403);
    expect(createFor.body.code).toBe('PROJECT_MENTOR_FORBIDDEN');

    const reassign = await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${instructorA}`).send({ mentorId: instructorBId });
    expect(reassign.status).toBe(403);
    expect(reassign.body.code).toBe('PROJECT_MENTOR_FORBIDDEN');

    const byAdmin = await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${admin}`).send({ mentorId: instructorBId });
    expect(byAdmin.status).toBe(200);
    const revert = await request(apiBase()).patch(`/api/v1/projects/${projectA}`).set('Authorization', `Bearer ${admin}`).send({ mentorId: await userIdByEmail(dataSource, `e2e-p0-a-${RUN}@vintern.test`) });
    expect(revert.status).toBe(200);
  });

  it('P0-6: AI draft bursts throttle (429) without breaking the route', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await request(apiBase()).post('/api/v1/ai-generations/sprint-plan/draft').set('Authorization', `Bearer ${instructorA}`).send({});
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 4)).toEqual([400, 400, 400, 400]);
    expect(statuses[4]).toBe(429);
  });
});
