import { createDatabaseSql } from '../src/database/create-database-sql';
import { createConnection } from 'node:net';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
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
 * PHASE 5 — EVALUATION + PERFORMANCE e2e (spec 80/81) on REAL SQL Server.
 *
 * Evaluation flow: recruited-style session scoping, criteria weights,
 * template V1, backend-computed weighted overall (85/90/72/80 ×
 * 35/30/20/15 → 83.2 exactly), finalize immutability + notification +
 * audit + activity, privileged revision (83.2 → 84.9), ownership
 * (spec 61), closed-cycle rejection.
 *
 * Performance: REAL sprint/tasks with story points, due dates and status
 * histories (done-at shifted via SQL for deterministic on-time), then
 * EXACT metric assertions — no fake constants anywhere.
 *
 * SAFETY: refuses to run without E2E_DB_NAME (disposable DB contract).
 */

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

const DB_HOST = process.env.DB_HOST ?? 'localhost';
const DB_PORT = Number(process.env.DB_PORT ?? 1433);
const DB_NAME = process.env.E2E_DB_NAME ?? '';
const DB_USER = process.env.DB_USERNAME ?? 'vintern_app';
const DB_PASS = process.env.DB_PASSWORD ?? '';

const RUN = Date.now().toString(36);
const EMAILS = {
  admin: `e2e-e5-admin-${RUN}@vintern.test`,
  si: `e2e-e5-si-${RUN}@vintern.test`, // session instructor + project mentor
  ix: `e2e-e5-ix-${RUN}@vintern.test`, // unrelated instructor (negative ownership)
  i1: `e2e-e5-i1-${RUN}@vintern.test`, // intern with full data
  i2: `e2e-e5-i2-${RUN}@vintern.test`, // intern with NO data
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
    options: { useUTC: true, encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false', trustServerCertificate: true }, logging: false,
  });
  await adminDs.initialize();
  await adminDs.query(createDatabaseSql(DB_NAME, process.env.DB_FILES_ROOT));
  await adminDs.destroy();

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
    { email: EMAILS.admin, username: `e2e-e5-admin-${RUN}`, roleId: adminRole.id },
    { email: EMAILS.si, username: `e2e-e5-si-${RUN}`, roleId: instructorRole.id },
    { email: EMAILS.ix, username: `e2e-e5-ix-${RUN}`, roleId: instructorRole.id },
    { email: EMAILS.i1, username: `e2e-e5-i1-${RUN}`, roleId: internRole.id },
    { email: EMAILS.i2, username: `e2e-e5-i2-${RUN}`, roleId: internRole.id },
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

describe('Phase 5 evaluation + performance e2e (spec 80/81)', () => {
  let admin: string;
  let si: string;
  let ix: string;
  let i1: string;
  let i2: string;
  let sessionId: string;
  let projectId: string;
  let cycleId: string;
  const criterionIds: Record<string, string> = {};
  let evaluationId: string;
  let sprintId: string;
  let i1UserId: string;
  let i2UserId: string;

  it('setup: logins + session/project/assignments', async () => {
    admin = await login(EMAILS.admin);
    si = await login(EMAILS.si);
    ix = await login(EMAILS.ix);
    i1 = await login(EMAILS.i1);
    i2 = await login(EMAILS.i2);
    i1UserId = await userIdByEmail(EMAILS.i1);
    i2UserId = await userIdByEmail(EMAILS.i2);

    const session = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${admin}`).send({
      code: `E2E-E5-S-${RUN}`, name: 'Phase 5 session', startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z',
    });
    expect(session.status).toBe(201);
    sessionId = session.body.id;
    const activated = await request(apiBase()).patch(`/api/v1/sessions/${sessionId}`).set('Authorization', `Bearer ${admin}`).send({ status: 'active' });
    expect(activated.status).toBe(200); // PATCH default

    const project = await request(apiBase()).post('/api/v1/projects').set('Authorization', `Bearer ${admin}`).send({
      code: `E2E-E5-P-${RUN}`, name: 'Phase 5 project', description: 'Deterministic e2e project', status: 'active', mentorId: undefined, technologies: [],
    });
    expect(project.status).toBe(201);
    projectId = project.body.id;

    // Phase 4 lifecycle (spec 46): assignment REQUIRES a passed recruitment
    // profile — the suites seed it directly (same pattern as Phase 2/3 e2e).
    await ensureRecruitedProfile(dataSource, i1UserId);
    await ensureRecruitedProfile(dataSource, i2UserId);
    for (const internUserId of [i1UserId, i2UserId]) {
      const created = await request(apiBase()).post('/api/v1/assignments').set('Authorization', `Bearer ${admin}`).send({
        internId: internUserId,
        projectId,
        sessionId,
      });
      expect(created.status).toBe(201);
    }

    // si becomes session instructor (evaluations.view/manage scoping)
    await query(
      `INSERT INTO session_instructors (sessionId, instructorId, assignedAt) VALUES (@0, @1, SYSUTCDATETIME())`,
      [sessionId, await userIdByEmail(EMAILS.si)],
    );
  });

  it('cycle: template V1 criteria seeded; weights ≠ 100 blocks open; criteria editable only in draft', async () => {
    const created = await request(apiBase()).post('/api/v1/evaluation-cycles').set('Authorization', `Bearer ${si}`).send({
      code: `E2E-E5-CY-${RUN}`, name: 'Sprint 1 evaluation', sessionId, type: 'sprint',
      startDate: '2026-02-01T00:00:00.000Z', endDate: '2026-03-01T00:00:00.000Z',
    });
    expect(created.status).toBe(201);
    cycleId = created.body.id;
    expect(created.body.status).toBe('draft');

    const criteria = await request(apiBase()).get(`/api/v1/evaluation-cycles/${cycleId}/criteria`).set('Authorization', `Bearer ${si}`);
    expect(criteria.status).toBe(200);
    expect(criteria.body.items.map((c: { code: string; weight: string }) => c.code)).toEqual([
      'technical_quality', 'delivery_execution', 'communication_teamwork', 'growth_ownership',
    ]);
    for (const c of criteria.body.items) criterionIds[c.code] = c.id;

    // criteria editable in draft: add a +10 criterion → weights 110 → open blocked
    const extra = await request(apiBase()).post(`/api/v1/evaluation-cycles/${cycleId}/criteria`).set('Authorization', `Bearer ${si}`).send({
      code: 'temp_extra', name: 'Tạm', weight: 10,
    });
    expect(extra.status).toBe(201);
    const blockedOpen = await request(apiBase()).post(`/api/v1/evaluation-cycles/${cycleId}/status`).set('Authorization', `Bearer ${si}`).send({ status: 'open' });
    expect(blockedOpen.status).toBe(409);
    expect(blockedOpen.body.code).toBe('EVALUATION_WEIGHT_INVALID');
    const removed = await request(apiBase()).delete(`/api/v1/evaluation-cycles/${cycleId}/criteria/${extra.body.id}`).set('Authorization', `Bearer ${si}`);
    expect(removed.status).toBe(200);
  });

  it('open cycle; unrelated instructor is 403 (ownership, spec 61); intern out of scope → 409', async () => {
    const opened = await request(apiBase()).post(`/api/v1/evaluation-cycles/${cycleId}/status`).set('Authorization', `Bearer ${si}`).send({ status: 'open' });
    expect(opened.status).toBe(201); // Nest POST default
    expect(opened.body.status).toBe('open');

    const foreign = await request(apiBase()).post('/api/v1/evaluations').set('Authorization', `Bearer ${ix}`).send({
      cycleId, internId: i1UserId,
    });
    expect(foreign.status).toBe(403);
    expect(foreign.body.code).toBe('EVALUATION_SCOPE_FORBIDDEN');
  });

  it('evaluation: scores → EXACT 83.2 backend overall; submit; finalize; immutability', async () => {
    const created = await request(apiBase()).post('/api/v1/evaluations').set('Authorization', `Bearer ${si}`).send({
      cycleId, internId: i1UserId,
    });
    expect(created.status).toBe(201);
    evaluationId = created.body.id;
    expect(created.body.status).toBe('draft');

    // out-of-bounds score rejected
    const bad = await request(apiBase()).patch(`/api/v1/evaluations/${evaluationId}`).set('Authorization', `Bearer ${si}`).send({
      scores: [{ criterionId: criterionIds.technical_quality, score: 150 }],
    });
    // The DTO whitelist is the documented FIRST line of defense
    // (150 > 100 → VALIDATION_ERROR — the same layering the Phase 4 role
    // whitelist established); the service-level EVALUATION_SCORE_OUT_OF_BOUNDS
    // stays as the safety net for scores within 0..100 that exceed a
    // criterion's maxScore.
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');

    // foreign evaluator cannot edit
    const foreignEdit = await request(apiBase()).patch(`/api/v1/evaluations/${evaluationId}`).set('Authorization', `Bearer ${ix}`).send({
      scores: [{ criterionId: criterionIds.technical_quality, score: 50 }],
    });
    expect(foreignEdit.status).toBe(403);

    const scored = await request(apiBase()).patch(`/api/v1/evaluations/${evaluationId}`).set('Authorization', `Bearer ${si}`).send({
      scores: [
        { criterionId: criterionIds.technical_quality, score: 85 },
        { criterionId: criterionIds.delivery_execution, score: 90 },
        { criterionId: criterionIds.communication_teamwork, score: 72 },
        { criterionId: criterionIds.growth_ownership, score: 80 },
      ],
      summary: 'Kỹ thuật tốt, cần cải thiện giao tiếp.',
    });
    expect(scored.status).toBe(200);
    // (85×35 + 90×30 + 72×20 + 80×15)/100 = 83.15 → 83.2 (half-up)
    expect(Number(scored.body.evaluation.overallScore)).toBe(83.2);

    const submitted = await request(apiBase()).post(`/api/v1/evaluations/${evaluationId}/submit`).set('Authorization', `Bearer ${si}`);
    expect(submitted.status).toBe(201);
    expect(submitted.body.evaluation.status).toBe('submitted');

    // finalize by a NON-owner instructor → 403 even with evaluations.manage
    const foreignFinalize = await request(apiBase()).post(`/api/v1/evaluations/${evaluationId}/finalize`).set('Authorization', `Bearer ${ix}`);
    expect(foreignFinalize.status).toBe(403);

    const finalized = await request(apiBase()).post(`/api/v1/evaluations/${evaluationId}/finalize`).set('Authorization', `Bearer ${si}`);
    expect(finalized.status).toBe(201);
    expect(finalized.body.evaluation.status).toBe('finalized');
    expect(Number(finalized.body.evaluation.overallScore)).toBe(83.2);
    expect(finalized.body.evaluation.finalizedAt).not.toBeNull();

    // immutable: further edit + second finalize → 409
    const editAfter = await request(apiBase()).patch(`/api/v1/evaluations/${evaluationId}`).set('Authorization', `Bearer ${si}`).send({
      scores: [{ criterionId: criterionIds.technical_quality, score: 10 }],
    });
    expect(editAfter.status).toBe(409);
    expect(editAfter.body.code).toBe('EVALUATION_ALREADY_FINALIZED');
    const doubleFinalize = await request(apiBase()).post(`/api/v1/evaluations/${evaluationId}/finalize`).set('Authorization', `Bearer ${si}`);
    expect(doubleFinalize.status).toBe(409);
    expect(doubleFinalize.body.code).toBe('EVALUATION_ALREADY_FINALIZED');
  });

  it('finalize emitted notification + audit + activity in ONE transaction', async () => {
    for (const path of [`/evaluation-cycles/${cycleId}`, `/evaluation-cycles/${cycleId}/criteria`, `/evaluations/${evaluationId}`]) {
      const denied = await request(apiBase()).get('/api/v1' + path).set('Authorization', `Bearer ${ix}`);
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('EVALUATION_SCOPE_FORBIDDEN');
    }
    const ownCycles = await request(apiBase()).get(`/api/v1/evaluation-cycles?sessionId=${sessionId}`).set('Authorization', `Bearer ${si}`);
    expect(ownCycles.status).toBe(200);
    expect(ownCycles.body.items.some((c: { id: string }) => c.id === cycleId)).toBe(true);
    await request(apiBase()).get('/api/v1/evaluation-cycles?pageSize=1001').set('Authorization', `Bearer ${si}`).expect(400);
    const foreignCycles = await request(apiBase()).get(`/api/v1/evaluation-cycles?sessionId=${sessionId}`).set('Authorization', `Bearer ${ix}`);
    expect(foreignCycles.status).toBe(200);
    expect(foreignCycles.body.items).toEqual([]);
    const foreignEvaluations = await request(apiBase()).get(`/api/v1/evaluations?cycleId=${cycleId}`).set('Authorization', `Bearer ${ix}`);
    expect(foreignEvaluations.status).toBe(200);
    expect(foreignEvaluations.body.items).toEqual([]);
    const notifications = await query(
      `SELECT COUNT(*) AS n FROM notifications WHERE userId = @0 AND type = 'evaluation.finalized'`,
      [i1UserId],
    );
    expect(Number(notifications[0].n)).toBe(1);
    const audits = await query(
      `SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'evaluation.finalized' AND targetId = @0`,
      [evaluationId],
    );
    expect(Number(audits[0].n)).toBe(1);
    const activities = await query(
      `SELECT COUNT(*) AS n FROM activity_events WHERE module = 'evaluation' AND action = 'finalized' AND targetId = @0`,
      [evaluationId],
    );
    expect(Number(activities[0].n)).toBe(1);
  });

  it('privileged revision (admin only): 83.2 → 84.9 with an immutable revision row', async () => {
    const denied = await request(apiBase()).post(`/api/v1/evaluations/${evaluationId}/revisions`).set('Authorization', `Bearer ${ix}`).send({
      reason: 'instructor cannot revise',
    });
    expect(denied.status).toBe(403);

    const revised = await request(apiBase()).post(`/api/v1/evaluations/${evaluationId}/revisions`).set('Authorization', `Bearer ${admin}`).send({
      scores: [{ criterionId: criterionIds.technical_quality, score: 90 }],
      reason: 'Admin correction: technical score mis-keyed',
    });
    expect(revised.status).toBe(201);
    expect(revised.body.evaluation.status).toBe('finalized');
    // (90×35 + 90×30 + 72×20 + 80×15)/100 = 84.9
    expect(Number(revised.body.evaluation.overallScore)).toBe(84.9);
    expect(Number(revised.body.revision.previousOverallScore)).toBe(83.2);
    expect(Number(revised.body.revision.newOverallScore)).toBe(84.9);

    const revisions = await query(`SELECT COUNT(*) AS n FROM evaluation_revisions WHERE evaluationId = @0`, [evaluationId]);
    expect(Number(revisions[0].n)).toBe(1);
  });

  it('intern self-view: own finalized evaluation visible; foreign/missing 404', async () => {
    const mine = await request(apiBase()).get('/api/v1/intern/me/evaluations').set('Authorization', `Bearer ${i1}`);
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(1);
    expect(Number(mine.body.items[0].overallScore)).toBe(84.9);
    expect(mine.body.items[0].scores).toHaveLength(4);

    const one = await request(apiBase()).get(`/api/v1/intern/me/evaluations/${evaluationId}`).set('Authorization', `Bearer ${i1}`);
    expect(one.status).toBe(200);

    const foreign = await request(apiBase()).get(`/api/v1/intern/me/evaluations/${evaluationId}`).set('Authorization', `Bearer ${i2}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('EVALUATION_NOT_FOUND');
  });

  it('closed cycle rejects new evaluations (spec 7)', async () => {
    const closed = await request(apiBase()).post(`/api/v1/evaluation-cycles/${cycleId}/status`).set('Authorization', `Bearer ${si}`).send({ status: 'closed' });
    expect(closed.status).toBe(201);
    const rejected = await request(apiBase()).post('/api/v1/evaluations').set('Authorization', `Bearer ${si}`).send({
      cycleId, internId: i2UserId,
    });
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('EVALUATION_CYCLE_NOT_OPEN');
  });

  // ── Performance (spec 81): real tasks, exact metrics ───────────────────
  it('performance fixtures: active sprint + 5 tasks with SP/due dates/transitions', async () => {
    const sprint = await request(apiBase()).post('/api/v1/sprints').set('Authorization', `Bearer ${admin}`).send({
      code: `E2E-E5-SP-${RUN}`, name: 'Sprint 1', projectId, sessionId,
      startDate: '2026-02-01T00:00:00.000Z', endDate: '2026-03-01T00:00:00.000Z',
    });
    expect(sprint.status).toBe(201);
    sprintId = sprint.body.id;
    const activated = await request(apiBase()).post(`/api/v1/sprints/${sprintId}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'active' });
    expect(activated.status).toBe(201); // Nest POST default
  });

  async function createTask(over: { title: string; storyPoints?: number; dueDate?: string }): Promise<string> {
    const res = await request(apiBase()).post('/api/v1/tasks').set('Authorization', `Bearer ${admin}`).send({
      title: over.title, projectId, sprintId, assigneeId: i1UserId,
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

  it('performance: EXACT deterministic metrics for i1 (spec 81)', async () => {
    // Independent fixture tasks can progress concurrently on a constrained host.
    // Preserve each task's transition order and await all writes before metrics.
    // The original five-second timeout and every metric assertion stay intact.
    await Promise.all([
      (async () => {
        // SP5, due Feb 10, done ON TIME (history shifted to Feb 9).
        const task = await createTask({ title: 'T1', storyPoints: 5, dueDate: '2026-02-10T00:00:00.000Z' });
        await driveToDone(task);
        await query(`UPDATE task_status_histories SET createdAt = '2026-02-09T12:00:00' WHERE taskId = @0 AND toStatus = 'done'`, [task]);
      })(),
      (async () => {
        // SP3, due Feb 5, done LATE (history shifted to Feb 6).
        const task = await createTask({ title: 'T2', storyPoints: 3, dueDate: '2026-02-05T00:00:00.000Z' });
        await driveToDone(task);
        await query(`UPDATE task_status_histories SET createdAt = '2026-02-06T12:00:00' WHERE taskId = @0 AND toStatus = 'done'`, [task]);
      })(),
      (async () => {
        const task = await createTask({ title: 'T3', storyPoints: 2 });
        await driveToDone(task);
      })(),
      (async () => {
        const task = await createTask({ title: 'T4' });
        await request(apiBase()).patch(`/api/v1/tasks/${task}`).set('Authorization', `Bearer ${admin}`).send({ status: 'doing' }).expect(200);
      })(),
      (async () => {
        const task = await createTask({ title: 'T5', storyPoints: 8, dueDate: '2026-02-01T00:00:00.000Z' });
        await request(apiBase()).patch(`/api/v1/tasks/${task}`).set('Authorization', `Bearer ${admin}`).send({ status: 'doing' }).expect(200);
      })(),
    ]);

    const metrics = await request(apiBase())
      .get(`/api/v1/performance/interns/${i1UserId}`)
      .set('Authorization', `Bearer ${si}`);
    expect(metrics.status).toBe(200);
    const m = metrics.body.metrics;
    expect(m.totalTaskCount).toBe(5);
    expect(m.completedTaskCount).toBe(3);
    expect(m.taskCompletionRate).toBe(60);
    expect(m.committedStoryPoints).toBe(18); // 5+3+2+8 (null SP excluded)
    expect(m.completedStoryPoints).toBe(10); // 5+3+2
    expect(m.storyPointCompletionRate).toBe(55.6); // 10/18 = 55.55… → 55.6
    expect(m.dueDatedCompletedTaskCount).toBe(2);
    expect(m.onTimeCompletedTaskCount).toBe(1);
    expect(m.onTimeCompletionRate).toBe(50);
    expect(m.overdueOpenTaskCount).toBe(1);
    expect(m.averageEvaluationScore).toBe(84.9); // finalized (revised) evaluation
    expect(m.activeSprintProgress).toBe(55.6); // intern SP inside the ACTIVE sprint

    // intern own view identical
    const own = await request(apiBase()).get('/api/v1/intern/me/performance').set('Authorization', `Bearer ${i1}`);
    expect(own.status).toBe(200);
    expect(own.body.metrics.storyPointCompletionRate).toBe(55.6);
    expect(own.body.metrics.averageEvaluationScore).toBe(84.9);
  });

  it('performance: null semantics for an intern with NO data (not measured ≠ 0)', async () => {
    const metrics = await request(apiBase())
      .get(`/api/v1/performance/interns/${i2UserId}`)
      .set('Authorization', `Bearer ${si}`);
    expect(metrics.status).toBe(200);
    const m = metrics.body.metrics;
    expect(m.totalTaskCount).toBe(0);
    expect(m.taskCompletionRate).toBeNull();
    expect(m.storyPointCompletionRate).toBeNull();
    expect(m.onTimeCompletionRate).toBeNull();
    expect(m.averageEvaluationScore).toBeNull();
    expect(m.overdueOpenTaskCount).toBe(0);
  });

  it('performance: unowned instructor blocked (403 PERFORMANCE_SCOPE_FORBIDDEN)', async () => {
    const denied = await request(apiBase())
      .get(`/api/v1/performance/interns/${i1UserId}`)
      .set('Authorization', `Bearer ${ix}`);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('PERFORMANCE_SCOPE_FORBIDDEN');
  });

  it('performance: period filter [from, to) is deterministic', async () => {
    // Tasks are created "now" at runtime — the window is derived from the
    // same clock (inclusive start / exclusive end, UTC).
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const current = await request(apiBase())
      .get(`/api/v1/performance/interns/${i1UserId}?from=${from}&to=${to}`)
      .set('Authorization', `Bearer ${si}`);
    expect(current.body.metrics.totalTaskCount).toBe(5);
    // A closed past window contains none of them.
    const past = await request(apiBase())
      .get(`/api/v1/performance/interns/${i1UserId}?from=2026-01-01T00:00:00.000Z&to=2026-02-01T00:00:00.000Z`)
      .set('Authorization', `Bearer ${si}`);
    expect(past.body.metrics.totalTaskCount).toBe(0);
    expect(past.body.metrics.taskCompletionRate).toBeNull();
  });
  it('performance directory ranks and paginates in SQL, searches outside the first page and isolates instructors', async () => {
    const endpoint = `/api/v1/performance/interns?projectId=${projectId}&sessionId=${sessionId}&pageSize=1`;
    const first = await request(apiBase()).get(endpoint).set('Authorization', `Bearer ${si}`).expect(200);
    expect(first.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({ userId: i1UserId, rank: 1, totalTaskCount: 5, completedTaskCount: 3 });
    const second = await request(apiBase()).get(endpoint + '&page=2').set('Authorization', `Bearer ${si}`).expect(200);
    expect(second.body.items[0]).toMatchObject({ userId: i2UserId, rank: 2, totalTaskCount: 0 });
    const found = await request(apiBase()).get(endpoint + '&q=' + encodeURIComponent(EMAILS.i2)).set('Authorization', `Bearer ${si}`).expect(200);
    expect(found.body.total).toBe(1); expect(found.body.items[0].userId).toBe(i2UserId);
    const denied = await request(apiBase()).get(endpoint).set('Authorization', `Bearer ${ix}`).expect(200);
    expect(denied.body).toMatchObject({ total: 0, items: [] });
    await request(apiBase()).get(endpoint + '&pageSize=101').set('Authorization', `Bearer ${si}`).expect(400);
  });
  it('student detail returns scoped tasks, interview evidence and real history with bounded pages', async () => {
    const endpoint = `/api/v1/performance/interns/${i1UserId}/detail?projectId=${projectId}&sessionId=${sessionId}&pageSize=2`;
    const response = await request(apiBase()).get(endpoint).set('Authorization', `Bearer ${si}`).expect(200);
    expect(response.body.profile).toMatchObject({ email: EMAILS.i1 });
    expect(Object.keys(response.body.profile).sort()).toEqual(['displayName', 'email', 'id', 'selectedRole']);
    expect(response.body.metrics).toMatchObject({ totalTaskCount: 5, completedTaskCount: 3 });
    expect(response.body.tasks.total).toBe(5); expect(response.body.tasks.items).toHaveLength(2);
    expect(response.body.tasks.items.every((t: { projectId: string }) => t.projectId.toLowerCase() === projectId.toLowerCase())).toBe(true);
    expect(response.body.assignments).toHaveLength(1);
    expect(response.body.trend).toHaveLength(6);
    expect(response.body.trend.reduce((sum: number, point: { created: number }) => sum + point.created, 0)).toBe(5);
    await request(apiBase()).get(endpoint).set('Authorization', `Bearer ${ix}`).expect(403);
    await request(apiBase()).get(endpoint).set('Authorization', `Bearer ${i1}`).expect(403);
    const second = await request(apiBase()).get(endpoint + '&page=2').set('Authorization', `Bearer ${si}`).expect(200);
    expect(second.body.tasks.items[0].id).not.toBe(response.body.tasks.items[0].id);
  });
  it('revokes a saved report when a task session is lost even if the same student remains visible elsewhere', async () => {
    const teacherId = await userIdByEmail(EMAILS.si);
    const other = await request(apiBase()).post('/api/v1/sessions').set('Authorization', `Bearer ${admin}`).send({ code: `REPORT-OTHER-${RUN}`, name: 'Still visible student session', leadInstructorId: teacherId, startDate: '2026-01-01', endDate: '2026-12-31' }).expect(201);
    // Test-owned historical assignment keeps this student visible in a second session of the project.
    await dataSource.query("INSERT INTO assignments(id,internId,projectId,sessionId,status,assignedAt,completedAt) VALUES(@0,@1,@2,@3,'completed',DATEADD(day,-1,SYSUTCDATETIME()),SYSUTCDATETIME())", [randomUUID(), i1UserId, projectId, other.body.id]);
    const report = await request(apiBase()).post('/api/v1/reports').set('Authorization', `Bearer ${si}`).send({ requestId: randomUUID(), projectId, studentId: i1UserId, kind: 'progress', title: 'Revocable multi-session snapshot' }).expect(201);
    expect(report.body.snapshot.details.tasks).toHaveLength(5);
    await dataSource.query('DELETE FROM session_instructors WHERE sessionId=@0 AND instructorId=@1', [sessionId, teacherId]);
    try {
      const directory = await request(apiBase()).get(`/api/v1/performance/interns?projectId=${projectId}`).set('Authorization', `Bearer ${si}`).expect(200);
      expect(directory.body.items.some((m: { userId: string }) => m.userId === i1UserId)).toBe(true);
      await request(apiBase()).get(`/api/v1/reports/${report.body.id}`).set('Authorization', `Bearer ${si}`).expect(403);
      await request(apiBase()).get(`/api/v1/reports/${report.body.id}/pdf`).set('Authorization', `Bearer ${si}`).expect(403);
      await request(apiBase()).get(`/api/v1/reports/${report.body.id}`).set('Authorization', `Bearer ${admin}`).expect(200);
      const adminReports = await request(apiBase()).get(`/api/v1/reports?projectId=${projectId}`).set('Authorization', `Bearer ${admin}`).expect(200);
      expect(adminReports.body.items.some((row: { id: string }) => row.id === report.body.id)).toBe(true);
    } finally { await dataSource.query('INSERT INTO session_instructors(sessionId,instructorId,assignedAt) VALUES(@0,@1,SYSUTCDATETIME())', [sessionId, teacherId]); }
  });
});
