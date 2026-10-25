import { randomUUID } from "node:crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import {
  AI_PROVIDER_TOKEN,
  AiProvider,
  AiStructuredRequest,
} from "../src/ai/ai-provider.interface";
import { ensureRbac } from "../src/bootstrap/ensure-rbac";
import { User } from "../src/users/entities/user.entity";
import { Project } from "../src/projects/entities/project.entity";
import { Sprint } from "../src/sprints/entities/sprint.entity";
import { Task } from "../src/tasks/entities/task.entity";
import { Assignment } from "../src/assignments/entities/assignment.entity";
import { ParticipationLedger } from "../src/participation/participation-ledger.service";
import { ReplacementAdviceService } from "../src/participation/replacement-advice.service";
import { ReplacementPreviewService } from "../src/participation/replacement-preview.service";
import { ReplacementCommandsService } from "../src/participation/replacement-commands.service";
let app: INestApplication, db: DataSource, preview: ReplacementPreviewService;
let commands: ReplacementCommandsService;
const calls: string[] = [];
const provider: AiProvider = {
  name: "explicit-workflow-fixture",
  model: "fixture",
  async generateStructured<T>(request: AiStructuredRequest<T>) {
    calls.push(request.task);
    let raw: unknown;
    if (request.task === "business-agent-decision")
      raw = {
        action: (request.input.observations as unknown[]).length
          ? "final"
          : "tool",
        query: (request.input.observations as unknown[]).length
          ? ""
          : "replacement handover role evidence",
      };
    else if (request.task === "replacement-advice") {
      const candidates = request.input.candidates as Array<{
          userId: string;
          evidenceRef: string;
        }>,
        incident = request.input.incident as { evidenceRef: string };
      raw = {
        candidateId: candidates[0].userId,
        reason:
          "Ứng viên đã đạt đúng vai trò dự án và không có công việc đang mở.",
        evidenceRefs: [candidates[0].evidenceRef, incident.evidenceRef],
        limitations: ["Giảng viên xem lịch bàn giao trước khi quyết định."],
      };
    } else throw Error("Unexpected fixture task");
    return {
      data: request.validate(raw),
      provider: "explicit-workflow-fixture",
      model: "fixture",
      latencyMs: 1,
      inputTokens: 100,
      outputTokens: 100,
    };
  },
};
beforeAll(async () => {
  if (!/^VIntern_E2E_CI_\d+_\d+$/.test(process.env.E2E_DB_NAME ?? ""))
    throw Error("Disposable SQL only");
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_PROVIDER_TOKEN)
    .useValue(provider)
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  db = app.get(DataSource);
  preview = app.get(ReplacementPreviewService);
  commands = app.get(ReplacementCommandsService);
  await ensureRbac(db);
}, 120000);
afterAll(async () => {
  if (app) await app.close();
});
async function fixture() {
  const role = "rp-" + randomUUID().slice(0, 8);
  await db.query(
    "INSERT INTO career_roles(code,name,status,acceptingApplications) VALUES(@0,'Vai trò QA thay thế','published',1)",
    [role],
  );
  async function user(code: string) {
    const u = await db.getRepository(User).save({
      email: randomUUID() + "@workflow.test",
      username: randomUUID(),
      displayName:
        code === "intern" ? "Sinh viên workflow" : "Giảng viên workflow",
      passwordHash: "not-a-login",
      status: "active",
    });
    await db.query(
      "INSERT INTO user_roles(userId,roleId) SELECT @0,id FROM roles WHERE code=@1",
      [u.id, code],
    );
    if (code === "intern")
      await db.query(
        "INSERT INTO recruitment_profiles(id,userId,selectedRole,status,attemptCount) VALUES(NEWID(),@0,@1,'passed',1)",
        [u.id, role],
      );
    return u.id;
  }
  const teacher = await user("instructor"),
    target = await user("intern"),
    candidate = await user("intern"),
    foreign = await user("instructor"),
    sessionId = randomUUID();
  await db.query(
    "INSERT INTO internship_sessions(id,code,name,status,leadInstructorId,startDate,endDate) VALUES(@0,@0,'Workflow QA','active',@1,SYSUTCDATETIME(),DATEADD(day,2,SYSUTCDATETIME()))",
    [sessionId, teacher],
  );
  const project = await db.getRepository(Project).save({
      code: randomUUID(),
      name: "Workflow project",
      description: "Disposable replacement acceptance",
      mentorId: teacher,
      status: "active",
      capacity: 1,
    }),
    sprint = await db.getRepository(Sprint).save({
      code: randomUUID(),
      name: "Workflow sprint",
      projectId: project.id,
      sessionId,
      status: "active",
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000),
    });
  const assignment = await db.getRepository(Assignment).save({
    internId: target,
    projectId: project.id,
    sessionId,
    status: "active",
    assignedById: teacher,
    assignedAt: new Date(),
  });
  await db.query(
    "INSERT INTO project_members(projectId,userId,roleInProject) VALUES(@0,@1,@2)",
    [project.id, target, role],
  );
  await db.query(
    "INSERT INTO project_role_slots(projectId,roleCode,requiredCount) VALUES(@0,@1,1)",
    [project.id, role],
  );
  await db.query(
    "INSERT INTO session_members(sessionId,userId) VALUES(@0,@1)",
    [sessionId, target],
  );
  await db.query(
    "INSERT INTO participation_policies(sessionId,penaltyPoints,activeFrom) VALUES(@0,5,DATEADD(day,-1,SYSUTCDATETIME()))",
    [sessionId],
  );
  const tasks: Task[] = [],
    incidents: string[] = [];
  for (let i = 0; i < 3; i++) {
    const task = await db.getRepository(Task).save({
      code: randomUUID(),
      title: "Workflow task " + i,
      projectId: project.id,
      sprintId: sprint.id,
      assigneeId: target,
      status: "doing",
      progress: 50,
      dueDate: new Date(Date.now() - 3600000),
    });
    tasks.push(task);
    incidents.push((await app.get(ParticipationLedger).syncTask(task.id))!.id);
  }
  await db.query(
    "UPDATE tasks SET status='done',progress=100,version=version+1 WHERE id=@0",
    [tasks[1].id],
  );
  const submissionId = randomUUID();
  await db.query(
    "INSERT INTO task_submissions(id,taskId,internId,prUrl,summary,status,score,baseScore,latePenalty,participationIncidentId,reviewerId,reviewedAt) VALUES(@0,@1,@2,'https://github.com/fixture/repo/pull/1','Protected official history','approved',85,90,5,@3,@4,SYSUTCDATETIME())",
    [submissionId, tasks[1].id, target, incidents[1], teacher],
  );
  const advice = await app
    .get(ReplacementAdviceService)
    .generate(sessionId, incidents[2], teacher);
  return {
    role,
    teacher,
    target,
    candidate,
    foreign,
    sessionId,
    project,
    sprint,
    assignment,
    tasks,
    incidentId: incidents[2],
    advice,
    submissionId,
  };
}
let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
  f = await fixture();
}, 120000);
const prepare = () =>
  preview.prepare(f.sessionId, f.incidentId, f.teacher, {
    adviceId: f.advice.id,
    candidateId: f.candidate,
    handoverHours: 24,
  });
it("shows the exact open tasks and grace deadline without changing assignments, approved work or repository jobs", async () => {
  const count = calls.length,
    result = await prepare();
  expect(calls).toHaveLength(count);
  expect(result.document.taskPlan.transfers.map((t) => t.id).sort()).toEqual(
    [f.tasks[0].id, f.tasks[2].id].map((id) => id.toLowerCase()).sort(),
  );
  expect(result.document.taskPlan.preservedCount).toBe(1);
  expect(
    result.document.taskPlan.transfers.every(
      (t) => t.handoverDueAt === result.document.taskPlan.handoverAt,
    ),
  ).toBe(true);
  expect(
    new Date(result.document.taskPlan.handoverAt).getTime() -
      new Date(result.document.preparedAt).getTime(),
  ).toBe(24 * 3600000);
  expect(
    (
      await db
        .getRepository(Assignment)
        .findOneByOrFail({ id: f.assignment.id })
    ).status,
  ).toBe("active");
  expect(
    (
      await db.query(
        "SELECT COUNT(*) n FROM repository_access_jobs WHERE sessionId=@0",
        [f.sessionId],
      )
    )[0].n,
  ).toBe(0);
  expect(
    (
      await db.query("SELECT score FROM task_submissions WHERE id=@0", [
        f.submissionId,
      ])
    )[0].score,
  ).toBe(85);
});
it("rejects a candidate that became locked after the Agent advice", async () => {
  await db.getRepository(User).update(f.candidate, { status: "locked" });
  await expect(prepare()).rejects.toMatchObject({
    response: expect.objectContaining({
      code: "REPLACEMENT_CANDIDATE_UNAVAILABLE",
    }),
  });
  expect(
    (
      await db.query(
        "SELECT COUNT(*) n FROM participation_replacement_commands WHERE sessionId=@0",
        [f.sessionId],
      )
    )[0].n,
  ).toBe(0);
});
it("rejects foreign instructors before preparing or reading a preview", async () => {
  await expect(
    preview.prepare(f.sessionId, f.incidentId, f.foreign, {
      adviceId: f.advice.id,
      candidateId: f.candidate,
      handoverHours: 24,
    }),
  ).rejects.toMatchObject({ status: 403 });
  const result = await prepare();
  await expect(
    preview.get(f.sessionId, result.id, f.foreign),
  ).rejects.toMatchObject({ status: 403 });
});
it("blocks tasks in review or with a pending submission without asking the model to decide", async () => {
  await db.getRepository(Task).update(f.tasks[2].id, { status: "review" });
  await expect(prepare()).rejects.toMatchObject({
    response: expect.objectContaining({ code: "REPLACEMENT_PENDING_REVIEW" }),
  });
});
it("rejects expired advice using SQL time", async () => {
  await db.query(
    "UPDATE participation_events SET createdAt=DATEADD(minute,-31,SYSUTCDATETIME()) WHERE id=@0",
    [f.advice.id],
  );
  await expect(prepare()).rejects.toMatchObject({
    response: expect.objectContaining({ code: "REPLACEMENT_ADVICE_EXPIRED" }),
  });
});
it("rejects stale advice after the incident evidence changes without invoking the model again", async () => {
  const count = calls.length;
  await db.query(
    "UPDATE participation_incidents SET deadlineVersion=deadlineVersion+1 WHERE id=@0",
    [f.incidentId],
  );
  await expect(prepare()).rejects.toMatchObject({ status: 409 });
  expect(calls).toHaveLength(count);
});
it("detects altered advice and changed preview content instead of trusting client or stored JSON fields", async () => {
  const result = await prepare();
  await db.query(
    "UPDATE participation_replacement_commands SET previewJson=JSON_MODIFY(previewJson,'$.handoverHours',168) WHERE id=@0",
    [result.id],
  );
  await expect(
    preview.get(f.sessionId, result.id, f.teacher),
  ).rejects.toMatchObject({ status: 409 });
  await db.query(
    "UPDATE participation_events SET detail=JSON_MODIFY(detail,'$.source.scope.roleCode','other-role') WHERE id=@0",
    [f.advice.id],
  );
  await expect(prepare()).rejects.toMatchObject({ status: 409 });
});

const approvalReason =
  "Thay thành viên sau khi giảng viên đã đối chiếu bằng chứng và lịch bàn giao.";
it("approves atomically, preserves official history, moves only open tasks and grants the newcomer a fair deadline", async () => {
  const prepared = await prepare(),
    callsBefore = calls.length,
    identities = await db.query(
      "SELECT id,passwordHash,authVersion,status FROM users WHERE id IN(@0,@1) ORDER BY id",
      [f.target, f.candidate],
    );
  const result = await commands.approve(f.sessionId, prepared.id, f.teacher, {
    expectedPreviewHash: prepared.previewHash,
    reason: approvalReason,
  });
  expect(calls).toHaveLength(callsBefore);
  expect(
    (
      await db
        .getRepository(Assignment)
        .findOneByOrFail({ id: f.assignment.id })
    ).status,
  ).toBe("cancelled");
  expect(
    (
      await db
        .getRepository(Assignment)
        .findOneByOrFail({ id: result.newAssignmentId })
    ).internId,
  ).toBe(f.candidate);
  for (const transfer of prepared.document.taskPlan.transfers) {
    const task = await db
      .getRepository(Task)
      .findOneByOrFail({ id: transfer.id });
    expect(task.assigneeId).toBe(f.candidate);
    expect(task.version).toBe(transfer.version + 1);
    expect(task.dueDate!.toISOString()).toBe(transfer.handoverDueAt);
  }
  expect(
    (await db.getRepository(Task).findOneByOrFail({ id: f.tasks[1].id }))
      .assigneeId,
  ).toBe(f.target);
  const [grade] = await db.query(
    "SELECT internId,score,baseScore,latePenalty FROM task_submissions WHERE id=@0",
    [f.submissionId],
  );
  expect(grade).toEqual({
    internId: f.target,
    score: 85,
    baseScore: 90,
    latePenalty: 5,
  });
  expect(
    await db.query(
      "SELECT id,passwordHash,authVersion,status FROM users WHERE id IN(@0,@1) ORDER BY id",
      [f.target, f.candidate],
    ),
  ).toEqual(identities);
  expect(
    await db.query("SELECT userId FROM session_members WHERE sessionId=@0", [
      f.sessionId,
    ]),
  ).toEqual([{ userId: f.candidate }]);
  expect(
    await db.query("SELECT userId FROM project_members WHERE projectId=@0", [
      f.project.id,
    ]),
  ).toHaveLength(2);
  expect(
    await db.query(
      "SELECT id FROM repository_access_jobs WHERE sessionId=@0 AND status='pending'",
      [f.sessionId],
    ),
  ).toHaveLength(2);
  expect(await app.get(ParticipationLedger).syncTask(f.tasks[2].id)).toBeNull();
});
it("replays concurrent approval of the same preview without duplicate assignments, task versions, notifications or jobs", async () => {
  const prepared = await prepare(),
    body = {
      expectedPreviewHash: prepared.previewHash,
      reason: approvalReason,
    };
  const [a, b] = await Promise.all([
    commands.approve(f.sessionId, prepared.id, f.teacher, body),
    commands.approve(f.sessionId, prepared.id, f.teacher, body),
  ]);
  expect(a.replacementId).toBe(b.replacementId);
  expect(
    await db.query(
      "SELECT id FROM participation_replacements WHERE sessionId=@0",
      [f.sessionId],
    ),
  ).toHaveLength(1);
  expect(
    await db.query("SELECT id FROM repository_access_jobs WHERE sessionId=@0", [
      f.sessionId,
    ]),
  ).toHaveLength(2);
  expect(
    (await db.getRepository(Task).findOneByOrFail({ id: f.tasks[0].id }))
      .version,
  ).toBe(f.tasks[0].version + 1);
  expect(
    await db.query(
      "SELECT id FROM notifications WHERE userId=@0 AND type='participation.replaced'",
      [f.target],
    ),
  ).toHaveLength(1);
});
it("rejects a changed task or a newly pending review after preview instead of silently updating the plan", async () => {
  const prepared = await prepare();
  await db.query(
    "UPDATE tasks SET status='review',version=version+1 WHERE id=@0",
    [f.tasks[2].id],
  );
  await expect(
    commands.approve(f.sessionId, prepared.id, f.teacher, {
      expectedPreviewHash: prepared.previewHash,
      reason: approvalReason,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (
      await db
        .getRepository(Assignment)
        .findOneByOrFail({ id: f.assignment.id })
    ).status,
  ).toBe("active");
  expect(
    await db.query("SELECT id FROM repository_access_jobs WHERE sessionId=@0", [
      f.sessionId,
    ]),
  ).toHaveLength(0);
});
it("rejects an expired preview or a foreign approver without any replacement side effect", async () => {
  const prepared = await prepare(),
    body = {
      expectedPreviewHash: prepared.previewHash,
      reason: approvalReason,
    };
  await expect(
    commands.approve(f.sessionId, prepared.id, f.foreign, body),
  ).rejects.toMatchObject({ status: 403 });
  await db.query(
    "UPDATE participation_replacement_commands SET expiresAt=DATEADD(second,-1,SYSUTCDATETIME()) WHERE id=@0",
    [prepared.id],
  );
  await expect(
    commands.approve(f.sessionId, prepared.id, f.teacher, body),
  ).rejects.toMatchObject({
    response: expect.objectContaining({ code: "REPLACEMENT_PREVIEW_EXPIRED" }),
  });
  expect(
    (
      await db
        .getRepository(Assignment)
        .findOneByOrFail({ id: f.assignment.id })
    ).status,
  ).toBe("active");
});
it("rolls the entire change back when access jobs cannot be persisted, then safely retries the same preview", async () => {
  const prepared = await prepare(),
    body = {
      expectedPreviewHash: prepared.previewHash,
      reason: approvalReason,
    },
    before = await db.query(
      "SELECT id,assigneeId,version,dueDate FROM tasks WHERE projectId=@0 ORDER BY id",
      [f.project.id],
    );
  await db.query(
    "CREATE TRIGGER dbo.workflow_job_failure ON repository_access_jobs AFTER INSERT AS BEGIN THROW 50001,'Synthetic outbox failure',1; END",
  );
  try {
    await expect(
      commands.approve(f.sessionId, prepared.id, f.teacher, body),
    ).rejects.toBeDefined();
  } finally {
    await db.query("DROP TRIGGER dbo.workflow_job_failure");
  }
  expect(
    await db.query(
      "SELECT id,assigneeId,version,dueDate FROM tasks WHERE projectId=@0 ORDER BY id",
      [f.project.id],
    ),
  ).toEqual(before);
  expect(
    (
      await db
        .getRepository(Assignment)
        .findOneByOrFail({ id: f.assignment.id })
    ).status,
  ).toBe("active");
  expect(
    await db.query(
      "SELECT id FROM participation_replacements WHERE sessionId=@0",
      [f.sessionId],
    ),
  ).toHaveLength(0);
  expect((await preview.get(f.sessionId, prepared.id, f.teacher)).status).toBe(
    "pending",
  );
  const result = await commands.approve(
    f.sessionId,
    prepared.id,
    f.teacher,
    body,
  );
  expect(result.repositoryAccessQueued).toBe(true);
  expect(
    await db.query(
      "SELECT id FROM participation_replacements WHERE sessionId=@0",
      [f.sessionId],
    ),
  ).toHaveLength(1);
});
it("rechecks exemptions before Agent advice, preview and approval using the original incident policy", async () => {
  const prepared = await prepare(),
    before = calls.length;
  await db.query(
    "UPDATE participation_incidents SET status='excused' WHERE taskId=@0",
    [f.tasks[0].id],
  );
  await db.query(
    "UPDATE participation_policies SET penaltyFrom=1,replacementFrom=1,version=version+1 WHERE sessionId=@0",
    [f.sessionId],
  );
  const threshold = {
    response: expect.objectContaining({
      code: "REPLACEMENT_THRESHOLD_NOT_MET",
    }),
  };
  await expect(
    app
      .get(ReplacementAdviceService)
      .generate(f.sessionId, f.incidentId, f.teacher),
  ).rejects.toMatchObject(threshold);
  await expect(prepare()).rejects.toMatchObject(threshold);
  await expect(
    commands.approve(f.sessionId, prepared.id, f.teacher, {
      expectedPreviewHash: prepared.previewHash,
      reason: approvalReason,
    }),
  ).rejects.toMatchObject(threshold);
  expect(calls).toHaveLength(before);
  expect(
    (
      await db
        .getRepository(Assignment)
        .findOneByOrFail({ id: f.assignment.id })
    ).status,
  ).toBe("active");
});
it("rechecks candidate eligibility after a preview and rejects a forged client hash", async () => {
  const prepared = await prepare();
  await expect(
    commands.approve(f.sessionId, prepared.id, f.teacher, {
      expectedPreviewHash: "0".repeat(64),
      reason: approvalReason,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await db.getRepository(User).update(f.candidate, { status: "locked" });
  await expect(
    commands.approve(f.sessionId, prepared.id, f.teacher, {
      expectedPreviewHash: prepared.previewHash,
      reason: approvalReason,
    }),
  ).rejects.toMatchObject({
    response: expect.objectContaining({
      code: "REPLACEMENT_CANDIDATE_UNAVAILABLE",
    }),
  });
});
it("enforces HTTP validation/authorization and returns scoped student history after approval", async () => {
  async function token(id: string) {
    const user = await db.getRepository(User).findOneByOrFail({ id });
    return app
      .get(JwtService)
      .signAsync({ sub: user.id, email: user.email, av: user.authVersion });
  }
  const teacherToken = await token(f.teacher),
    studentToken = await token(f.target),
    candidateToken = await token(f.candidate),
    foreignToken = await token(f.foreign);
  const route = `/api/v1/sessions/${f.sessionId}/participation/incidents/${f.incidentId}/replacement-preview`,
    body = {
      adviceId: f.advice.id,
      candidateId: f.candidate,
      handoverHours: 24,
    };
  expect(
    (await request(app.getHttpServer()).post(route).send(body)).status,
  ).toBe(401);
  expect(
    (
      await request(app.getHttpServer())
        .post(route)
        .auth(studentToken, { type: "bearer" })
        .send(body)
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app.getHttpServer())
        .post(route)
        .auth(foreignToken, { type: "bearer" })
        .send(body)
    ).status,
  ).toBe(403);
  for (const invalid of [
    { ...body, handoverHours: 0 },
    { ...body, force: true },
    { ...body, candidateId: "bad" },
  ])
    expect(
      (
        await request(app.getHttpServer())
          .post(route)
          .auth(teacherToken, { type: "bearer" })
          .send(invalid)
      ).status,
    ).toBe(400);
  const prepared = await request(app.getHttpServer())
    .post(route)
    .auth(teacherToken, { type: "bearer" })
    .send(body);
  expect(prepared.status).toBe(201);
  const approveRoute = `/api/v1/sessions/${f.sessionId}/participation/replacements/${prepared.body.id}`;
  expect(
    (
      await request(app.getHttpServer())
        .get(approveRoute)
        .auth(teacherToken, { type: "bearer" })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(app.getHttpServer())
        .post(approveRoute + "/approve")
        .auth(teacherToken, { type: "bearer" })
        .send({
          expectedPreviewHash: prepared.body.previewHash,
          reason: "          ",
        })
    ).status,
  ).toBe(400);
  const approved = await request(app.getHttpServer())
    .post(approveRoute + "/approve")
    .auth(teacherToken, { type: "bearer" })
    .send({
      expectedPreviewHash: prepared.body.previewHash,
      reason: approvalReason,
    });
  expect(approved.status).toBe(201);
  for (const student of [studentToken, candidateToken]) {
    const history = await request(app.getHttpServer())
      .get("/api/v1/participation/me/replacements")
      .auth(student, { type: "bearer" });
    expect(history.status).toBe(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0].result.replacementId).toBe(
      approved.body.replacementId,
    );
  }
  const stranger = await request(app.getHttpServer())
    .get("/api/v1/participation/me/replacements")
    .auth(foreignToken, { type: "bearer" });
  expect(stranger.body.items).toHaveLength(0);
});
