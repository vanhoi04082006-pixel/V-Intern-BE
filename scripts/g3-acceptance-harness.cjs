/** TEST ONLY: real Nest + disposable SQL + explicit deterministic model and local SMTP. */
"use strict";
if (
  process.env.NODE_ENV !== "test" ||
  !/^VIntern_E2E_CI_\d+_\d+$/.test(process.env.DB_NAME || "") ||
  process.env.DB_PORT !== "1437"
)
  throw Error("Disposable G3 SQL runtime required");
const path = require("node:path"),
  fs = require("node:fs"),
  { randomUUID, randomBytes } = require("node:crypto");
require("reflect-metadata");
const { Test } = require("@nestjs/testing"),
  { ValidationPipe } = require("@nestjs/common"),
  { hash } = require("bcryptjs");
const { DataSource } = require("typeorm"),
  source = require("../dist/database/data-source").default;
const { AppModule } = require("../dist/app.module"),
  { AI_PROVIDER_TOKEN } = require("../dist/ai/ai-provider.interface");
const { ensureRbac } = require("../dist/bootstrap/ensure-rbac"),
  { User } = require("../dist/users/entities/user.entity");
const {
    ApplicationWorkflow,
  } = require("../dist/applications/application-workflow.service"),
  {
    CommunicationsService,
  } = require("../dist/communications/communications.service");
const {
  InterviewAdmissionsService,
} = require("../dist/recruitment/interview-admissions.service");
const provider = {
  name: "explicit-g3-fixture",
  model: "fixture",
  async generateStructured(request) {
    const input = request.input;
    const raw =
      request.task === "business-agent-decision"
        ? {
            action: input.observations.length ? "final" : "tool",
            query: input.observations.length ? "" : "React TypeScript CV",
          }
        : request.task === "cv-analysis"
          ? {
              confidence: 0.9,
              missing: [],
              facts: [
                {
                  skill: "React",
                  ref: "page:1",
                  quote: "React and TypeScript",
                },
              ],
            }
          : request.task === "cv-role-match"
            ? {
                roleCode: input.roles[0].code,
                factIndexes: [0],
                confidence: 0.9,
                reason: "Synthetic evidence matches this opened career.",
              }
            : request.task === "interview-coordination"
              ? { slotId: input.slots[0].id, reason: "Earliest offered slot" }
              : request.task === "interview_next_question"
                ? { message: `Chào bạn. ${input.plannedQuestion}` }
                : null;
    if (!raw) throw Error("Unsupported G3 fixture task");
    return {
      data: request.validate(raw),
      model: "fixture",
      latencyMs: 1,
      inputTokens: 100,
      outputTokens: 100,
    };
  },
};
(async () => {
  const db = new DataSource(source.options);
  await db.initialize();
  await db.runMigrations({ transaction: "all" });
  await ensureRbac(db);
  const fixtures = {};
  for (const role of ["instructor", "admin"]) {
    const password = randomBytes(18).toString("base64url"),
      email = `g3-${role}-${randomUUID().slice(0, 8)}@vintern.test`;
    const user = await db.getRepository(User).save({
      email,
      username: randomUUID(),
      displayName: role === "instructor" ? "Giảng viên G3" : "Admin G3",
      status: "active",
      passwordHash: await hash(password, 10),
    });
    await db.query(
      "INSERT INTO user_roles(userId,roleId) SELECT @0,id FROM roles WHERE code=@1",
      [user.id, role],
    );
    fixtures[role] = { email, password, id: user.id };
  }
  await db.query(
    "INSERT INTO career_roles(code,name,description,requiredSkillsJson,status,acceptingApplications) VALUES('g3-browser',N'Lập trình ứng dụng React',N'Dự án nhỏ với React và TypeScript','[\"React\",\"TypeScript\"]','published',1)",
  );
  for (let i = 0; i < 10; i++)
    await db.query(
      "INSERT INTO interview_questions(id,roleCode,category,difficulty,prompt,rubricJson,isActive,sortOrder) VALUES(@0,'g3-browser',@1,'easy',N'Câu hỏi nghiệm thu local',@2,1,@3)",
      [
        randomUUID(),
        i < 6 ? "technical" : "soft",
        JSON.stringify({
          phase: i < 6 ? "technical" : i < 8 ? "introduction" : "english",
        }),
        i,
      ],
    );
  await db.destroy();
  fs.writeFileSync(process.env.G3_FIXTURES_PATH, JSON.stringify(fixtures));
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_PROVIDER_TOKEN)
    .useValue(provider)
    .compile();
  const app = module.createNestApplication({ logger: ["error", "warn"] });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({ origin: "http://localhost:3007", credentials: true });
  const express = app.getHttpAdapter().getInstance();
  express.post("/__g3/advance", async (_req, res) => {
    try {
      await app.get(ApplicationWorkflow).tick();
      const mails = app.get(CommunicationsService);
      for (let i = 0; i < 10; i++) if (!(await mails.tick())) break;
      res.json({ advanced: true });
    } catch {
      res.status(500).json({ code: "G3_ADVANCE_FAILED" });
    }
  });
  express.post("/__g3/credentials-due", async (_req, res) => {
    try {
      const db = app.get(DataSource);
      const [next] = await db.query(
        "SELECT TOP(1) availableAt FROM mail_outbox WHERE kind='credentials' AND status='pending' ORDER BY availableAt",
      );
      if (next)
        await app
          .get(CommunicationsService)
          .tick(new Date(next.availableAt.getTime() + 1000));
      res.json({ advanced: true });
    } catch {
      res.status(500).json({ code: "G3_DUE_FAILED" });
    }
  });
  if (process.env.G4_ACCEPTANCE === "true") {
    const admissions = app.get(InterviewAdmissionsService),
      realNow = admissions.now.bind(admissions);
    express.post("/__g4/clock", async (req, res) => {
      try {
        if (req.query.reset === "true") {
          admissions.now = realNow;
          return res.json({ controlled: false });
        }
        const email = String(req.query.email ?? ""),
          offset = Number(req.query.offset);
        if (
          !/^[a-z0-9.+_-]+@vintern\.test$/i.test(email) ||
          !Number.isInteger(offset) ||
          offset < -3600000 ||
          offset > 86400000
        )
          return res.status(400).json({ code: "INVALID_FIXTURE_CLOCK" });
        const [slot] = await app
          .get(DataSource)
          .query(
            "SELECT s.startsAt FROM cv_applications a JOIN interview_bookings b ON b.applicationId=a.id JOIN interview_slots s ON s.id=b.slotId WHERE a.email=@0",
            [email],
          );
        if (!slot) return res.sendStatus(404);
        const at = slot.startsAt.getTime() + offset;
        admissions.now = () => new Date(at);
        res.json({ controlled: true });
      } catch {
        res.status(500).json({ code: "G4_CLOCK_FAILED" });
      }
    });
    express.post("/__g4/sweep", async (_req, res) => {
      try {
        await admissions.sweep();
        res.json({ swept: true });
      } catch {
        res.status(500).json({ code: "G4_SWEEP_FAILED" });
      }
    });
    express.post("/__g4/expire-session", async (req, res) => {
      try {
        const email = String(req.query.email ?? "");
        if (!/^[a-z0-9.+_-]+@vintern\.test$/i.test(email))
          return res.sendStatus(400);
        await app
          .get(DataSource)
          .query(
            "UPDATE i SET expiresAt=DATEADD(second,-1,SYSUTCDATETIME()) FROM interview_sessions i JOIN recruitment_profiles p ON p.currentInterviewSessionId=i.id JOIN users u ON u.id=p.userId WHERE u.email=@0 AND i.status='in_progress'",
            [email],
          );
        res.json({ expiredClock: true });
      } catch {
        res.status(500).json({ code: "G4_EXPIRY_FIXTURE_FAILED" });
      }
    });
  }
  await app.listen(8083, "127.0.0.1");
  process.on("SIGTERM", () => {
    void app.close().then(() => process.exit());
  });
  console.log(
    "G3 disposable acceptance API ready on 8083; deterministic model explicitly enabled.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
