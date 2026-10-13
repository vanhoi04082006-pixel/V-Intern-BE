import { createConnection } from 'node:net';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { ENTITIES } from '../src/database/entities';
import { InitPlatformCore1759872000000 } from '../src/database/migrations/1759872000000-InitPlatformCore';
import { CreateEvaluationKpiSalaryCertificateTables1760217600000 } from '../src/database/migrations/1760217600000-CreateEvaluationKpiSalaryCertificateTables';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';

/**
 * M1 BE-010: manual salary adjustments are idempotent per client requestId.
 * Same requestId twice → same row, one ledger entry. Different requestId →
 * two rows. Legacy calls without requestId keep prior behavior.
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
let E2E_SAL_INTERN = '';

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
    migrations: [InitPlatformCore1759872000000, CreateEvaluationKpiSalaryCertificateTables1760217600000],
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
  const email = `e2e-sal-admin-${RUN}@vintern.test`;
  const created = await users.save(
    users.create({
      email, username: `e2e-sal-admin-${RUN}`, displayName: 'Salary Admin',
      passwordHash: await hash('E2e-Password-1', 10), status: 'active',
    }),
  );
  await userRoles.insert({ userId: created.id, roleId: adminRole.id });
  const intern = await users.save(
    users.create({
      email: `e2e-sal-i-${RUN}@vintern.test`, username: `e2e-sal-i-${RUN}`, displayName: 'Salary Intern',
      passwordHash: await hash('E2e-Password-1', 10), status: 'active',
    }),
  );
  E2E_SAL_INTERN = intern.id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await dataSource?.destroy();
});

function apiBase(): string {
  const addr = app.getHttpServer().address() as { port: number };
  return `http://127.0.0.1:${addr.port}`;
}

async function adminToken(): Promise<string> {
  const res = await request(apiBase()).post('/api/v1/auth/login').send({
    email: `e2e-sal-admin-${RUN}@vintern.test`, password: 'E2e-Password-1',
  });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`);
  return res.body.accessToken as string;
}

describe('Salary adjustment idempotency (M1 BE-010)', () => {
  it('same requestId twice returns the same row without duplicating the ledger', async () => {
    const token = await adminToken();
    const internId = E2E_SAL_INTERN;
    const requestId = randomUUID();
    const body = { userId: internId, type: 'bonus', amount: 50000, reason: 'M1 idempotency probe', requestId };
    const first = await request(apiBase()).post('/api/v1/virtual-salary/adjustments').set('Authorization', `Bearer ${token}`).send(body);
    expect(first.status).toBe(201);
    const second = await request(apiBase()).post('/api/v1/virtual-salary/adjustments').set('Authorization', `Bearer ${token}`).send(body);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    const rows = await dataSource.query(
      'SELECT COUNT(*) AS n FROM virtual_salary_ledger WHERE idempotencyKey = @0',
      [`adjustment:req:${requestId}`],
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it('different requestIds create distinct rows', async () => {
    const token = await adminToken();
    const internId = E2E_SAL_INTERN;
    const a = await request(apiBase()).post('/api/v1/virtual-salary/adjustments').set('Authorization', `Bearer ${token}`).send({
      userId: internId, type: 'bonus', amount: 10000, reason: 'M1 distinct A', requestId: randomUUID(),
    });
    const b = await request(apiBase()).post('/api/v1/virtual-salary/adjustments').set('Authorization', `Bearer ${token}`).send({
      userId: internId, type: 'bonus', amount: 10000, reason: 'M1 distinct B', requestId: randomUUID(),
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).not.toBe(a.body.id);
  });
});
