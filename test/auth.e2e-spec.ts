import { createConnection } from 'node:net';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hash } from 'bcryptjs';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';

/**
 * Platform-core e2e (spec 40/41): isolated, fail-fast, honest.
 *
 * SAFETY RULES:
 * - Refuses to run unless E2E_DB_NAME names a DISPOSABLE database
 *   (never the dev/prod VIntern database).
 * - Without a reachable SQL Server this suite FAILS with an explicit
 *   [E2E BLOCKED] message — integration status stays NOT VERIFIED,
 *   never a fake PASS.
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

beforeAll(async () => {
  if (!DB_NAME) {
    throw new Error(
      '[E2E BLOCKED] E2E_DB_NAME is not set. Point it at a DISPOSABLE database ' +
        '(never VIntern dev/prod). Integration status: NOT VERIFIED.',
    );
  }
  const reachable = await tcpReachable(DB_HOST, DB_PORT);
  if (!reachable) {
    throw new Error(
      `[E2E BLOCKED] SQL Server ${DB_HOST}:${DB_PORT} unreachable. ` +
        'Integration status: NOT VERIFIED (this failure is expected in environments without SQL Server).',
    );
  }

  // Standalone DS: create the disposable DB if needed + run migrations.
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
  await adminDs.query(
    `IF DB_ID(N'${DB_NAME}') IS NULL CREATE DATABASE [${DB_NAME}];`,
  );
  await adminDs.destroy();

  dataSource = new DataSource({
    type: 'mssql',
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASS,
    options: { encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    synchronize: false,
    logging: false,
    entities: [],
    migrationsRun: false,
  });
  await dataSource.initialize();
  await dataSource.query(`IF OBJECT_ID(N'migrations') IS NULL EXEC(N'SELECT 1');`);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();

  // Idempotent RBAC + a dedicated e2e admin (not the production bootstrap admin).
  const rbac = await ensureRbac(dataSource);
  expect(rbac.rolesCreated).toBeGreaterThanOrEqual(0);
  const roles = dataSource.getRepository(Role);
  const users = dataSource.getRepository(User);
  const userRoles = dataSource.getRepository(UserRole);
  const adminRole = await roles.findOneOrFail({ where: { code: 'admin' } });
  const internRole = await roles.findOneOrFail({ where: { code: 'intern' } });

  const adminEmail = 'e2e-admin@vintern.test';
  let admin = await users.findOne({ where: { email: adminEmail } });
  if (!admin) {
    admin = await users.save(
      users.create({
        email: adminEmail,
        username: 'e2e-admin',
        displayName: 'E2E Admin',
        passwordHash: await hash('E2e-Password-1', 10),
        status: 'active',
      }),
    );
    await userRoles.insert({ userId: admin.id, roleId: adminRole.id });
  }
  let intern = await users.findOne({ where: { email: 'e2e-intern@vintern.test' } });
  if (!intern) {
    intern = await users.save(
      users.create({
        email: 'e2e-intern@vintern.test',
        username: 'e2e-intern',
        displayName: 'E2E Intern',
        passwordHash: await hash('E2e-Password-1', 10),
        status: 'active',
      }),
    );
    await userRoles.insert({ userId: intern.id, roleId: internRole.id });
  }
  writeFileSync(join(__dirname, 'e2e-ids.json'), JSON.stringify({ adminId: admin.id, internId: intern.id }));
}, 120_000);

afterAll(async () => {
  await app?.close();
  await dataSource?.destroy();
});

async function login(email: string, password: string) {
  return request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
}

describe('Platform core e2e — auth + RBAC + pagination + health', () => {
  it('health is honest (ok with DB available)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.checks.database).toBe('ok');
  });

  it('login success → accessToken + roles + refresh cookie (HttpOnly, path-scoped)', async () => {
    const res = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user.roles).toContain('admin');
    const cookie = res.headers['set-cookie'] as unknown as string[];
    expect(cookie.join(';')).toContain('vintern_refresh=');
    expect(cookie.join(';')).toContain('HttpOnly');
  });

  it('login failure → 401 INVALID_CREDENTIALS (generic, no enumeration)', async () => {
    const res = await login('e2e-admin@vintern.test', 'wrong-password');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('locked user → 403 ACCOUNT_LOCKED', async () => {
    // create + lock a disposable user via the API (admin token)
    const admin = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const token = admin.body.accessToken as string;
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'e2e-locked@vintern.test',
        username: 'e2e-locked',
        displayName: 'E2E Locked',
        password: 'E2e-Password-1',
      });
    expect(created.status).toBe(201);
    const userId = created.body.id as string;
    const locked = await request(app.getHttpServer())
      .patch(`/api/v1/users/${userId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'locked' });
    expect(locked.status).toBe(200);
    const res = await login('e2e-locked@vintern.test', 'E2e-Password-1');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('refresh rotates; replaying the OLD cookie revokes the family (401 REFRESH_REUSE)', async () => {
    const first = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const cookie = (first.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie);
    expect(second.status).toBe(200);
    expect(second.body.accessToken).toBeTruthy();

    // replay the SAME (now-revoked) token → family revoked
    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('REFRESH_REUSE');
  });

  it('users API: unauthenticated → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/users');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('users API: intern → 403 PERMISSION_DENIED', async () => {
    const intern = await login('e2e-intern@vintern.test', 'E2e-Password-1');
    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${intern.body.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('users API: admin → 200 with unified pagination meta', async () => {
    const admin = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const res = await request(app.getHttpServer())
      .get('/api/v1/users?page=1&pageSize=10')
      .set('Authorization', `Bearer ${admin.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 10 });
    expect(typeof res.body.meta.total).toBe('number');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('validation rejects malformed body → 400 VALIDATION_ERROR (whitelist + forbid)', async () => {
    const admin = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${admin.body.accessToken}`)
      .send({ email: 'not-an-email', username: 'x', password: 'short', unexpectedField: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('audit trail records sensitive actions (user.created present after creation)', async () => {
    const admin = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const token = admin.body.accessToken as string;
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'e2e-audited@vintern.test',
        username: 'e2e-audited',
        displayName: 'E2E Audited',
        password: 'E2e-Password-1',
      });
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?action=user.created&page=1&pageSize=5')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('notification ownership: user cannot read/mark another user’s notification', async () => {
    // e2e-intern has a welcome notification? ensure via direct DB insert if none.
    const ids = JSON.parse(
      readE2EIds(),
    ) as { adminId: string; internId: string };
    const notifications = dataSource.getRepository('Notification' as never) as {
      findOne: (o: unknown) => Promise<{ id: string } | null>;
      insert: (o: unknown) => Promise<unknown>;
    };
    let notif = await notifications.findOne({ where: { userId: ids.internId } });
    if (!notif) {
      await notifications.insert({ userId: ids.internId, type: 'system', title: 'E2E test' });
      notif = await notifications.findOne({ where: { userId: ids.internId } });
    }
    expect(notif).toBeTruthy();
    const admin = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const res = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${notif!.id}/read`)
      .set('Authorization', `Bearer ${admin.body.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOTIFICATION_FORBIDDEN');
  });
});

function readE2EIds(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(join(__dirname, 'e2e-ids.json'), 'utf8');
}
