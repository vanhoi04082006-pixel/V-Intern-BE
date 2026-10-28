import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { User } from "../src/users/entities/user.entity";
import { Project } from "../src/projects/entities/project.entity";
import { InternshipSession } from "../src/sessions/entities/internship-session.entity";
import { Sprint } from "../src/sprints/entities/sprint.entity";
import { Task } from "../src/tasks/entities/task.entity";
import { Assignment } from "../src/assignments/entities/assignment.entity";
import { ParticipationLedger } from "../src/participation/participation-ledger.service";
import { ParticipationService } from '../src/participation/participation.service';
import { PermissionsService } from '../src/rbac/permissions.service';
import { SubmissionsService } from '../src/submissions/submissions.service';
import { TasksService } from '../src/tasks/tasks.service';
import { GithubEvidenceService } from '../src/github/github-evidence.service';
let db: DataSource, ledger: ParticipationLedger;
beforeAll(async () => {
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(process.env.E2E_DB_NAME ?? "") ||
    source.options.type !== "mssql"
  )
    throw Error("Disposable SQL only");
  db = new DataSource({ ...source.options, database: process.env.E2E_DB_NAME });
  await db.initialize();
  ledger = new ParticipationLedger(db);
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});
async function fixture(configured = true) {
  const user = async () => {
    const id = randomUUID();
    return db
      .getRepository(User)
      .save({
        id,
        email: `${id}@vintern.test`,
        username: id,
        displayName: "G6 QA",
        passwordHash: "not-a-login",
        status: "active",
      });
  };
  const teacher = await user(),
    student = await user();
  const [{ utcNow }] = await db.query("SELECT SYSUTCDATETIME() utcNow");
  const session = await db
    .getRepository(InternshipSession)
    .save({
      code: randomUUID(),
      name: "G6 QA",
      status: "active",
      leadInstructorId: teacher.id,
      startDate: utcNow,
      endDate: new Date(utcNow.getTime() + 86400000),
    });
  const project = await db
    .getRepository(Project)
    .save({
      code: randomUUID(),
      name: "G6 project",
      description: "SQL fixture",
      status: "active",
      mentorId: teacher.id,
    });
  const sprint = await db
    .getRepository(Sprint)
    .save({
      code: randomUUID(),
      name: "G6 sprint",
      projectId: project.id,
      sessionId: session.id,
      status: "active",
      startDate: utcNow,
      endDate: new Date(utcNow.getTime() + 86400000),
    });
  await db
    .getRepository(Assignment)
    .save({
      internId: student.id,
      projectId: project.id,
      sessionId: session.id,
      status: "active",
      assignedById: teacher.id,
      assignedAt: utcNow,
    });
  if (configured)
    await db.query(
      "INSERT INTO participation_policies(sessionId,penaltyPoints,penaltyCap,activeFrom) VALUES(@0,5,7,DATEADD(day,-1,SYSUTCDATETIME()))",
      [session.id],
    );
  const task = async () =>
    db
      .getRepository(Task)
      .save({
        code: randomUUID(),
        title: "G6 task",
        projectId: project.id,
        sprintId: sprint.id,
        assigneeId: student.id,
        status: "doing",
        dueDate: new Date(utcNow.getTime() - 60000),
      });
  const submit = async (t: Task, when: Date) => {
    const id = randomUUID();
    await db.query(
      "INSERT INTO task_submissions(id,taskId,internId,prUrl,summary,status,submittedAt) VALUES(@0,@1,@2,'https://github.com/qa/repo/pull/1',N'Valid server fixture','submitted',@3)",
      [id, t.id, student.id, when.toISOString()],
    );
    return id;
  };
  return { teacher, student, session, task, submit, now: utcNow };
}
it("does not retroactively enable discipline for sessions without a configured policy", async () => {
  const f = await fixture(false),
    task = await f.task();
  expect(await ledger.syncTask(task.id)).toBeNull();
  expect(
    await db.query("SELECT id FROM participation_incidents WHERE taskId=@0", [
      task.id,
    ]),
  ).toHaveLength(0);
});
it("records one incident for missing then late submission and serializes concurrent replay", async () => {
  const f = await fixture(),
    task = await f.task();
  await Promise.all([ledger.syncTask(task.id), ledger.syncTask(task.id)]);
  expect(
    await db.query("SELECT id FROM participation_incidents WHERE taskId=@0", [
      task.id,
    ]),
  ).toHaveLength(1);
  await f.submit(task, f.now);
  await ledger.syncTask(task.id);
  const [incident] = await db.query(
    "SELECT * FROM participation_incidents WHERE taskId=@0",
    [task.id],
  );
  expect(incident.kind).toBe("late");
  expect(incident.ordinal).toBe(1);
  expect(Number(incident.points)).toBe(0);
});
it("uses a valid first submission and never punishes slow grading", async () => {
  const f = await fixture(),
    task = await f.task();
  await f.submit(task, task.dueDate!);
  expect(await ledger.syncTask(task.id)).toBeNull();
});
it("applies configurable thresholds and cap once per incident, preserving policy snapshots", async () => {
  const f = await fixture();
  const tasks = [await f.task(), await f.task(), await f.task()];
  for (const task of tasks) await ledger.syncTask(task.id);
  const incidents = await db.query(
    "SELECT ordinal,points,recommendReplacement,policyVersion FROM participation_incidents WHERE sessionId=@0 ORDER BY ordinal",
    [f.session.id],
  );
  expect(incidents.map((i: { points: number }) => Number(i.points))).toEqual([
    0, 5, 2,
  ]);
  expect(incidents[2].recommendReplacement).toBe(true);
  await db.query(
    "UPDATE participation_policies SET penaltyPoints=20,version=2 WHERE sessionId=@0",
    [f.session.id],
  );
  await ledger.syncTask(tasks[1].id);
  const [old] = await db.query(
    "SELECT points,policyVersion FROM participation_incidents WHERE taskId=@0",
    [tasks[1].id],
  );
  expect(Number(old.points)).toBe(5);
  expect(old.policyVersion).toBe(1);
  expect(
    await db.query(
      "SELECT p.id FROM participation_penalties p JOIN participation_incidents i ON i.id=p.incidentId WHERE i.sessionId=@0",
      [f.session.id],
    ),
  ).toHaveLength(2);
});
it("does not create historical incidents for deadlines before the policy activation date", async () => {
  const f = await fixture();
  await db.query(
    "UPDATE participation_policies SET activeFrom=SYSUTCDATETIME() WHERE sessionId=@0",
    [f.session.id],
  );
  expect(await ledger.syncTask((await f.task()).id)).toBeNull();
});

const commands = () => new ParticipationService(db, { hasRole: async () => false } as unknown as PermissionsService, ledger);
it('guards policy writes and requires optimistic policy versions without rewriting old incidents', async () => {
  const f = await fixture(), task = await f.task(); await ledger.syncTask(task.id);
  const input = { expectedVersion: 1, warningFrom: 1, penaltyFrom: 2, replacementFrom: 3, penaltyPoints: 8, penaltyCap: 20, reason: 'Áp dụng cho các vi phạm phát sinh mới.' };
  await expect(commands().savePolicy(f.session.id, f.student.id, input)).rejects.toMatchObject({ status: 403 });
  expect((await commands().savePolicy(f.session.id, f.teacher.id, input)).version).toBe(2);
  await expect(commands().savePolicy(f.session.id, f.teacher.id, input)).rejects.toMatchObject({ status: 409 });
  expect((await db.query('SELECT policyVersion FROM participation_incidents WHERE taskId=@0', [task.id]))[0].policyVersion).toBe(1);
});
it('extensions reverse an outstanding incident and preserve its audit and identity', async () => {
  const f = await fixture(), task = await f.task(), incident = await ledger.syncTask(task.id);
  const result = await commands().extend(f.session.id, task.id, f.teacher.id, { expectedVersion: incident!.deadlineVersion, until: new Date(f.now.getTime() + 3600000).toISOString(), reason: 'Đã xác minh sự cố mất kết nối của sinh viên.' });
  expect(result.extended).toBe(true);
  const [after] = await db.query('SELECT * FROM participation_incidents WHERE taskId=@0', [task.id]);
  expect(after.id).toBe(incident!.id); expect(after.status).toBe('reversed');
  expect(await db.query("SELECT id FROM participation_events WHERE taskId=@0 AND action='deadline.extended'", [task.id])).toHaveLength(1);
});
it('serializes exemption/reversal commands and never modifies an already approved score', async () => {
  const f = await fixture(); await ledger.syncTask((await f.task()).id);
  const task = await f.task(), incident = await ledger.syncTask(task.id), submissionId = await f.submit(task, f.now);
  await db.query("UPDATE task_submissions SET status='approved',score=80,baseScore=85,latePenalty=5,reviewerId=@1,reviewedAt=SYSUTCDATETIME(),participationIncidentId=@2 WHERE id=@0", [submissionId, f.teacher.id, incident!.id]);
  const input = { action: 'excused' as const, expectedDeadlineVersion: incident!.deadlineVersion, reason: 'Miễn trừ sau khi xác minh sự cố khách quan.' };
  const results = await Promise.allSettled([commands().resolve(f.session.id, incident!.id, f.teacher.id, input), commands().resolve(f.session.id, incident!.id, f.teacher.id, input)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const [score] = await db.query('SELECT score,baseScore,latePenalty FROM task_submissions WHERE id=@0', [submissionId]);
  expect(Number(score.score)).toBe(80); expect(Number(score.baseScore)).toBe(85); expect(Number(score.latePenalty)).toBe(5);
  const [{ net }] = await db.query('SELECT SUM(points) net FROM participation_penalties WHERE incidentId=@0', [incident!.id]); expect(Number(net)).toBe(0);
});
it('keeps student evidence scoped to its owner and protects teacher reports', async () => {
  const f = await fixture(), other = await fixture(); await ledger.syncTask((await f.task()).id); await ledger.syncTask((await other.task()).id);
  const own = await commands().own(f.student.id);
  expect(own.items).toHaveLength(1); expect(own.items[0].internId.toLowerCase()).toBe(f.student.id.toLowerCase());
  await expect(commands().report(other.session.id, f.teacher.id)).rejects.toMatchObject({ status: 403 });
});
it('requires explicit teacher confirmation of a late deduction, then stores base and final scores once', async () => {
  const f = await fixture(); await ledger.syncTask((await f.task()).id);
  const task = await f.task(), id = await f.submit(task, f.now);
  await db.getRepository(Task).update(task.id, { status: 'review' });
  const current = await db.getRepository(Task).findOneByOrFail({ id: task.id });
  const permissions = { hasRole: async () => false } as unknown as PermissionsService;
  const reviews = new SubmissionsService(db, { getOneDetailed: async () => current } as unknown as TasksService, permissions, {} as GithubEvidenceService, ledger);
  const dto = { rubric: { functional: 90, quality: 90, testing: 90, errors: 90, security: 90, dod: 90 }, feedback: 'Bài đã được kiểm tra đầy đủ.', taskVersion: current.version };
  await expect(reviews.review(id, dto, { actorId: f.teacher.id })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PARTICIPATION_PENALTY_CONFIRM_REQUIRED', details: expect.objectContaining({ baseScore: 90, latePenalty: 5, score: 85 }) }) });
  expect((await db.query('SELECT status FROM task_submissions WHERE id=@0', [id]))[0].status).toBe('submitted');
  const result = await reviews.review(id, { ...dto, confirmedLatePenalty: 5 }, { actorId: f.teacher.id });
  expect(Number(result.score)).toBe(85); expect(Number(result.baseScore)).toBe(90); expect(Number(result.latePenalty)).toBe(5);
  await reviews.review(id, { ...dto, confirmedLatePenalty: 5 }, { actorId: f.teacher.id });
  expect(Number((await db.query('SELECT score FROM task_submissions WHERE id=@0', [id]))[0].score)).toBe(85);
});
