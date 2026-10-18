import { createDatabaseSql } from '../src/database/create-database-sql';
import { createConnection } from 'node:net';
import { randomUUID } from 'crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hash } from 'bcryptjs';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { ENTITIES } from '../src/database/entities';
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
const RUN = randomUUID().slice(0, 8);

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
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    logging: false,
  });
  await adminDs.initialize();
  await adminDs.query(createDatabaseSql(DB_NAME, process.env.DB_FILES_ROOT));
  await adminDs.destroy();

  dataSource = new DataSource({
    type: 'mssql',
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASS,
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
    synchronize: false,
    logging: false,
    // Entities REQUIRED here: ensureRbac below resolves Role/User metadata
    // through THIS DataSource (Phase 3.5: surfaced by the first real-DB run).
    entities: ENTITIES,
    migrationsRun: false,
  });
  await dataSource.initialize();
  await dataSource.query(`IF OBJECT_ID(N'migrations') IS NULL EXEC(N'SELECT 1');`);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // Register Swagger EXACTLY like main.ts so the runtime swagger test
  // exercises the same code path (Phase 3.5 spec 20 — no compile-only gap).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('V-Intern API')
    .setDescription('V-Intern NestJS backend — e2e runtime document.')
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  // Bind ONCE on an ephemeral port — supertest addresses it by URL and
  // never listens/closes the shared server per request (race-free).
  await app.listen(0);

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

/** Base URL of the once-bound server (ephemeral port from listen(0)). */
function apiBase(): string {
  const addr = app.getHttpServer().address() as { port: number };
  return `http://127.0.0.1:${addr.port}`;
}

async function login(email: string, password: string) {
  return request(apiBase()).post('/api/v1/auth/login').send({ email, password });
}

describe('Platform core e2e — auth + RBAC + pagination + health', () => {
  it('SQL datetime2 round-trips UTC independently of the host timezone', async () => {
    const instant = new Date('2026-04-15T03:04:05.000Z');
    const rows = await dataSource.query('SELECT CAST(@0 AS datetime2) AS instant, SYSUTCDATETIME() AS currentUtc', [instant]);
    expect(rows[0].instant.toISOString()).toBe(instant.toISOString());
    expect(Math.abs(rows[0].currentUtc.getTime() - Date.now())).toBeLessThan(10_000);
  });
  it('health is honest (ok with DB available)', async () => {
    const res = await request(apiBase()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.checks.database).toBe('ok');
  });

  it('swagger runtime: /api/docs serves UI, /api/docs-json serves the OpenAPI document', async () => {
    const ui = await request(apiBase()).get('/api/docs');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');

    const json = await request(apiBase()).get('/api/docs-json');
    expect(json.status).toBe(200);
    expect(String(json.body.openapi)).toMatch(/^3\./);
    expect(json.body.info?.title).toBe('V-Intern API');
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
    const created = await request(apiBase())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: `e2e-locked-${RUN}@vintern.test`,
        username: `e2e-locked-${RUN}`,
        displayName: 'E2E Locked',
        password: 'E2e-Password-1',
      });
    expect(created.status).toBe(201);
    const userId = created.body.id as string;
    const locked = await request(apiBase())
      .patch(`/api/v1/users/${userId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'locked' });
    expect(locked.status).toBe(200);
    const res = await login(`e2e-locked-${RUN}@vintern.test`, 'E2e-Password-1');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('refresh rotates; replaying the OLD cookie revokes the family (401 REFRESH_REUSE)', async () => {
    const first = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const cookie = (first.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

    const second = await request(apiBase())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie);
    expect(second.status).toBe(200);
    expect(second.body.accessToken).toBeTruthy();

    // replay the SAME (now-revoked) token → family revoked
    const replay = await request(apiBase())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('REFRESH_REUSE');
  });

  it("concurrent refresh permits one rotation and revokes every descendant on reuse", async () => {
    const first = await login("e2e-admin@vintern.test", "E2e-Password-1");
    expect(first.status).toBe(200);
    const cookie = (
      first.headers["set-cookie"] as unknown as string[]
    )[0].split(";")[0];
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(apiBase()).post("/api/v1/auth/refresh").set("Cookie", cookie),
      ),
    );
    expect(results.map((res) => res.status).sort()).toEqual([
      200, 401, 401, 401, 401, 401, 401, 401,
    ]);
    for (const denied of results.filter((res) => res.status === 401)) {
      expect(denied.body.code).toBe("REFRESH_REUSE");
    }
    const winner = results.find((res) => res.status === 200)!;
    const rotatedCookie = (
      winner.headers["set-cookie"] as unknown as string[]
    )[0].split(";")[0];
    const replay = await request(apiBase())
      .post("/api/v1/auth/refresh")
      .set("Cookie", rotatedCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("REFRESH_REUSE");
    const rawToken = cookie.substring(cookie.indexOf("=") + 1);
    const { createHash } = await import("node:crypto");
    const rows = await dataSource.query(
      "SELECT COUNT(*) AS active FROM refresh_tokens WHERE revokedAt IS NULL AND familyId=(SELECT familyId FROM refresh_tokens WHERE tokenHash=@0)",
      [createHash("sha256").update(rawToken).digest("hex")],
    );
    expect(Number(rows[0].active)).toBe(0);
  });

  it("logout with a rotated cookie revokes the current descendant", async () => {
    const first = await login("e2e-admin@vintern.test", "E2e-Password-1");
    expect(first.status).toBe(200);
    const oldCookie = (
      first.headers["set-cookie"] as unknown as string[]
    )[0].split(";")[0];
    const rotated = await request(apiBase())
      .post("/api/v1/auth/refresh")
      .set("Cookie", oldCookie);
    expect(rotated.status).toBe(200);
    const newCookie = (
      rotated.headers["set-cookie"] as unknown as string[]
    )[0].split(";")[0];
    await request(apiBase())
      .post("/api/v1/auth/logout")
      .set("Cookie", oldCookie)
      .expect(204);
    const denied = await request(apiBase())
      .post("/api/v1/auth/refresh")
      .set("Cookie", newCookie);
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe("REFRESH_REUSE");
  });

  it("logout racing rotation leaves no refresh descendant authenticated", async () => {
    const first = await login("e2e-admin@vintern.test", "E2e-Password-1");
    expect(first.status).toBe(200);
    const cookie = (
      first.headers["set-cookie"] as unknown as string[]
    )[0].split(";")[0];
    const [refresh, logout] = await Promise.all([
      request(apiBase()).post("/api/v1/auth/refresh").set("Cookie", cookie),
      request(apiBase()).post("/api/v1/auth/logout").set("Cookie", cookie),
    ]);
    expect(logout.status).toBe(204);
    expect([200, 401]).toContain(refresh.status);
    if (refresh.status === 200) {
      const descendant = (
        refresh.headers["set-cookie"] as unknown as string[]
      )[0].split(";")[0];
      await request(apiBase())
        .post("/api/v1/auth/refresh")
        .set("Cookie", descendant)
        .expect(401);
    }
    await request(apiBase())
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(401);
  });

  it('users API: unauthenticated → 401', async () => {
    const res = await request(apiBase()).get('/api/v1/users');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('users API: intern → 403 PERMISSION_DENIED', async () => {
    const intern = await login('e2e-intern@vintern.test', 'E2e-Password-1');
    const res = await request(apiBase())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${intern.body.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('users API: admin → 200 with unified pagination meta', async () => {
    const admin = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const res = await request(apiBase())
      .get('/api/v1/users?page=1&pageSize=10')
      .set('Authorization', `Bearer ${admin.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 10 });
    expect(typeof res.body.meta.total).toBe('number');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('validation rejects malformed body → 400 VALIDATION_ERROR (whitelist + forbid)', async () => {
    const admin = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const res = await request(apiBase())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${admin.body.accessToken}`)
      .send({ email: 'not-an-email', username: 'x', password: 'short', unexpectedField: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('user detail never returns password hashes; role grants and group roles reflect actual SQL', async () => {
    const admin = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const token = admin.body.accessToken as string;
    const ids = JSON.parse(readE2EIds()) as { adminId: string; internId: string };
    const detail = await request(apiBase()).get(`/api/v1/users/${ids.internId}`).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body).not.toHaveProperty('passwordHash');
    const roles = await request(apiBase()).get('/api/v1/roles').set('Authorization', `Bearer ${token}`);
    const role = roles.body.data.find((r: { code: string }) => r.code === 'intern');
    const grants = await request(apiBase()).get(`/api/v1/roles/${role.id}/permissions?pageSize=100`).set('Authorization', `Bearer ${token}`);
    expect(grants.status).toBe(200);
    const actual = await dataSource.query('SELECT COUNT(*) AS n FROM role_permissions WHERE roleId=@0', [role.id]);
    expect(grants.body.meta.total).toBe(Number(actual[0].n));
    expect(grants.body.data.map((p: { code: string }) => p.code)).toContain('tasks.update.own');
    const filterName = `e2e-grants-${RUN}`;
    const member = await request(apiBase()).post('/api/v1/users').set('Authorization', `Bearer ${token}`).send({ email: `${filterName}@vintern.test`, username: filterName, displayName: 'Role filter fixture', password: 'E2e-Password-1', roleCodes: ['admin'] }).expect(201);
    const group = await request(apiBase()).post('/api/v1/groups').set('Authorization', `Bearer ${token}`).send({ code: `e2e-read-grants-${RUN}`, name: 'Read grants' });
    expect(group.status).toBe(201);
    await request(apiBase()).put(`/api/v1/groups/${group.body.id}/roles`).set('Authorization', `Bearer ${token}`).send({ roleCodes: ['intern'] }).expect(200);
    const groupRoles = await request(apiBase()).get(`/api/v1/groups/${group.body.id}/roles`).set('Authorization', `Bearer ${token}`);
    expect(groupRoles.status).toBe(200);
    expect(groupRoles.body.roles).toEqual(['intern']);
    const beforeRoleFilter = await request(apiBase()).get(`/api/v1/users?roleCode=intern&q=${filterName}`).set('Authorization', `Bearer ${token}`);
    expect(beforeRoleFilter.status).toBe(200);
    expect(beforeRoleFilter.body.meta.total).toBe(0);
    await request(apiBase()).post(`/api/v1/groups/${group.body.id}/members`).set('Authorization', `Bearer ${token}`).send({userIds: [member.body.id]}).expect(201);
    const inheritedRoleFilter = await request(apiBase()).get(`/api/v1/users?roleCode=intern&q=${filterName}`).set('Authorization', `Bearer ${token}`);
    expect(inheritedRoleFilter.status).toBe(200);
    expect(inheritedRoleFilter.body.meta.total).toBe(1);
    expect(inheritedRoleFilter.body.data[0].id).toBe(member.body.id);
    expect(inheritedRoleFilter.body.data[0]).not.toHaveProperty('passwordHash');
    await request(apiBase()).get('/api/v1/users?roleCode=invalid%20role').set('Authorization', `Bearer ${token}`).expect(400);
    const intern = await login('e2e-intern@vintern.test', 'E2e-Password-1');
    await request(apiBase()).get(`/api/v1/roles/${role.id}/permissions`).set('Authorization', `Bearer ${intern.body.accessToken}`).expect(403);
    await request(apiBase()).get(`/api/v1/groups/${group.body.id}/roles`).set('Authorization', `Bearer ${intern.body.accessToken}`).expect(403);
  });

  it('audit trail records sensitive actions (user.created present after creation)', async () => {
    const admin = await login('e2e-admin@vintern.test', 'E2e-Password-1');
    const token = admin.body.accessToken as string;
    const created = await request(apiBase())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: `e2e-audited-${RUN}@vintern.test`,
        username: `e2e-audited-${RUN}`,
        displayName: 'E2E Audited',
        password: 'E2e-Password-1',
      });
    expect(created.status).toBe(201);
    const res = await request(apiBase())
      .get('/api/v1/audit-logs?action=user.created&page=1&pageSize=5')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.some((row: { targetId: string }) => row.targetId.toLowerCase() === created.body.id.toLowerCase())).toBe(true);
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
    const res = await request(apiBase())
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
