import { createConnection } from 'node:net';
import { hash } from 'bcryptjs';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { ensureRecruitedProfile } from './recruitment-fixtures';
import { ENTITIES } from '../src/database/entities';
import { Role } from '../src/rbac/entities/role.entity';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';

/**
 * PHASE 5 — KPI + VIRTUAL SALARY + CERTIFICATES e2e (spec 82-87) on REAL
 * SQL Server.
 *
 * KPI: deterministic kpi-v1 with EXACT component values/weights —
 *   k1: delivery 80 (SP), quality 90 (finalized eval), timeliness MISSING
 *       → renormalized (80×50 + 90×30)/80 = 83.8 (the spec-25 example);
 *   k3: delivery = task rate 50, timeliness 100, quality missing
 *       → (50×50 + 100×20)/70 = 64.2857… → 64.3;
 *   k2: NO data → insufficient_data (no score, no zero-penalty).
 * Provenance rows persist configured + effective weights; reload equality;
 * idempotent recalculation; finalize lock; notification.
 *
 * Virtual salary: base 10,000,000 VND_VIRTUAL from the SETTING → k1 earns
 * 8,380,000 exactly; regeneration never duplicates (UNIQUE idempotencyKey);
 * bonus/penalty/reversal; ledger-derived balance; CONFIG_MISSING honesty.
 *
 * Certificates: deterministic V-INTERN-COMPLETE v1 eligibility; issue →
 * SEQUENCE number + verification code + notification; public verify;
 * real PDF (application/pdf, %PDF, number represented); revoke flow;
 * ineligible interns get 409 with structured reasons; concurrent double
 * issue → exactly one certificate.
 */

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

const DB_HOST = process.env.DB_HOST ?? 'localhost';
const DB_PORT = Number(process.env.DB_PORT ?? 1433);
const DB_NAME = process.env.E2E_DB_NAME ?? '';
const DB_USER = process.env.DB_USERNAME ?? 'vintern_app';
const DB_PASS = process.env.DB_PASSWORD ?? '';

const RUN = Date.now().toString(36);
const EMAILS = {
  admin: `e2e-e5b-admin-${RUN}@vintern.test`,
  si: `e2e-e5b-si-${RUN}@vintern.test`,
  k1: `e2e-e5b-k1-${RUN}@vintern.test`, // full data → 83.8
  k2: `e2e-e5b-k2-${RUN}@vintern.test`, // recruited+assigned, NO data → insufficient_data
  k3: `e2e-e5b-k3-${RUN}@vintern.test`, // task-rate + timeliness, no eval → 64.3
  i2: `e2e-e5b-i2-${RUN}@vintern.test`, // NOT recruited → certificate ineligible
};
const PASSWORD = 'E2e-Password-1';

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
    throw new Error('[E2E BLOCKED] E2E_DB_NAME is not set. Point it at a DISPOSABLE database.');
  }
  if (!(await tcpReachable(DB_HOST, DB_PORT))) {
    throw new Error(`[E2E BLOCKED] SQL Server ${DB_HOST}:${DB_PORT} unreachable.`);
  }

  const adminDs = new DataSource({
    type: 'mssql', host: DB_HOST, port: DB_PORT, database: 'master', username: DB_USER, password: DB_PASS,
    options: { encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true }, logging: false,
  });
  await adminDs.initialize();
  await adminDs.query(`IF DB_ID(N'${DB_NAME}') IS NULL CREATE DATABASE [${DB_NAME}];`);
  await adminDs.destroy();

  dataSource = new DataSource({
    type: 'mssql', host: DB_HOST, port: DB_PORT, database: DB_NAME, username: DB_USER, password: DB_PASS,
    options: { encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true },
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
    { email: EMAILS.admin, username: `e2e-e5b-admin-${RUN}`, roleId: adminRole.id },
    { email: EMAILS.si, username: `e2e-e5b-si-${RUN}`, roleId: instructorRole.id },
    { email: EMAILS.k1, username: `e2e-e5b-k1-${RUN}`, roleId: internRole.id },
    { email: EMAILS.k2, username: `e2e-e5b-k2-${RUN}`, roleId: internRole.id },
    { email: EMAILS.k3, username: `e2e-e5b-k3-${RUN}`, roleId: internRole.id },
    { email: EMAILS.i2, username: `e2e-e5b-i2-${RUN}`, roleId: internRole.id },
  ];
  for (const spec of specs) {
    const existing = await users.findOne({ where: { email: spec.email } });
    if (!existing) {
      const created = await users.save(
        users.create({
          email: spec.email, username: spec.username, displayName: spec.username,
          passwordHash: await hash(PASSWORD, 10), status: 'active',
        }),
      );
      await userRoles.insert({ userId: created.id, roleId: spec.roleId });
    }
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
  const res = await request(apiBase()).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

async function query(text: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  const runner = dataSource.manager.query.bind(dataSource.manager);
  let i = 0;
  const converted = text.replace(/\?/g, () => `@${i++}`);
  return runner(converted, params) as Promise<Array<Record<string, unknown>>>;
}

async function userIdByEmail(email: string): Promise<string> {
  const rows = await query(`SELECT id FROM users WHERE email = @0`, [email]);
  return rows[0].id as string;
}

describe('Phase 5 KPI + virtual salary + certificates e2e (spec 82-87)', () => {
  let admin: string;
  let si: string;
  let k1: string;
  let k2: string;
  let k1Id: string;
  let k2Id: string;
  let k3Id: string;
  let i2Id: string;
  let sessionId: string;
  let projectId: string;
  let sprintId: string;
  let cycleId: string;
  const criterionIds: Record<string, string> = {};
  let periodId: string;

  async function assignIntern(internId: string): Promise<string> {
    const res = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${admin}`).send({
      internId, projectId, sessionId,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function createTask(over: { title: string; assigneeId: string; storyPoints?: number; dueDate?: string }): Promise<string> {
    const res = await request(apiBase()).post('/api/v1/tasks').set('Authorization', `Bearer ${admin}`).send({
      title: over.title, projectId, sprintId, assigneeId: over.assigneeId,
      ...(over.storyPoints !== undefined ? { storyPoints: over.storyPoints } : {}),
      ...(over.dueDate ? { dueDate: over.dueDate } : {}),
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function driveToDone(taskId: string): Promise<void> {
    for (const status of ['doing', 'review', 'done']) {
      const res = await request(apiBase()).patch(`/api/v1/tasks/${taskId}`).set('Authorization', `Bearer ${admin}`).send({ status });
      expect(res.status).toBe(200);
    }
  }

  async function finalizeEvaluationFor(internId: string, token: string, scores: number[]): Promise<string> {
    const created = await request(apiBase()).post('/api/v1/evaluations').set('Authorization', `Bearer ${token}`).send({
      cycleId, internId,
    });
    expect(created.status).toBe(201);
    const evaluationId = created.body.id as string;
    const patch = await request(apiBase()).patch(`/api/v1/evaluations/${evaluationId}`).set('Authorization', `Bearer ${token}`).send({
      scores: [
        { criterionId: criterionIds.technical_quality, score: scores[0] },
        { criterionId: criterionIds.delivery_execution, score: scores[1] },
        { criterionId: criterionIds.communication_teamwork, score: scores[2] },
        { criterionId: criterionIds.growth_ownership, score: scores[3] },
      ],
    });
    expect(patch.status).toBe(200);
    const submitted = await request(apiBase()).post(`/api/v1/evaluations/${evaluationId}/submit`).set('Authorization', `Bearer ${token}`);
    expect(submitted.status).toBe(201);
    const finalized = await request(apiBase()).post(`/api/v1/evaluations/${evaluationId}/finalize`).set('Authorization', `Bearer ${token}`);
    expect(finalized.status).toBe(201);
    return evaluationId;
  }

  it('setup: logins + session/project/sprint/cycle/assignments', async () => {
    admin = await login(EMAILS.admin);
    si = await login(EMAILS.si);
    k1 = await login(EMAILS.k1);
    k2 = await login(EMAILS.k2);
    await login(EMAILS.k3); // auth sanity only — k3 assertions go through admin views
    k1Id = await userIdByEmail(EMAILS.k1);
    k2Id = await userIdByEmail(EMAILS.k2);
    k3Id = await userIdByEmail(EMAILS.k3);
    i2Id = await userIdByEmail(EMAILS.i2);

    const session = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${admin}`).send({
      code: `E2E-E5B-S-${RUN}`, name: 'KPI session', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(session.status).toBe(201);
    sessionId = session.body.id;
    await request(apiBase()).patch(`/api/v1/sessions/${sessionId}`).set('Authorization', `Bearer ${admin}`).send({ status: 'active' });

    const project = await request(apiBase()).post('/api/v1/projects').set('Authorization', `Bearer ${admin}`).send({
      code: `E2E-E5B-P-${RUN}`, name: 'KPI project', description: 'KPI e2e project', status: 'active', technologies: [],
    });
    expect(project.status).toBe(201);
    projectId = project.body.id;

    const sprint = await request(apiBase()).post('/api/v1/sprints').set('Authorization', `Bearer ${admin}`).send({
      code: `E2E-E5B-SP-${RUN}`, name: 'KPI sprint', projectId, sessionId,
      startDate: new Date(Date.now() - 86_400_000).toISOString(), endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    expect(sprint.status).toBe(201);
    sprintId = sprint.body.id;
    const activated = await request(apiBase()).post(`/api/v1/sprints/${sprintId}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'active' });
    expect(activated.status).toBe(200);

    await query(`INSERT INTO session_instructors (sessionId, instructorId, assignedAt) VALUES (@0, @1, SYSUTCDATETIME())`, [sessionId, await userIdByEmail(EMAILS.si)]);

    const cycle = await request(apiBase()).post('/api/v1/evaluation-cycles').set('Authorization', `Bearer ${si}`).send({
      code: `E2E-E5B-CY-${RUN}`, name: 'KPI cycle', sessionId, type: 'sprint',
      startDate: new Date(Date.now() - 86_400_000).toISOString(), endDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    expect(cycle.status).toBe(201);
    cycleId = cycle.body.id;
    const criteria = await request(apiBase()).get(`/api/v1/evaluation-cycles/${cycleId}/criteria`).set('Authorization', `Bearer ${si}`);
    for (const c of criteria.body.items) criterionIds[c.code] = c.id;
    const opened = await request(apiBase()).post(`/api/v1/evaluation-cycles/${cycleId}/status`).set('Authorization', `Bearer ${si}`).send({ status: 'open' });
    expect(opened.status).toBe(200);

    // Recruitment PASSED fixtures (k1/k2/k3); i2 stays NOT recruited.
    await ensureRecruitedProfile(dataSource, k1Id);
    await ensureRecruitedProfile(dataSource, k2Id);
    await ensureRecruitedProfile(dataSource, k3Id);

    await assignIntern(k1Id);
    await assignIntern(k2Id);
    await assignIntern(k3Id);
    await assignIntern(i2Id); // assigned but NOT recruited → excluded from KPI eligibility
  });

  it('KPI source facts: k1 delivery 80 + quality 90 + NO due dates; k3 task rate + timeliness; k2 nothing', async () => {
    // k1: SP 8/10 done (80), no due dates anywhere → timeliness unavailable
    const k1t1 = await createTask({ title: 'K1-T1', assigneeId: k1Id, storyPoints: 3 });
    const k1t2 = await createTask({ title: 'K1-T2', assigneeId: k1Id, storyPoints: 5 });
    await createTask({ title: 'K1-T3', assigneeId: k1Id, storyPoints: 2 }); // stays todo
    await driveToDone(k1t1);
    await driveToDone(k1t2);
    // k1t3 stays todo → completed SP 8 / committed 10 = 80

    // k1 quality: finalized evaluation exactly 90 (90/90/90/90)
    await finalizeEvaluationFor(k1Id, si, [90, 90, 90, 90]);

    // k3: task rate 50 (1 of 2 done), timeliness 100 (done met its due date)
    const k3t1 = await createTask({ title: 'K3-T1', assigneeId: k3Id, dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    await createTask({ title: 'K3-T2', assigneeId: k3Id });
    await driveToDone(k3t1); // done before due → on-time 1/1

    // k2: no tasks, no evaluation at all
  });

  it('KPI period: open → calculate → EXACT kpi-v1 results + provenance', async () => {
    const from = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const created = await request(apiBase()).post('/api/v1/kpi-periods').set('Authorization', `Bearer ${admin}`).send({
      code: `E2E-E5B-KPI-${RUN}`, name: 'KPI period 1', startDate: from, endDate: to,
    });
    expect(created.status).toBe(201);
    periodId = created.body.id;
    expect(created.body.ruleVersion).toBe('kpi-v1');

    // draft not calculable
    const draftBlocked = await request(apiBase()).post(`/api/v1/kpi-periods/${periodId}/calculate`).set('Authorization', `Bearer ${admin}`);
    expect(draftBlocked.status).toBe(409);
    expect(draftBlocked.body.code).toBe('KPI_PERIOD_NOT_CALCULABLE');

    const opened = await request(apiBase()).post(`/api/v1/kpi-periods/${periodId}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'open' });
    expect(opened.status).toBe(201);
    expect(opened.body.status).toBe('open');

    const calculated = await request(apiBase()).post(`/api/v1/kpi-periods/${periodId}/calculate`).set('Authorization', `Bearer ${admin}`);
    expect(calculated.status).toBe(201);
    // k1 + k3 eligible; k2 has NO overlapping assignment activity beyond existence… k2 IS assigned (active) → eligible but insufficient_data.
    // i2 (not recruited) never appears.
    expect(calculated.body.calculated).toBe(2);
    expect(calculated.body.insufficientData).toBe(1);

    const results = await request(apiBase()).get(`/api/v1/kpi-periods/${periodId}/results`).set('Authorization', `Bearer ${admin}`);
    expect(results.status).toBe(200);
    const byUser = new Map<string, { userId: string; finalScore: string | number; status: string; id: string }>(
      results.body.items.map((r: { userId: string }) => [r.userId, r]),
    );
    expect(byUser.size).toBe(3);
    expect(byUser.has(i2Id)).toBe(false);

    const k1Result = byUser.get(k1Id)!;
    expect(k1Result.status).toBe('calculated');
    expect(Number(k1Result.finalScore)).toBe(83.8); // (80×50 + 90×30)/80 = 83.75 → 83.8

    const k1Detail = await request(apiBase()).get(`/api/v1/kpi-results/${k1Result.id}`).set('Authorization', `Bearer ${admin}`);
    expect(k1Detail.status).toBe(200);
    const metrics = k1Detail.body.metrics as Array<{ metricCode: string; sourceValue: string | null; configuredWeight: string; effectiveWeight: string | null; weightedContribution: string | null }>;
    expect(metrics).toHaveLength(3);
    const delivery = metrics.find((m) => m.metricCode === 'delivery')!;
    const quality = metrics.find((m) => m.metricCode === 'quality')!;
    const timeliness = metrics.find((m) => m.metricCode === 'timeliness')!;
    expect(Number(delivery.sourceValue)).toBe(80);
    expect(Number(quality.sourceValue)).toBe(90);
    expect(timeliness.sourceValue).toBeNull();
    expect(timeliness.effectiveWeight).toBeNull();
    expect(timeliness.weightedContribution).toBeNull();
    // effective weights renormalize over available 80: 50→62.5, 30→37.5
    expect(Number(delivery.effectiveWeight)).toBe(62.5);
    expect(Number(quality.effectiveWeight)).toBe(37.5);
    expect(k1Detail.body.result.ruleVersion).toBe('kpi-v1');

    const k3Result = byUser.get(k3Id)!;
    expect(Number(k3Result.finalScore)).toBe(64.3); // (50×50 + 100×20)/70 = 64.2857 → 64.3

    const k2Result = byUser.get(k2Id)!;
    expect(k2Result.status).toBe('insufficient_data');
    expect(k2Result.finalScore).toBeNull();

    // RELOAD: identical results (no dynamic recompute) — recalculate is idempotent
    const recalculated = await request(apiBase()).post(`/api/v1/kpi-periods/${periodId}/calculate`).set('Authorization', `Bearer ${admin}`);
    expect(recalculated.status).toBe(201);
    const again = await request(apiBase()).get(`/api/v1/kpi-periods/${periodId}/results`).set('Authorization', `Bearer ${admin}`);
    const byUserAgain = new Map<string, { userId: string; finalScore: string | number; status: string; id: string }>(
      again.body.items.map((r: { userId: string; finalScore: string | number; status: string; id: string }) => [r.userId, r]),
    );
    expect(Number(byUserAgain.get(k1Id)!.finalScore)).toBe(83.8);
    expect(byUserAgain.get(k1Id)!.id).toBe(k1Result.id); // same row upserted, never duplicated
    const rowCount = await query(`SELECT COUNT(*) AS n FROM kpi_results WHERE periodId = @0`, [periodId]);
    expect(Number(rowCount[0].n)).toBe(3);
  });

  it('KPI finalize: locks the period; recalculation + edit rejected; intern sees own result', async () => {
    const finalized = await request(apiBase()).post(`/api/v1/kpi-periods/${periodId}/finalize`).set('Authorization', `Bearer ${admin}`);
    expect(finalized.status).toBe(201);
    expect(finalized.body.status).toBe('finalized');

    const recalc = await request(apiBase()).post(`/api/v1/kpi-periods/${periodId}/calculate`).set('Authorization', `Bearer ${admin}`);
    expect(recalc.status).toBe(409);
    expect(recalc.body.code).toBe('KPI_ALREADY_FINALIZED');

    const doubleFinalize = await request(apiBase()).post(`/api/v1/kpi-periods/${periodId}/finalize`).set('Authorization', `Bearer ${admin}`);
    expect(doubleFinalize.status).toBe(409);
    expect(doubleFinalize.body.code).toBe('KPI_ALREADY_FINALIZED');

    const notifications = await query(
      `SELECT COUNT(*) AS n FROM notifications WHERE userId = @0 AND type = 'kpi.finalized'`,
      [k1Id],
    );
    expect(Number(notifications[0].n)).toBe(1);
    // insufficient_data intern NOT notified
    const k2Notifications = await query(
      `SELECT COUNT(*) AS n FROM notifications WHERE userId = @0 AND type = 'kpi.finalized'`,
      [k2Id],
    );
    expect(Number(k2Notifications[0].n)).toBe(0);

    const mine = await request(apiBase()).get('/api/v1/intern/me/kpi').set('Authorization', `Bearer ${k1}`);
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(1);
    expect(Number(mine.body.items[0].finalScore)).toBe(83.8);

    const foreign = await request(apiBase()).get(`/api/v1/intern/me/kpi/${mine.body.items[0].id}`).set('Authorization', `Bearer ${k2}`);
    expect(foreign.status).toBe(404);
  });

  it('virtual salary: CONFIG_MISSING honesty, then 8,380,000 exact, idempotent regeneration', async () => {
    // Invalid base → honest 409 (never an invented number, spec 34)
    await request(apiBase()).patch('/api/v1/settings').set('Authorization', `Bearer ${admin}`).send({
      key: 'virtual_salary.base_amount', value: 'not-a-number',
    });
    const missing = await request(apiBase()).post(`/api/v1/virtual-salary/generate/${periodId}`).set('Authorization', `Bearer ${admin}`);
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe('VIRTUAL_SALARY_CONFIG_MISSING');

    await request(apiBase()).patch('/api/v1/settings').set('Authorization', `Bearer ${admin}`).send({
      key: 'virtual_salary.base_amount', value: '10000000',
    });
    await request(apiBase()).patch('/api/v1/settings').set('Authorization', `Bearer ${admin}`).send({
      key: 'virtual_salary.unit', value: 'VND_VIRTUAL',
    });

    const first = await request(apiBase()).post(`/api/v1/virtual-salary/generate/${periodId}`).set('Authorization', `Bearer ${admin}`);
    expect(first.status).toBe(201);
    expect(first.body.generated).toBe(2); // k1 + k3 (calculated)
    expect(first.body.skipped).toBe(0);
    expect(first.body.unit).toBe('VND_VIRTUAL');

    // k1 earning: 10,000,000 × 83.8% = 8,380,000 (spec 35 example)
    const k1Rows = await query(
      `SELECT amount, type FROM virtual_salary_ledger WHERE userId = @0 AND type = 'kpi_earning'`,
      [k1Id],
    );
    expect(k1Rows).toHaveLength(1);
    expect(Number(k1Rows[0].amount)).toBe(8_380_000);

    // Second generation: ZERO new rows (UNIQUE idempotencyKey, spec 36)
    const second = await request(apiBase()).post(`/api/v1/virtual-salary/generate/${periodId}`).set('Authorization', `Bearer ${admin}`);
    expect(second.status).toBe(201);
    expect(second.body.generated).toBe(0);
    expect(second.body.skipped).toBe(2);
    const total = await query(`SELECT COUNT(*) AS n FROM virtual_salary_ledger WHERE kpiPeriodId = @0`, [periodId]);
    expect(Number(total[0].n)).toBe(2);
  });

  it('virtual salary: bonus/penalty/reversal adjustments + ledger-derived balance (spec 84)', async () => {
    const bonus = await request(apiBase()).post('/api/v1/virtual-salary/adjustments').set('Authorization', `Bearer ${admin}`).send({
      userId: k1Id, type: 'bonus', amount: 500_000, reason: 'On-time delivery bonus',
    });
    expect(bonus.status).toBe(201);
    expect(Number(bonus.body.amount)).toBe(500_000);
    const bonusId = bonus.body.id as string;

    const penalty = await request(apiBase()).post('/api/v1/virtual-salary/adjustments').set('Authorization', `Bearer ${admin}`).send({
      userId: k1Id, type: 'penalty', amount: 200_000, reason: 'Late review escalation',
    });
    expect(penalty.status).toBe(201);
    expect(Number(penalty.body.amount)).toBe(-200_000); // stored NEGATIVE

    const zero = await request(apiBase()).post('/api/v1/virtual-salary/adjustments').set('Authorization', `Bearer ${admin}`).send({
      userId: k1Id, type: 'bonus', amount: 0, reason: 'invalid',
    });
    expect(zero.status).toBe(409);
    expect(zero.body.code).toBe('VIRTUAL_SALARY_INVALID_ADJUSTMENT');

    // Balance: 8,380,000 + 500,000 − 200,000 = 8,680,000 (SUM of the ledger)
    const balance = await request(apiBase()).get(`/api/v1/virtual-salary/users/${k1Id}/balance`).set('Authorization', `Bearer ${admin}`);
    expect(balance.status).toBe(200);
    expect(Number(balance.body.balance)).toBe(8_680_000);
    expect(balance.body.virtual).toBe(true);
    expect(balance.body.unit).toBe('VND_VIRTUAL');

    // Reversal of the bonus: derived −500,000; double reversal → 409
    const reversal = await request(apiBase()).post('/api/v1/virtual-salary/adjustments').set('Authorization', `Bearer ${admin}`).send({
      userId: k1Id, type: 'reversal', sourceId: bonusId, reason: 'Bonus issued in error',
    });
    expect(reversal.status).toBe(201);
    expect(Number(reversal.body.amount)).toBe(-500_000);
    const doubleReversal = await request(apiBase()).post('/api/v1/virtual-salary/adjustments').set('Authorization', `Bearer ${admin}`).send({
      userId: k1Id, type: 'reversal', sourceId: bonusId, reason: 'again',
    });
    expect(doubleReversal.status).toBe(409);
    expect(doubleReversal.body.code).toBe('VIRTUAL_SALARY_ALREADY_REVERSED');

    const balanceAfter = await request(apiBase()).get(`/api/v1/virtual-salary/users/${k1Id}/balance`).set('Authorization', `Bearer ${admin}`);
    expect(Number(balanceAfter.body.balance)).toBe(8_180_000);

    // Intern own views
    const mine = await request(apiBase()).get('/api/v1/intern/me/virtual-salary').set('Authorization', `Bearer ${k1}`);
    expect(mine.status).toBe(200);
    expect(Number(mine.body.balance)).toBe(8_180_000);
    expect(mine.body.virtual).toBe(true);
    const ledger = await request(apiBase()).get('/api/v1/intern/me/virtual-salary/ledger').set('Authorization', `Bearer ${k1}`);
    expect(ledger.status).toBe(200);
    expect(ledger.body.items).toHaveLength(4); // earning + bonus + penalty + reversal
  });

  it('certificates: concurrent double issue → exactly ONE certificate (spec 87)', async () => {
    const [a, b] = await Promise.all([
      request(apiBase()).post('/api/v1/certificates/issue').set('Authorization', `Bearer ${admin}`).send({ userId: k1Id }),
      request(apiBase()).post('/api/v1/certificates/issue').set('Authorization', `Bearer ${admin}`).send({ userId: k1Id }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const rows = await query(`SELECT COUNT(*) AS n FROM certificates WHERE userId = @0`, [k1Id]);
    expect(Number(rows[0].n)).toBe(1);
  });

  it('certificates: issued shape, notification, public verify, real PDF', async () => {
    const mine = await request(apiBase()).get('/api/v1/intern/me/certificates').set('Authorization', `Bearer ${k1}`);
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(1);
    const certificate = mine.body.items[0];
    expect(certificate.certificateNumber).toMatch(/^VINT-\d{4}-\d{8}$/);
    expect(certificate.status).toBe('issued');
    expect(certificate.policyCode).toBe('V-INTERN-COMPLETE');
    expect(certificate.policyVersion).toBe(1);

    const notification = await query(
      `SELECT COUNT(*) AS n FROM notifications WHERE userId = @0 AND type = 'certificate.issued'`,
      [k1Id],
    );
    expect(Number(notification[0].n)).toBe(1);

    // PUBLIC verify (no auth header at all)
    const verify = await request(apiBase()).get(`/api/v1/certificates/verify/${certificate.verificationCode}`);
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(true);
    expect(verify.body.status).toBe('issued');
    expect(verify.body.certificateNumber).toBe(certificate.certificateNumber);
    expect(verify.body.holderName).toBeTruthy();
    // SAFE fields only — no email/userId/evaluation/KPI internals (spec 48)
    expect(verify.body.email).toBeUndefined();
    expect(verify.body.userId).toBeUndefined();

    const unknown = await request(apiBase()).get('/api/v1/certificates/verify/does-not-exist-code');
    expect(unknown.status).toBe(404);

    // REAL PDF: intern own + admin
    const pdf = await request(apiBase())
      .get(`/api/v1/intern/me/certificates/${certificate.id}/pdf`)
      .set('Authorization', `Bearer ${k1}`)
      .buffer().parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const body = pdf.body as Buffer;
    expect(body.length).toBeGreaterThan(2000);
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(body.toString('latin1')).toContain(certificate.certificateNumber);

    const adminPdf = await request(apiBase())
      .get(`/api/v1/certificates/${certificate.id}/pdf`)
      .set('Authorization', `Bearer ${admin}`);
    expect(adminPdf.status).toBe(200);

    // foreign intern cannot fetch someone else's PDF
    const foreignPdf = await request(apiBase())
      .get(`/api/v1/intern/me/certificates/${certificate.id}/pdf`)
      .set('Authorization', `Bearer ${k2}`);
    expect(foreignPdf.status).toBe(404);
  });

  it('certificates: each major ineligibility reason surfaces separately (spec 86)', async () => {
    // NOT recruited (i2): recruitment_passed fails
    const notRecruited = await request(apiBase()).post('/api/v1/certificates/issue').set('Authorization', `Bearer ${admin}`).send({ userId: i2Id });
    expect(notRecruited.status).toBe(409);
    expect(notRecruited.body.code).toBe('CERTIFICATE_NOT_ELIGIBLE');
    const reasons1 = notRecruited.body.details.reasons as Array<{ requirement: string; satisfied: boolean }>;
    expect(reasons1.find((r) => r.requirement === 'recruitment_passed')?.satisfied).toBe(false);

    // recruited + assigned but NO evaluation/KPI (k2)
    const noEval = await request(apiBase()).post('/api/v1/certificates/issue').set('Authorization', `Bearer ${admin}`).send({ userId: k2Id });
    expect(noEval.status).toBe(409);
    const reasons2 = noEval.body.details.reasons as Array<{ requirement: string; satisfied: boolean }>;
    expect(reasons2.find((r) => r.requirement === 'finalized_evaluation')?.satisfied).toBe(false);
    expect(reasons2.find((r) => r.requirement === 'finalized_kpi')?.satisfied).toBe(false);

    // recruited + active assignment but NOT completed + no eval (k3)
    const notCompleted = await request(apiBase()).post('/api/v1/certificates/issue').set('Authorization', `Bearer ${admin}`).send({ userId: k3Id });
    expect(notCompleted.status).toBe(409);
    const reasons3 = notCompleted.body.details.reasons as Array<{ requirement: string; satisfied: boolean }>;
    expect(reasons3.find((r) => r.requirement === 'completed_assignment')?.satisfied).toBe(false);
    const noRows = await query(`SELECT COUNT(*) AS n FROM certificates WHERE userId IN (@0, @1, @2)`, [i2Id, k2Id, k3Id]);
    expect(Number(noRows[0].n)).toBe(0);
  });

  it('certificates: revoke flow — preserved record, verify shows revoked, PDF blocked (spec 50/85)', async () => {
    const mine = await request(apiBase()).get('/api/v1/intern/me/certificates').set('Authorization', `Bearer ${k1}`);
    const certificate = mine.body.items[0];

    const revoked = await request(apiBase()).post(`/api/v1/certificates/${certificate.id}/revoke`).set('Authorization', `Bearer ${admin}`).send({
      reason: 'Credential misuse investigation',
    });
    expect(revoked.status).toBe(201);
    expect(revoked.body.status).toBe('revoked');
    expect(revoked.body.revokedAt).not.toBeNull();
    expect(revoked.body.revokeReason).toBe('Credential misuse investigation');

    const doubleRevoke = await request(apiBase()).post(`/api/v1/certificates/${certificate.id}/revoke`).set('Authorization', `Bearer ${admin}`).send({
      reason: 'again',
    });
    expect(doubleRevoke.status).toBe(409);
    expect(doubleRevoke.body.code).toBe('CERTIFICATE_ALREADY_REVOKED');

    const verify = await request(apiBase()).get(`/api/v1/certificates/verify/${certificate.verificationCode}`);
    expect(verify.status).toBe(200);
    expect(verify.body.valid).toBe(false);
    expect(verify.body.status).toBe('revoked');
    expect(verify.body.revokedAt).toBeTruthy();

    const pdf = await request(apiBase())
      .get(`/api/v1/intern/me/certificates/${certificate.id}/pdf`)
      .set('Authorization', `Bearer ${k1}`);
    expect(pdf.status).toBe(409);
    expect(pdf.body.code).toBe('CERTIFICATE_ALREADY_REVOKED');

    const revocationNotification = await query(
      `SELECT COUNT(*) AS n FROM notifications WHERE userId = @0 AND type = 'certificate.revoked'`,
      [k1Id],
    );
    expect(Number(revocationNotification[0].n)).toBe(1);
    // record preserved — never physically deleted (spec 45)
    const rows = await query(`SELECT COUNT(*) AS n FROM certificates WHERE userId = @0`, [k1Id]);
    expect(Number(rows[0].n)).toBe(1);
  });

  it('KPI concurrency: parallel calculations never duplicate results (spec 87)', async () => {
    // k1's certificate is revoked; make a fresh OPEN period and race two calculates.
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const created = await request(apiBase()).post('/api/v1/kpi-periods').set('Authorization', `Bearer ${admin}`).send({
      code: `E2E-E5B-KPI2-${RUN}`, name: 'KPI race', startDate: from, endDate: to,
    });
    expect(created.status).toBe(201);
    const racePeriodId = created.body.id as string;

    const [r1, r2] = await Promise.all([
      request(apiBase()).post(`/api/v1/kpi-periods/${racePeriodId}/calculate`).set('Authorization', `Bearer ${admin}`),
      request(apiBase()).post(`/api/v1/kpi-periods/${racePeriodId}/calculate`).set('Authorization', `Bearer ${admin}`),
    ]);
    // Deterministic DB outcome matters, not which request wins:
    for (const r of [r1, r2]) expect([201, 409]).toContain(r.status);
    const rows = await query(`SELECT COUNT(*) AS n FROM kpi_results WHERE periodId = @0`, [racePeriodId]);
    expect(Number(rows[0].n)).toBe(3); // k1, k2, k3 — exactly once each
    const period = await request(apiBase()).get(`/api/v1/kpi-periods/${racePeriodId}`).set('Authorization', `Bearer ${admin}`);
    expect(['open', 'finalized']).toContain(period.body.status);
  });
});
