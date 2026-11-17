import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { PerformanceService } from '../src/performance/performance.service';
import { Project } from '../src/projects/entities/project.entity';
import { InternshipSession } from '../src/sessions/entities/internship-session.entity';
import { Assignment } from '../src/assignments/entities/assignment.entity';
import { ensureRecruitedProfile } from './recruitment-fixtures';

let app: INestApplication;
let db: DataSource;
let token: string;
const run = randomUUID().slice(0, 8);
const password = randomUUID();
let windowYear: number;
const dateAt = (month: number) => new Date(Date.UTC(windowYear, month, 1)).toISOString();

beforeAll(async () => {
  const name = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_[A-Za-z0-9_]+$/.test(name) || name !== process.env.DB_NAME) throw new Error('A pre-migrated disposable E2E database is required.');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  db = app.get(DataSource);
  // Leave prior fixtures untouched. Use a window before every existing
  // assignment so the zero-eligible assertions stay exact on repeated runs.
  const [oldest] = await db.query('SELECT MIN(assignedAt) assignedAt FROM assignments');
  windowYear = oldest.assignedAt ? new Date(oldest.assignedAt).getUTCFullYear() - 2 : 1700;
  if (windowYear < 1000) throw new Error('No isolated historical window available for this test.');
  await ensureRbac(db);
  const role = await db.getRepository(Role).findOneByOrFail({ code: 'admin' });
  const user = await db.getRepository(User).save({ email: `kpi-ready-${run}@test.local`, username: `kpi-ready-${run}`, displayName: 'KPI readiness QA', passwordHash: await hash(password, 10), status: 'active' });
  await db.getRepository(UserRole).insert({ userId: user.id, roleId: role.id });
  const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password });
  expect(login.status).toBe(200);
  token = login.body.accessToken;
}, 30_000);

afterAll(async () => { await app?.close(); });
afterEach(() => jest.restoreAllMocks());

function post(path: string) { return request(app.getHttpServer()).post(`/api/v1/kpi-periods/${path}`).set('Authorization', `Bearer ${token}`); }
async function openPeriod() {
  const created = await post('').send({ code: `READY-${run}-${randomUUID().slice(0, 8)}`, name: 'QA readiness', startDate: dateAt(0), endDate: dateAt(1) });
  expect(created.status).toBe(201);
  expect((await post(`${created.body.id}/status`).send({ status: 'open' })).status).toBe(201);
  return created.body.id as string;
}
async function expectStillOpen(id: string) {
  const [row] = await db.query('SELECT status FROM kpi_periods WHERE id=@0', [id]);
  expect(row.status).toBe('open');
  const [audit] = await db.query("SELECT COUNT(*) n FROM audit_logs WHERE targetId=@0 AND action IN ('kpi.finalized','kpi.period_finalized')", [id]);
  expect(Number(audit.n)).toBe(0);
  const [activity] = await db.query("SELECT COUNT(*) n FROM activity_events WHERE targetId=@0 AND module='kpi' AND action='finalized'", [id]);
  expect(Number(activity.n)).toBe(0);
}

it.each(['finalize', 'status'])('refuses %s before the first successful calculation without locking or publishing the period', async endpoint => {
  const id = await openPeriod();
  const response = await post(`${id}/${endpoint}`).send(endpoint === 'status' ? { status: 'finalized' } : {});
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('KPI_CALCULATION_REQUIRED');
  await expectStillOpen(id);
});

it.each(['finalize', 'status'])('allows a successful zero-eligible batch through %s and records canonical finalization', async endpoint => {
  const id = await openPeriod();
  const calculated = await post(`${id}/calculate`);
  expect(calculated.status).toBe(201);
  expect(calculated.body.calculated).toBe(0);
  expect(calculated.body.insufficientData).toBe(0);
  const response = await post(`${id}/${endpoint}`).send(endpoint === 'status' ? { status: 'finalized' } : {});
  expect(response.status).toBe(201);
  expect(response.body.status).toBe('finalized');
  const [audit] = await db.query("SELECT COUNT(*) n FROM audit_logs WHERE targetId=@0 AND action='kpi.finalized'", [id]);
  expect(Number(audit.n)).toBe(1);
  expect((await post(`${id}/calculate`)).body.code).toBe('KPI_ALREADY_FINALIZED');
});

it('requires recalculation when the measured date range changes', async () => {
  const id = await openPeriod();
  expect((await post(`${id}/calculate`)).status).toBe(201);
  const edit = await request(app.getHttpServer()).patch(`/api/v1/kpi-periods/${id}`).set('Authorization', `Bearer ${token}`).send({ endDate: dateAt(2) });
  expect(edit.status).toBe(200);
  expect((await post(`${id}/finalize`)).body.code).toBe('KPI_CALCULATION_REQUIRED');
  await expectStillOpen(id);
  expect((await post(`${id}/calculate`)).status).toBe(201);
  expect((await post(`${id}/finalize`)).status).toBe(201);
});

it('does not expose engine-managed calculating transitions through the status endpoint', async () => {
  const id = await openPeriod();
  const response = await post(`${id}/status`).send({ status: 'calculating' });
  expect(response.status).toBe(409);
  expect(response.body.code).toBe('INVALID_KPI_PERIOD_TRANSITION');
  await expectStillOpen(id);
});

it('requires a new successful calculation after a failed recalculation rather than freezing partial results', async () => {
  const role = await db.getRepository(Role).findOneByOrFail({ code: 'intern' });
  const user = await db.getRepository(User).save({ email: `kpi-fail-${run}@test.local`, username: `kpi-fail-${run}`, displayName: 'KPI failure QA', passwordHash: await hash(password, 10), status: 'active' });
  await db.getRepository(UserRole).insert({ userId: user.id, roleId: role.id });
  await ensureRecruitedProfile(db, user.id, 'backend');
  const assignedAt = new Date(Date.UTC(windowYear - 1, 0, 1));
  const session = await db.getRepository(InternshipSession).save({ code: `KR-S-${run}`, name: 'QA', status: 'active', startDate: assignedAt, endDate: new Date(Date.UTC(windowYear + 1, 0, 1)) });
  const project = await db.getRepository(Project).save({ code: `KR-P-${run}`, name: 'QA', description: 'Synthetic readiness fixture', status: 'active' });
  await db.getRepository(Assignment).save({ internId: user.id, projectId: project.id, sessionId: session.id, status: 'active', assignedAt });
  const id = await openPeriod();
  expect((await post(`${id}/calculate`)).status).toBe(201);
  const failure = jest.spyOn(app.get(PerformanceService), 'ownMetrics').mockRejectedValueOnce(new Error('Injected QA calculation failure'));
  expect((await post(`${id}/calculate`)).status).toBe(500);
  failure.mockRestore();
  expect((await post(`${id}/finalize`)).body.code).toBe('KPI_CALCULATION_REQUIRED');
  await expectStillOpen(id);
  expect((await post(`${id}/calculate`)).status).toBe(201);
  expect((await post(`${id}/finalize`)).status).toBe(201);
});

it('publishes canonical activity and notifications through status, and prunes results excluded by a new window', async () => {
  const role = await db.getRepository(Role).findOneByOrFail({ code: 'intern' });
  const user = await db.getRepository(User).save({ email: `kpi-prune-${run}@test.local`, username: `kpi-prune-${run}`, displayName: 'KPI prune QA', passwordHash: await hash(password, 10), status: 'active' });
  await db.getRepository(UserRole).insert({ userId: user.id, roleId: role.id });
  await ensureRecruitedProfile(db, user.id, 'backend');
  const assignedAt = new Date(Date.UTC(windowYear - 1, 0, 1));
  const session = await db.getRepository(InternshipSession).save({ code: `KP-S-${run}`, name: 'QA', status: 'active', startDate: assignedAt, endDate: new Date(Date.UTC(windowYear + 1, 0, 1)) });
  const project = await db.getRepository(Project).save({ code: `KP-P-${run}`, name: 'QA', description: 'Synthetic draft snapshot fixture', status: 'active' });
  await db.getRepository(Assignment).save({ internId: user.id, projectId: project.id, sessionId: session.id, status: 'active', assignedAt });
  const performance = app.get(PerformanceService);
  const actual = await performance.ownMetrics(user.id, {});
  const measured = { ...actual, metrics: { ...actual.metrics, storyPointCompletionRate: 100, averageEvaluationScore: 85, onTimeCompletionRate: 100 } };
  const parityPeriod = await openPeriod();
  const prunePeriod = await openPeriod();
  const source = jest.spyOn(performance, 'ownMetrics').mockResolvedValue(measured);
  expect((await post(`${parityPeriod}/calculate`)).status).toBe(201);
  expect((await post(`${prunePeriod}/calculate`)).status).toBe(201);
  source.mockRestore();
  expect((await post(`${parityPeriod}/status`).send({ status: 'finalized' })).status).toBe(201);
  const [notification] = await db.query("SELECT COUNT(*) n FROM notifications WHERE userId=@0 AND type='kpi.finalized'", [user.id]);
  expect(Number(notification.n)).toBe(1);
  const [activity] = await db.query("SELECT COUNT(*) n FROM activity_events WHERE targetId=@0 AND module='kpi' AND action='finalized'", [parityPeriod]);
  expect(Number(activity.n)).toBe(1);
  const edit = await request(app.getHttpServer()).patch(`/api/v1/kpi-periods/${prunePeriod}`).set('Authorization', `Bearer ${token}`).send({ startDate: new Date(Date.UTC(windowYear - 3, 0, 1)).toISOString(), endDate: new Date(Date.UTC(windowYear - 2, 0, 1)).toISOString() });
  expect(edit.status).toBe(200);
  const recalculated = await post(`${prunePeriod}/calculate`);
  expect(recalculated.status).toBe(201);
  expect(recalculated.body.calculated + recalculated.body.insufficientData).toBe(0);
  const [remaining] = await db.query('SELECT COUNT(*) n FROM kpi_results WHERE periodId=@0', [prunePeriod]);
  expect(Number(remaining.n)).toBe(0);
  expect((await post(`${prunePeriod}/finalize`)).status).toBe(201);
  const [unchangedNotifications] = await db.query("SELECT COUNT(*) n FROM notifications WHERE userId=@0 AND type='kpi.finalized'", [user.id]);
  expect(Number(unchangedNotifications.n)).toBe(1);
  const [preserved] = await db.query('SELECT COUNT(*) n FROM kpi_results WHERE periodId=@0 AND userId=@1', [parityPeriod, user.id]);
  expect(Number(preserved.n)).toBe(1);
});
