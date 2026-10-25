import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { DataSource } from "typeorm";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import PDFDocument from "pdfkit";
import JSZip from "jszip";
import request from "supertest";
import { AppModule } from "../src/app.module";
import source from "../src/database/data-source";
import { ensureRbac } from "../src/bootstrap/ensure-rbac";
import { User } from "../src/users/entities/user.entity";
import { Role } from "../src/rbac/entities/role.entity";
import { UserRole } from "../src/rbac/entities/user-role.entity";
import {
  ApplicationsService,
  CandidateApplication,
} from "../src/applications/applications.service";
import { CvFacts, RoleMatch } from "../src/applications/application-policy";
import { RecruitmentRoundsService } from "../src/applications/recruitment-rounds.service";
import { CvStorage } from "../src/applications/cv-storage";
import { openMail } from "../src/communications/mail-template";
import { InterviewBookingsService } from "../src/applications/interview-bookings.service";
import { RecruitmentProfile } from "../src/recruitment/entities/recruitment-profile.entity";
import { RecruitmentService } from "../src/recruitment/recruitment.service";
import { ApplicationWorkflow } from "../src/applications/application-workflow.service";
import { IntakeAgents } from "../src/applications/intake-agents.service";
import {
  AI_PROVIDER_TOKEN,
  AiStructuredRequest,
} from "../src/ai/ai-provider.interface";

const key = Buffer.alloc(32, 8).toString("base64"),
  password = "Fixture-Candidate-123!";
let app: INestApplication,
  db: DataSource,
  apps: ApplicationsService,
  rounds: RecruitmentRoundsService,
  storage: CvStorage,
  owner: User,
  outsider: User,
  roundId: string,
  cv: Buffer;
let bookings: InterviewBookingsService, slotId: string, secondSlotId: string;
let graphApplication: CandidateApplication,
  graphFacts: CvFacts,
  graphMatch: RoleMatch;
let graphSpy: jest.SpyInstance;
export async function pdf(
  text = "I built a React and TypeScript website with unit tests and SQL queries.",
): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument(),
      chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    if (text) doc.text(text);
    doc.end();
  });
}
const file = () => ({
  buffer: cv,
  mimetype: "application/pdf",
  originalname: "cv.pdf",
});
const deterministicProvider = {
  name: "g3-fixture",
  model: "fixture",
  async generateStructured<T>(r: AiStructuredRequest<T>) {
    const raw =
      r.task === "business-agent-decision"
        ? {
            action: (r.input.observations as unknown[]).length
              ? "final"
              : "tool",
            query: (r.input.observations as unknown[]).length
              ? ""
              : "React TypeScript CV",
          }
        : r.task === "cv-analysis"
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
          : r.task === "cv-role-match"
            ? {
                roleCode: "g3-sixth",
                factIndexes: [0],
                confidence: 0.9,
                reason: "React is supported by the cited CV.",
              }
            : {
                slotId: (r.input.slots as Array<{ id: string }>)[0].id,
                reason: "First offered slot",
              };
    return {
      data: r.validate(raw),
      model: "fixture",
      latencyMs: 1,
      inputTokens: 100,
      outputTokens: 100,
    };
  },
};
const email = () => `${randomUUID()}@vintern.test`;
const submit = (mail: string) =>
  apps.apply(
    {
      roundId,
      fullName: "Ứng viên local",
      email: mail,
      consentVersion: "cv-consent-v1",
    },
    file(),
  );
async function verificationToken(mail: string) {
  const [row] = await db.query(
    "SELECT m.id,m.sealedPayload FROM mail_outbox m JOIN cv_applications a ON m.eventKey=CONCAT('cv.verify:',LOWER(CONVERT(varchar(36),a.id)),':1') WHERE a.email=@0",
    [mail],
  );
  const envelope = openMail(row.sealedPayload, key, row.id) as { text: string };
  return envelope.text.match(/#verify=([\w-]+)/)![1];
}
beforeAll(async () => {
  process.env.MAIL_ENCRYPTION_KEY = key;
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(process.env.E2E_DB_NAME ?? "") ||
    source.options.type !== "mssql"
  )
    throw Error("Disposable SQL required");
  db = new DataSource({ ...source.options, database: process.env.E2E_DB_NAME });
  await db.initialize();
  await ensureRbac(db);
  async function user() {
    const suffix = randomUUID().slice(0, 8),
      role = await db
        .getRepository(Role)
        .findOneByOrFail({ code: "instructor" });
    const u = await db.getRepository(User).save({
      email: `${suffix}@vintern.test`,
      username: suffix,
      displayName: suffix,
      status: "active",
      passwordHash: await hash(password, 10),
    });
    await db.getRepository(UserRole).insert({ userId: u.id, roleId: role.id });
    return u;
  }
  owner = await user();
  outsider = await user();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_PROVIDER_TOKEN)
    .useValue(deterministicProvider)
    .compile();
  app = module.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  apps = app.get(ApplicationsService);
  rounds = app.get(RecruitmentRoundsService);
  storage = app.get(CvStorage);
  bookings = app.get(InterviewBookingsService);
  const round = await rounds.create(owner.id, {
    name: "Đợt tuyển local G3",
    opensAt: new Date(Date.now() - 3600000).toISOString(),
    closesAt: new Date(Date.now() + 86400000).toISOString(),
  });
  roundId = round.id;
  await db.query("UPDATE recruitment_rounds SET status='open' WHERE id=@0", [
    roundId,
  ]);
  cv = await pdf();
  // A dynamically added sixth career, with the exact bank stages used by the selector.
  await db.query(
    "INSERT INTO career_roles(code,name,description,requiredSkillsJson,status,acceptingApplications) VALUES('g3-sixth',N'G3 Mobile','Small mobile app','[\"React\"]','published',1)",
  );
  for (let n = 0; n < 10; n++)
    await db.query(
      "INSERT INTO interview_questions(id,roleCode,category,difficulty,prompt,rubricJson,isActive,sortOrder) VALUES(@0,'g3-sixth',@1,'easy','Synthetic question',@2,1,@3)",
      [
        randomUUID(),
        n < 6 ? "technical" : "soft",
        JSON.stringify({
          phase: n < 6 ? "technical" : n < 8 ? "introduction" : "english",
        }),
        n,
      ],
    );
  const base = {
    roleCode: "g3-sixth",
    startsAt: new Date(Date.now() + 3 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 4 * 3600000).toISOString(),
    capacity: 1,
    timezone: "Asia/Ho_Chi_Minh",
    minimumPreparationMinutes: 60,
    credentialsLeadMinutes: 30,
  };
  const first = await rounds.addSlot(owner.id, roundId, base);
  slotId = first.slots[0].id;
  const second = await rounds.addSlot(owner.id, roundId, {
    ...base,
    startsAt: new Date(Date.now() + 5 * 3600000).toISOString(),
    endsAt: new Date(Date.now() + 6 * 3600000).toISOString(),
  });
  secondSlotId = second.slots[1].id;
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) {
    const rows = await db.query(
      "SELECT fileId FROM cv_applications WHERE roundId=@0 AND fileId IS NOT NULL",
      [roundId],
    );
    for (const row of rows) await storage.remove(row.fileId);
    const applications = await db.query(
      "SELECT a.id,b.id bookingId FROM cv_applications a LEFT JOIN interview_bookings b ON b.applicationId=a.id WHERE a.roundId=@0",
      [roundId],
    );
    for (const a of applications)
      await db.query(
        "UPDATE mail_outbox SET status='cancelled',sealedPayload=NULL WHERE status IN('pending','uncertain','dead') AND (eventKey LIKE @0 OR eventKey LIKE @1 OR eventKey LIKE @2)",
        [
          `cv.verify:${a.id}:%`,
          `cv.access:${a.id}:%`,
          `booking:${a.bookingId}:%`,
        ],
      );
  }
  await app?.close();
  if (db?.isInitialized) await db.destroy();
});
describe("verified public CV applications on SQL Server", () => {
  it("extracts literal PDF pages and DOCX paragraphs; scanned PDF yields no fabricated OCR", async () => {
    expect(
      (await storage.extract(cv, "application/pdf", "cv.pdf")).segments[0],
    ).toMatchObject({ ref: "page:1", text: expect.stringContaining("React") });
    expect(
      (await storage.extract(await pdf(""), "application/pdf", "scan.pdf"))
        .segments,
    ).toEqual([]);
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file(
      "word/document.xml",
      '<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>I built a small TypeScript application and wrote automated tests.</w:t></w:r></w:p></w:body></w:document>',
    );
    expect(
      (
        await storage.extract(
          await zip.generateAsync({ type: "nodebuffer" }),
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "cv.docx",
        )
      ).segments[0],
    ).toMatchObject({
      ref: "paragraph:1",
      text: expect.stringContaining("TypeScript"),
    });
    zip.file("word/vbaProject.bin", "macro");
    await expect(
      storage.extract(
        await zip.generateAsync({ type: "nodebuffer" }),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "cv.docx",
      ),
    ).rejects.toThrow();
  });
  it("rejects a bounded compressed-bomb fixture and external-entity XML without treating either as CV evidence", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file(
      "word/document.xml",
      '<w:document xmlns:w="urn:w"><w:body/></w:document>',
    );
    zip.file("word/oversized.txt", Buffer.alloc(21 * 1024 * 1024));
    const compressed = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    expect(compressed.length).toBeLessThan(5 * 1024 * 1024);
    await expect(
      storage.extract(
        compressed,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "cv.docx",
      ),
    ).rejects.toThrow();
    zip.remove("word/oversized.txt");
    zip.file(
      "word/document.xml",
      '<!DOCTYPE cv [<!ENTITY x SYSTEM "http://127.0.0.1:1/private">]><w:document xmlns:w="urn:w"><w:p>&x;</w:p></w:document>',
    );
    await expect(
      storage.extract(
        await zip.generateAsync({ type: "nodebuffer" }),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "cv.docx",
      ),
    ).rejects.toThrow();
  });
  it("requires consent/open round and never lets duplicate requests overwrite a candidate CV", async () => {
    const mail = email();
    await expect(
      apps.apply(
        { roundId, fullName: "Name", email: mail, consentVersion: "wrong" },
        file(),
      ),
    ).rejects.toThrow();
    await Promise.all([submit(mail), submit(mail)]);
    const rows = await db.query(
      "SELECT id,revision FROM cv_applications WHERE email=@0",
      [mail],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(1);
    expect(
      (
        await db.query(
          "SELECT COUNT(*) n FROM mail_outbox WHERE eventKey LIKE 'cv.verify:%' AND eventKey LIKE @0",
          [`%${rows[0].id.toLowerCase()}%`],
        )
      )[0].n,
    ).toBe(1);
  });
  it("uses expiring single-use verification, rotates a separate HttpOnly candidate session and prevents IDOR", async () => {
    const mail = email();
    await submit(mail);
    const token = await verificationToken(mail);
    const verified = await request(app.getHttpServer())
      .post("/api/v1/applications/verify")
      .send({ token })
      .expect(201);
    const cookie = verified.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(verified.body).toEqual({ verified: true });
    await request(app.getHttpServer())
      .post("/api/v1/applications/verify")
      .send({ token })
      .expect(400);
    const response = await request(app.getHttpServer())
      .get("/api/v1/applications/me")
      .set("Cookie", cookie)
      .expect(200);
    expect(response.body).toMatchObject({ status: "queued", hasCv: true });
    expect(JSON.stringify(response.body)).not.toContain(mail);
    await request(app.getHttpServer())
      .get("/api/v1/applications/me")
      .expect(401);
    await expect(
      apps.staffApplication(outsider.id, roundId, response.body.id),
    ).rejects.toThrow();
    const download = await request(app.getHttpServer())
      .get("/api/v1/applications/me/cv")
      .set("Cookie", cookie)
      .expect(200);
    expect(download.headers["content-disposition"]).toBe(
      'attachment; filename="cv.pdf"',
    );
  });
  it("rejects expiry and unreadable scanned CV becomes needs-information after verification", async () => {
    const mail = email();
    await submit(mail);
    const token = await verificationToken(mail);
    await db.query(
      "UPDATE cv_applications SET verificationExpiresAt=DATEADD(second,-1,SYSUTCDATETIME()) WHERE email=@0",
      [mail],
    );
    await expect(apps.verify(token)).rejects.toThrow();
    const scanEmail = email();
    await apps.apply(
      {
        roundId,
        fullName: "Scanned candidate",
        email: scanEmail,
        consentVersion: "cv-consent-v1",
      },
      { ...file(), buffer: await pdf("") },
    );
    const capability = await apps.verify(await verificationToken(scanEmail));
    expect(await apps.view(await apps.candidate(capability))).toMatchObject({
      status: "needs_information",
    });
    await expect(apps.candidate("a".repeat(43))).rejects.toThrow();
  });
  it("bounds verification resend and does not reveal whether an address applied", async () => {
    const mail = email();
    await submit(mail);
    await apps.requestAccess(roundId, mail);
    expect(await apps.requestAccess(roundId, email())).toEqual({
      accepted: true,
    });
    const [a] = await db.query(
      "SELECT id FROM cv_applications WHERE email=@0",
      [mail],
    );
    expect(
      (
        await db.query(
          "SELECT COUNT(*) n FROM mail_outbox WHERE eventKey LIKE @0",
          [`cv.access:${a.id}:%`],
        )
      )[0].n,
    ).toBe(0);
    await db.query(
      "UPDATE cv_applications SET lastVerificationSentAt=DATEADD(second,-61,SYSUTCDATETIME()) WHERE id=@0",
      [a.id],
    );
    await Promise.all([
      apps.requestAccess(roundId, mail),
      apps.requestAccess(roundId, mail),
    ]);
    expect(
      (
        await db.query(
          "SELECT COUNT(*) n FROM mail_outbox WHERE eventKey LIKE @0",
          [`cv.access:${a.id}:%`],
        )
      )[0].n,
    ).toBe(1);
  });
  it("serializes the last seat, returns the same booking on retry, provisions credentials once and keeps them out of public responses", async () => {
    async function prepared() {
      const mail = email();
      await submit(mail);
      const capability = await apps.verify(await verificationToken(mail));
      const a = await apps.candidate(capability);
      await db.query(
        "UPDATE cv_applications SET matchedRole='g3-sixth' WHERE id=@0",
        [a.id],
      );
      return a;
    }
    const [a, b] = await Promise.all([prepared(), prepared()]);
    const results = await Promise.all([
      bookings.reserve(owner.id, a.id, slotId),
      bookings.reserve(owner.id, b.id, slotId),
    ]);
    expect(results.filter((r) => r.booked)).toHaveLength(1);
    const winner = results[0].booked ? a : b,
      result = await bookings.reserve(owner.id, winner.id, slotId);
    expect(result).toMatchObject({ booked: true, duplicate: true });
    const [saved] = await db.query(
      "SELECT userId FROM cv_applications WHERE id=@0",
      [winner.id],
    );
    const user = await db
      .getRepository(User)
      .findOneByOrFail({ id: saved.userId });
    expect(user.mustChangePassword).toBe(true);
    const jobs = await db.query(
      "SELECT id,kind,sealedPayload,sensitive,availableAt FROM mail_outbox WHERE eventKey LIKE @0",
      [`booking:${result.id}:%`],
    );
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j: { kind: string }) => j.kind).sort()).toEqual([
      "credentials",
      "schedule",
    ]);
    const credentials = jobs.find(
        (j: { kind: string }) => j.kind === "credentials",
      ),
      envelope = openMail(credentials.sealedPayload, key, credentials.id) as {
        text: string;
      };
    const temporaryPassword = envelope.text.match(/Mật khẩu tạm: ([\w-]+)/)![1];
    expect(JSON.stringify(await apps.view(winner))).not.toContain(
      temporaryPassword,
    );
    expect(user.passwordHash).not.toContain(temporaryPassword);
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: winner.email, password: temporaryPassword })
      .expect(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    await request(app.getHttpServer())
      .get("/api/v1/recruitment/me")
      .auth(login.body.accessToken, { type: "bearer" })
      .expect(403);
    await request(app.getHttpServer())
      .post("/api/v1/auth/change-password")
      .auth(login.body.accessToken, { type: "bearer" })
      .send({
        currentPassword: temporaryPassword,
        newPassword: "Changed-Password-123!",
      })
      .expect(201);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .auth(login.body.accessToken, { type: "bearer" })
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: winner.email, password: temporaryPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: winner.email, password: "Changed-Password-123!" })
      .expect(200);
    await bookings.reschedule(owner.id, roundId, winner.id, secondSlotId);
    const current = await db
      .getRepository(User)
      .findOneByOrFail({ id: user.id });
    expect(current.passwordHash).not.toBe(user.passwordHash);
    expect(current.mustChangePassword).toBe(false);
    const oldJobs = await db.query(
      "SELECT status FROM mail_outbox WHERE eventKey=@0",
      [`booking:${result.id}:1:schedule`],
    );
    expect(oldJobs[0].status).toBe("cancelled");
    const moved = await db.query(
      "SELECT availableAt FROM mail_outbox WHERE eventKey=@0",
      [`booking:${result.id}:2:credentials`],
    );
    expect(moved).toHaveLength(1);
    await bookings.cancel(owner.id, roundId, winner.id);
    expect(
      (
        await db.query(
          "SELECT COUNT(*) n FROM mail_outbox WHERE eventKey LIKE @0 AND status='pending'",
          [`booking:${result.id}:%`],
        )
      )[0].n,
    ).toBe(0);
  });
  it("never resets an existing intern password or consumed attempts and fails honestly at the attempt limit", async () => {
    const mail = email();
    await submit(mail);
    const a = await apps.candidate(
      await apps.verify(await verificationToken(mail)),
    );
    const user = await db.getRepository(User).save({
      email: mail,
      username: randomUUID(),
      displayName: "Existing candidate",
      status: "active",
      passwordHash: await hash(password, 10),
    });
    const role = await db
      .getRepository(Role)
      .findOneByOrFail({ code: "intern" });
    await db
      .getRepository(UserRole)
      .insert({ userId: user.id, roleId: role.id });
    await db
      .getRepository(RecruitmentProfile)
      .save({ userId: user.id, status: "failed", attemptCount: 2 });
    await db.query(
      "UPDATE cv_applications SET matchedRole='g3-sixth' WHERE id=@0",
      [a.id],
    );
    const before = user.passwordHash;
    const recruitment = app.get(RecruitmentService), limits = recruitment.attemptConfig();
    const stricter = jest.spyOn(recruitment, 'attemptConfig').mockReturnValue({...limits, maxAttempts:2});
    try {
      await expect(bookings.reserve(owner.id, a.id, slotId)).rejects.toMatchObject({response:{code:'RECRUITMENT_NOT_ELIGIBLE'}});
    } finally {
      stricter.mockRestore();
    }
    const result = await bookings.reserve(owner.id, a.id, slotId);
    expect(result.booked).toBe(true);
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .passwordHash,
    ).toBe(before);
    expect(
      (
        await db
          .getRepository(RecruitmentProfile)
          .findOneByOrFail({ userId: user.id })
      ).attemptCount,
    ).toBe(2);
    const [job] = await db.query(
      "SELECT kind FROM mail_outbox WHERE eventKey=@0",
      [`booking:${result.id}:1:credentials`],
    );
    expect(job.kind).toBe("existing-account");
    await bookings.cancel(owner.id, roundId, a.id);
    await db.query("UPDATE cv_applications SET status='queued' WHERE id=@0", [
      a.id,
    ]);
    await db.query(
      "UPDATE recruitment_profiles SET attemptCount=3,status='failed' WHERE userId=@0",
      [user.id],
    );
    await expect(bookings.reserve(owner.id, a.id, slotId)).rejects.toThrow();
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .passwordHash,
    ).toBe(before);
  });
  it("retries the same protected credential only for the owned current booking without resetting any password", async () => {
    const mail = email();
    await submit(mail);
    const a = await apps.candidate(
      await apps.verify(await verificationToken(mail)),
    );
    await db.query(
      "UPDATE cv_applications SET matchedRole='g3-sixth' WHERE id=@0",
      [a.id],
    );
    const booking = await bookings.reserve(owner.id, a.id, slotId);
    const [userBefore] = await db.query(
      "SELECT passwordHash FROM users WHERE email=@0",
      [mail],
    );
    const [job] = await db.query(
      "SELECT id,sealedPayload FROM mail_outbox WHERE eventKey=@0",
      [`booking:${booking.id}:1:credentials`],
    );
    await db.query("UPDATE mail_outbox SET status='uncertain' WHERE id=@0", [
      job.id,
    ]);
    await expect(
      bookings.resendCredentials(outsider.id, roundId, a.id, true),
    ).rejects.toThrow();
    await expect(
      bookings.resendCredentials(owner.id, roundId, a.id, false),
    ).rejects.toThrow();
    await bookings.resendCredentials(owner.id, roundId, a.id, true);
    await expect(
      bookings.resendCredentials(owner.id, roundId, a.id, true),
    ).rejects.toThrow();
    expect(
      (
        await db.query("SELECT sealedPayload FROM mail_outbox WHERE id=@0", [
          job.id,
        ])
      )[0].sealedPayload,
    ).toBe(job.sealedPayload);
    expect(
      (
        await db.query("SELECT passwordHash FROM users WHERE email=@0", [mail])
      )[0].passwordHash,
    ).toBe(userBefore.passwordHash);
    await bookings.cancel(owner.id, roundId, a.id);
  });
  it("coordinates the domain workflow with isolated Agent fixtures and keeps cancellation final", async () => {
    // Isolate the workflow candidate from previous queued fixtures.
    await db.query(
      "UPDATE cv_applications SET status='needs_information' WHERE roundId=@0 AND status='queued'",
      [roundId],
    );
    const mail = email();
    await submit(mail);
    const a = await apps.candidate(
      await apps.verify(await verificationToken(mail)),
    );
    const agents = {
      analyze: jest.fn().mockResolvedValue({
        confidence: 0.9,
        facts: [{ skill: "React", ref: "page:1", quote: "React" }],
        missing: [],
      }),
      match: jest.fn().mockResolvedValue({
        roleCode: "g3-sixth",
        confidence: 0.9,
        factIndexes: [0],
        reason: "Matches",
      }),
      coordinate: jest.fn().mockResolvedValue({ slotId, reason: "Earliest" }),
    };
    const workflow = new ApplicationWorkflow(
      db,
      app.get(ConfigService),
      apps,
      agents as unknown as IntakeAgents,
      bookings,
    );
    await Promise.all([workflow.tick(), workflow.tick()]);
    expect(agents.analyze).toHaveBeenCalledTimes(1);
    expect(agents.match).toHaveBeenCalledTimes(1);
    expect(agents.coordinate).toHaveBeenCalledTimes(1);
    expect(
      (
        await db.query("SELECT status FROM cv_applications WHERE id=@0", [a.id])
      )[0].status,
    ).toBe("booked");
    expect((await apps.staffView(owner.id, roundId, a.id)).analysis).toMatchObject({
      facts: { confidence: 0.9, facts: [{ skill: 'React', ref: 'page:1', quote: 'React' }] },
      match: { roleCode: 'g3-sixth', reason: 'Matches' },
    });
    await bookings.cancel(owner.id, roundId, a.id);
    await db.query(
      "UPDATE interview_slots SET status='closed' WHERE roundId=@0",
      [roundId],
    );
    await workflow.retry(owner.id, roundId, a.id); // cancellation cannot be retried silently
    expect(
      (
        await db.query("SELECT status FROM cv_applications WHERE id=@0", [a.id])
      )[0].status,
    ).toBe("cancelled");
    const waitEmail = email();
    await submit(waitEmail);
    const waiting = await apps.candidate(
      await apps.verify(await verificationToken(waitEmail)),
    );
    await workflow.tick();
    expect(
      (
        await db.query("SELECT status FROM cv_applications WHERE id=@0", [
          waiting.id,
        ])
      )[0].status,
    ).toBe("waitlisted");
  });
  it("runs the real CV Analyst graph and reuses its checkpointed result on replay", async () => {
    await db.query(
      "UPDATE cv_applications SET status='needs_information' WHERE roundId=@0 AND status='queued'",
      [roundId],
    );
    await db.query(
      "UPDATE interview_slots SET status='open' WHERE roundId=@0",
      [roundId],
    );
    const mail = email();
    await submit(mail);
    graphApplication = await apps.candidate(
      await apps.verify(await verificationToken(mail)),
    );
    const actualAgents = app.get(IntakeAgents);
    graphSpy = jest.spyOn(deterministicProvider, "generateStructured");
    graphFacts = await actualAgents.analyze(
      owner.id,
      graphApplication.id,
      1,
      JSON.parse(graphApplication.segmentsJson!),
    );
    expect(graphFacts.facts[0].skill).toBe("React");
    const calls = graphSpy.mock.calls.length;
    expect(
      await actualAgents.analyze(
        owner.id,
        graphApplication.id,
        1,
        JSON.parse(graphApplication.segmentsJson!),
      ),
    ).toEqual(graphFacts);
    expect(graphSpy).toHaveBeenCalledTimes(calls);
  });
  it("runs the real Role Matcher graph against the sixth dynamic career", async () => {
    const roles = await bookings.recruitingRoles(roundId);
    graphMatch = await app
      .get(IntakeAgents)
      .match(owner.id, graphApplication.id, 1, graphFacts, roles);
    expect(graphMatch.roleCode).toBe("g3-sixth");
    await db.query("UPDATE cv_applications SET matchedRole=@1 WHERE id=@0", [
      graphApplication.id,
      graphMatch.roleCode,
    ]);
  });
  it("runs the real Coordinator graph and reserves only a still-open slot with complete provenance", async () => {
    const slots = await bookings.available(roundId, graphMatch.roleCode!);
    const choice = await app
      .get(IntakeAgents)
      .coordinate(
        owner.id,
        graphApplication.id,
        1,
        graphMatch.roleCode!,
        slots,
      );
    expect(
      (await bookings.reserve(owner.id, graphApplication.id, choice.slotId!))
        .booked,
    ).toBe(true);
    const runs = await db.query(
      "SELECT agentId,status FROM agent_runs WHERE LOWER(JSON_VALUE(inputJson,'$.resourceId'))=LOWER(@0)",
      [graphApplication.id],
    );
    expect(runs.map((r: { agentId: string }) => r.agentId).sort()).toEqual([
      "cv-analyst",
      "interview-coordinator",
      "role-matcher",
    ]);
    expect(
      runs.every((r: { status: string }) => r.status === "succeeded"),
    ).toBe(true);
    const modelInputs = JSON.stringify(
      graphSpy.mock.calls.map(([r]) => r.input),
    );
    expect(modelInputs).not.toContain(graphApplication.email);
    expect(modelInputs).not.toContain("Mật khẩu tạm");
    expect(modelInputs).not.toContain(key);
    const [cp] = await db.query(
      "SELECT COUNT(*) n FROM agent_checkpoints c JOIN agent_runs r ON r.id=c.runId WHERE LOWER(JSON_VALUE(r.inputJson,'$.resourceId'))=LOWER(@0)",
      [graphApplication.id],
    );
    expect(cp.n).toBeGreaterThan(0);
    graphSpy.mockRestore();
  });
  it("denies an unverified CV and an unrelated instructor before any model call", async () => {
    const actualAgents = app.get(IntakeAgents);
    await expect(
      actualAgents.analyze(outsider.id, graphApplication.id, 1, []),
    ).rejects.toThrow();
    const otherMail = email();
    await submit(otherMail);
    const [unverified] = await db.query(
      "SELECT id FROM cv_applications WHERE email=@0",
      [otherMail],
    );
    await expect(
      actualAgents.analyze(owner.id, unverified.id, 1, [
        { ref: "page:1", text: "React and TypeScript" },
      ]),
    ).rejects.toThrow();
  });
});
