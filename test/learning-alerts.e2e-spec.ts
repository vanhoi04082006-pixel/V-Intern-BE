import { randomUUID } from 'crypto';
import { hash } from 'bcryptjs';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import source from '../src/database/data-source';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { Project } from '../src/projects/entities/project.entity';
import { InternshipSession } from '../src/sessions/entities/internship-session.entity';
import { Sprint } from '../src/sprints/entities/sprint.entity';
import { Task } from '../src/tasks/entities/task.entity';
import { LearningAlertsService } from '../src/notifications/learning-alerts.service';
let db: DataSource, alerts: LearningAlertsService, otherWorker: LearningAlertsService;
let app: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
let owner: User, co: User, foreign: User, student: User, sessionId: string, projectId: string, taskId: string, planId: string;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '', options = source.options;
  if (!/^VIntern_(?:E2E|Test)_[A-Za-z0-9_]+$/.test(database) || options.type !== 'mssql') throw Error('Disposable SQL database required.');
  db = new DataSource({ ...options, database, synchronize: false }); await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db);
  async function user(code: string) { const role = await db.getRepository(Role).findOneByOrFail({ code }), suffix = randomUUID().slice(0, 8); const u = await db.getRepository(User).save({ email: `alert.${suffix}@vintern.test`, username: `alert.${suffix}`, displayName: `Alert ${suffix}`, passwordHash: await hash('E2e-Alerts-123!', 10), status: 'active' }); await db.getRepository(UserRole).insert({ userId: u.id, roleId: role.id }); return u; }
  owner = await user('instructor'); co = await user('instructor'); foreign = await user('instructor'); student = await user('intern');
  const session = await db.getRepository(InternshipSession).save({ code: `ALERT-${randomUUID().slice(0, 8)}`, name: 'Learning alert fixture', status: 'active', leadInstructorId: owner.id, startDate: new Date(), endDate: new Date(Date.now() + 86400000) }); sessionId = session.id;
  const project = await db.getRepository(Project).save({ code: `ALERT-P-${randomUUID().slice(0, 8)}`, name: 'Learning alerts', description: 'Real SQL alert fixtures', mentorId: owner.id, status: 'active', difficulty: 'beginner' }); projectId = project.id;
  const sprint = await db.getRepository(Sprint).save({ code: `ALERT-S-${randomUUID().slice(0, 8)}`, name: 'Learning alerts', projectId, sessionId, status: 'active', startDate: new Date(), endDate: new Date(Date.now() + 86400000) });
  const task = await db.getRepository(Task).save({ code: `ALERT-T-${randomUUID().slice(0, 8)}`, title: 'Overdue review', projectId, sprintId: sprint.id, assigneeId: student.id, status: 'review', priority: 'high', progress: 70, dueDate: new Date(Date.now() - 86400000) }); taskId = task.id;
  await db.query('INSERT INTO session_instructors(sessionId,instructorId) VALUES(@0,@1)', [sessionId, owner.id]);
  await db.query('INSERT INTO session_instructors(sessionId,instructorId) VALUES(@0,@1)', [sessionId, co.id]);
  await db.query("INSERT INTO notification_preferences(userId,category,enabled) VALUES(@0,'task',0)", [co.id]);
  app = await Test.createTestingModule({ imports: [AppModule] }).compile(); await app.init();
  alerts = app.get(LearningAlertsService); otherWorker = new LearningAlertsService(db, app.get(ConfigService));
}, 120000);
afterAll(async () => { await app?.close(); if (db?.isInitialized) await db.destroy(); });
async function notices(userId: string): Promise<Array<{ type: string; linkUrl: string }>> { return db.query("SELECT * FROM notifications WHERE userId=@0 AND (type='task.overdue' OR type='session.issue') ORDER BY createdAt", [userId]); }
describe('real learning alert dispatch', () => {
  it('delivers once across competing workers, respects preference and never changes task state', async () => {
    await Promise.all([alerts.scan(), otherWorker.scan()]); await alerts.scan();
    const own = await notices(owner.id); expect(own).toHaveLength(1); expect(own[0].type).toBe('task.overdue'); expect(own[0].linkUrl.toLowerCase()).toBe(`/instructor/tasks/${taskId.toLowerCase()}`);
    expect(await notices(co.id)).toHaveLength(0); expect(await notices(foreign.id)).toHaveLength(0); expect(await notices(student.id)).toHaveLength(0);
    expect((await db.query('SELECT status,progress FROM tasks WHERE id=@0', [taskId]))[0]).toMatchObject({ status: 'review', progress: 70 });
    expect((await db.query("SELECT COUNT(*) count FROM learning_alert_dispatches WHERE eventKey LIKE @0", [`task.overdue:${taskId.toUpperCase()}:%`]))[0].count).toBe(2);
  });
  it('ignores completed work and treats a changed overdue deadline as a new event', async () => {
    await db.query("UPDATE tasks SET status='done',progress=100,dueDate=DATEADD(day,-2,SYSUTCDATETIME()) WHERE id=@0", [taskId]); await alerts.scan(); expect(await notices(owner.id)).toHaveLength(1);
    await db.query("UPDATE tasks SET status='doing',progress=50 WHERE id=@0", [taskId]); await alerts.scan(); expect(await notices(owner.id)).toHaveLength(2);
    await db.query('DELETE FROM session_instructors WHERE sessionId=@0 AND instructorId=@1', [sessionId, co.id]);
  });
  it('alerts the lead only for the latest failed plan, once per failure; suppresses replaced failures', async () => {
    planId = randomUUID();
    await db.query("INSERT INTO ai_generation_batches(id,requestId,createdById,projectId,sessionId,summaryJson,status,errorJson) VALUES(@0,@1,@2,@3,@4,'{}','failed','{\"code\":\"PROVIDER_TIMEOUT\"}')", [planId, randomUUID(), owner.id, projectId, sessionId]);
    await alerts.scan(); await alerts.scan(); expect((await notices(owner.id)).filter(n => n.type === 'session.issue')).toHaveLength(1);
    const replacedId = randomUUID();
    await db.query("INSERT INTO ai_generation_batches(id,requestId,createdById,projectId,sessionId,summaryJson,status,createdAt) VALUES(@0,@1,@2,@3,@4,'{}','failed',DATEADD(second,1,SYSUTCDATETIME()))", [replacedId, randomUUID(), owner.id, projectId, sessionId]);
    await db.query("INSERT INTO ai_generation_batches(id,requestId,createdById,projectId,sessionId,summaryJson,status,draftJson,createdAt) VALUES(@0,@1,@2,@3,@4,'{}','ready','{}',DATEADD(second,2,SYSUTCDATETIME()))", [randomUUID(), randomUUID(), owner.id, projectId, sessionId]);
    await alerts.scan(); expect((await notices(owner.id)).filter(n => n.type === 'session.issue')).toHaveLength(1);
    await db.query("UPDATE ai_generation_batches SET createdAt=DATEADD(second,3,SYSUTCDATETIME()) WHERE id=@0", [replacedId]);
    await db.query("UPDATE internship_sessions SET status='completed' WHERE id=@0", [sessionId]);
    await alerts.scan(); expect((await notices(owner.id)).filter(n => n.type === 'session.issue')).toHaveLength(1);
  });
  it('tracks repository retry leases and ignores an obsolete repository owner', async () => {
    await db.query("UPDATE internship_sessions SET status='active' WHERE id=@0", [sessionId]);
    await db.query("UPDATE ai_generation_batches SET status='ready',draftJson='{}' WHERE sessionId=@0", [sessionId]);
    const lease = randomUUID();
    await db.query("INSERT INTO session_repositories(sessionId,ownerUserId,githubOwnerId,ownerLogin,repoName,status,leaseId,errorCode) VALUES(@0,@1,123456789,'fixture-owner','fixture-repo','failed',@2,'CONFIGURATION_MISSING')", [sessionId, owner.id, lease]);
    await alerts.scan(); await otherWorker.scan();
    expect((await notices(owner.id)).filter(n => n.type === 'session.issue')).toHaveLength(2);
    await db.query("UPDATE session_repositories SET leaseId=@0,ownerUserId=@1 WHERE sessionId=@2", [randomUUID(), foreign.id, sessionId]);
    await alerts.scan(); expect(await notices(foreign.id)).toHaveLength(0);
    await db.query("UPDATE session_repositories SET ownerUserId=@0 WHERE sessionId=@1", [owner.id, sessionId]);
    await alerts.scan(); expect((await notices(owner.id)).filter(n => n.type === 'session.issue')).toHaveLength(3);
    await db.query("UPDATE session_repositories SET status='ready',webhookStatus='failed',webhookLeaseId=@0 WHERE sessionId=@1", [randomUUID(), sessionId]);
    await db.query("INSERT INTO notification_preferences(userId,category,enabled) VALUES(@0,'session',0)", [owner.id]);
    await alerts.scan(); expect((await notices(owner.id)).filter(n => n.type === 'session.issue')).toHaveLength(3);
    expect((await db.query("SELECT COUNT(*) count FROM learning_alert_dispatches WHERE userId=@0 AND eventKey LIKE 'session.issue:github:%' AND notificationId IS NULL", [owner.id]))[0].count).toBe(1);
  });
});
