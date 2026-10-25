import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
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
let app: INestApplication,
  db: DataSource,
  service: ReplacementAdviceService,
  sessionId: string,
  incidentId: string,
  teacherId: string,
  targetId: string,
  candidateId: string,
  foreignId: string;
const calls: string[] = [];
const provider: AiProvider = {
  name: "explicit-replacement-fixture",
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
          : "replacement frontend mentoring",
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
          "Hồ sơ đã đạt đúng vai trò Frontend và server xác nhận còn khả dụng.",
        evidenceRefs: [candidates[0].evidenceRef, incident.evidenceRef],
        limitations: ["Chưa có lịch làm việc được xác nhận bởi giảng viên."],
      };
    } else throw Error("Unexpected replacement fixture task");
    return {
      data: request.validate(raw),
      provider: "explicit-replacement-fixture",
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
  await app.init();
  db = app.get(DataSource);
  service = app.get(ReplacementAdviceService);
  await ensureRbac(db);
  async function user(role: string) {
    const u = await db
      .getRepository(User)
      .save({
        email: randomUUID() + "@replacement.test",
        username: randomUUID(),
        displayName:
          role === "intern" ? "Ứng viên thử nghiệm" : "Giảng viên thử nghiệm",
        passwordHash: "not-a-login",
        status: "active",
      });
    await db.query(
      "INSERT INTO user_roles(userId,roleId) SELECT @0,id FROM roles WHERE code=@1",
      [u.id, role],
    );
    if (role === "intern")
      await db.query(
        "INSERT INTO recruitment_profiles(id,userId,selectedRole,status,attemptCount) VALUES(NEWID(),@0,'frontend','passed',1)",
        [u.id],
      );
    return u.id;
  }
  teacherId = await user("instructor");
  targetId = await user("intern");
  candidateId = await user("intern");
  foreignId = await user("instructor");
  sessionId = randomUUID();
  await db.query(
    "INSERT INTO internship_sessions(id,code,name,status,leadInstructorId,startDate,endDate) VALUES(@0,@0,'Replacement QA','active',@1,SYSUTCDATETIME(),DATEADD(day,1,SYSUTCDATETIME()))",
    [sessionId, teacherId],
  );
  const project = await db
      .getRepository(Project)
      .save({
        code: randomUUID(),
        name: "Replacement project",
        description: "Disposable Agent acceptance",
        mentorId: teacherId,
        status: "active",
      }),
    sprint = await db
      .getRepository(Sprint)
      .save({
        code: randomUUID(),
        name: "Replacement sprint",
        projectId: project.id,
        sessionId,
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
      });
  await db
    .getRepository(Assignment)
    .save({
      internId: targetId,
      projectId: project.id,
      sessionId,
      status: "active",
      assignedById: teacherId,
      assignedAt: new Date(),
    });
  await db.query(
    "INSERT INTO participation_policies(sessionId,activeFrom) VALUES(@0,DATEADD(day,-1,SYSUTCDATETIME()))",
    [sessionId],
  );
  for (let i = 0; i < 3; i++) {
    const task = await db
      .getRepository(Task)
      .save({
        code: randomUUID(),
        title: "Late replacement evidence",
        projectId: project.id,
        sprintId: sprint.id,
        assigneeId: targetId,
        status: "doing",
        dueDate: new Date(Date.now() - 60000),
      });
    incidentId = (await app.get(ParticipationLedger).syncTask(task.id))!.id;
  }
}, 120000);
afterAll(async () => {
  if (app) await app.close();
});
it("runs the actual model/tool/model Agent graph with persisted checkpoints and grounded advice, without replacing anyone", async () => {
  const result = await service.generate(sessionId, incidentId, teacherId);
  expect(result.advice.candidateId).toBe(candidateId.toLowerCase());
  expect(result.aiRunId).toBeTruthy();
  expect(result.requiresInstructorApproval).toBe(true);
  expect(calls.filter((c) => c === "business-agent-decision")).toHaveLength(2);
  expect(calls.filter((c) => c === "replacement-advice")).toHaveLength(1);
  const runs = await db.query(
    "SELECT id,status FROM agent_runs WHERE agentId='replacement-advisor' AND actorId=@0",
    [teacherId],
  );
  expect(runs).toHaveLength(1);
  expect(runs[0].status).toBe("succeeded");
  expect(
    (
      await db.query(
        "SELECT COUNT(*) n FROM agent_tool_receipts WHERE runId=@0",
        [runs[0].id],
      )
    )[0].n,
  ).toBe(1);
  expect(
    (
      await db.query(
        "SELECT COUNT(*) n FROM agent_checkpoints WHERE runId=@0",
        [runs[0].id],
      )
    )[0].n,
  ).toBeGreaterThan(0);
  expect(
    await db.query(
      "SELECT internId,status FROM assignments WHERE sessionId=@0",
      [sessionId],
    ),
  ).toEqual([{ internId: targetId, status: "active" }]);
  const [event] = await db.query(
    "SELECT action,detail FROM participation_events WHERE id=@0",
    [result.id],
  );
  expect(event.action).toBe("replacement.advised");
  expect(JSON.parse(event.detail).aiRunId.toLowerCase()).toBe(
    result.aiRunId!.toLowerCase(),
  );
});
it("rechecks current knowledge through a new Agent run for each explicit request, even with unchanged domain facts", async () => {
  const [previous] = await db.query(
      "SELECT TOP(1) detail FROM participation_events WHERE sessionId=@0 AND action='replacement.advised' ORDER BY createdAt DESC",
      [sessionId],
    ),
    detail = JSON.parse(previous.detail),
    before = calls.length;
  const result = await service.generate(sessionId, incidentId, teacherId);
  expect(result.contextHash).toBe(detail.contextHash);
  expect(result.aiRunId!.toLowerCase()).not.toBe(detail.aiRunId.toLowerCase());
  expect(calls.length - before).toBe(3);
  expect(
    (
      await db.query(
        "SELECT COUNT(*) n FROM agent_runs WHERE agentId='replacement-advisor' AND actorId=@0 AND status='succeeded'",
        [teacherId],
      )
    )[0].n,
  ).toBe(2);
});
it("denies a foreign teacher before another model call and reports an unavailable candidate honestly", async () => {
  const before = calls.length;
  await expect(
    service.generate(sessionId, incidentId, foreignId),
  ).rejects.toMatchObject({ status: 403 });
  expect(calls).toHaveLength(before);
  await db.getRepository(User).update(candidateId, { status: "locked" });
  const result = await service.generate(sessionId, incidentId, teacherId);
  expect(result.advice.candidateId).toBeNull();
  expect(result.aiRunId).toBeNull();
  expect(calls).toHaveLength(before);
});
