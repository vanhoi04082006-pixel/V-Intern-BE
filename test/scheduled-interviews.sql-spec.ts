import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import request from "supertest";
import source from "../src/database/data-source";
import { AppModule } from "../src/app.module";
import { ensureRbac } from "../src/bootstrap/ensure-rbac";
import { ensureRecruitmentQuestions } from "../src/recruitment/question-seed";
import { User } from "../src/users/entities/user.entity";
import { Role } from "../src/rbac/entities/role.entity";
import { UserRole } from "../src/rbac/entities/user-role.entity";
import { RecruitmentProfile } from "../src/recruitment/entities/recruitment-profile.entity";
import { AI_PROVIDER_TOKEN } from "../src/ai/ai-provider.interface";
import { InterviewAdmissionsService } from "../src/recruitment/interview-admissions.service";
import { ConfigService } from "@nestjs/config";
import { digest } from "../src/applications/applications.service";
import { InterviewBookingsService } from "../src/applications/interview-bookings.service";

let db: DataSource, app: INestApplication, roundId: string, ownerId: string;
const future = () => new Date(Date.now() + 3600000);
it.each(["intern", "instructor"])(
  "uses effective group roles when linking an existing %s account to CV intake",
  async (inherited) => {
    const c = await candidate(new Date(Date.now() + 10800000)),
      group = randomUUID(),
      role = await db.getRepository(Role).findOneByOrFail({ code: inherited });
    // Replace only the unused scaffold booking in this disposable fixture with a real domain reservation.
    await db.query("DELETE FROM interview_bookings WHERE id=@0", [c.bookingId]);
    if (inherited === "intern")
      await db.query("DELETE FROM user_roles WHERE userId=@0", [c.userId]);
    await db.query(
      "INSERT INTO user_groups(id,code,name) VALUES(@0,@1,N'G4 effective role fixture')",
      [group, `g4-${group}`],
    );
    await db.query("INSERT INTO group_members(groupId,userId) VALUES(@0,@1)", [
      group,
      c.userId,
    ]);
    await db.query("INSERT INTO group_roles(groupId,roleId) VALUES(@0,@1)", [
      group,
      role.id,
    ]);
    const action = app
      .get(InterviewBookingsService)
      .reserve(ownerId, c.applicationId, c.slotId);
    if (inherited === "intern")
      expect(await action).toMatchObject({ booked: true });
    else
      await expect(action).rejects.toMatchObject({
        response: expect.objectContaining({
          code: "EXISTING_ACCOUNT_REQUIRES_REVIEW",
        }),
      });
    expect(
      (await db.getRepository(User).findOneByOrFail({ id: c.userId }))
        .passwordHash,
    ).toBe("not-a-login-hash");
    expect(
      (
        await db
          .getRepository(RecruitmentProfile)
          .findOneByOrFail({ userId: c.userId })
      ).attemptCount,
    ).toBe(0);
  },
);
beforeAll(async () => {
  process.env.MAIL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(process.env.E2E_DB_NAME ?? "") ||
    source.options.type !== "mssql"
  )
    throw Error("Disposable SQL only");
  db = new DataSource({ ...source.options, database: process.env.E2E_DB_NAME });
  await db.initialize();
  await ensureRbac(db);
  await ensureRecruitmentQuestions(db);
  ownerId = await user("instructor");
  roundId = randomUUID();
  await db.query(
    "INSERT INTO recruitment_rounds(id,ownerId,name,status,opensAt,closesAt) VALUES(@0,@1,N'G4 QA','open',DATEADD(day,-1,SYSUTCDATETIME()),DATEADD(day,7,SYSUTCDATETIME()))",
    [roundId, ownerId],
  );
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DataSource)
    .useValue(db)
    .overrideProvider(AI_PROVIDER_TOKEN)
    .useValue({
      name: "not-called",
      generateStructured: () => {
        throw Error("No model call expected for admission");
      },
    })
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
}, 120000);
afterAll(async () => {
  if (db?.isInitialized && ownerId) {
    await db.query(
      "UPDATE mail_outbox SET status='cancelled',sealedPayload=NULL WHERE ownerId=@0 AND status IN('pending','uncertain','dead')",
      [ownerId],
    );
    const bookings: Array<{ id: string }> = await db.query(
      "SELECT b.id FROM interview_bookings b JOIN cv_applications a ON a.id=b.applicationId JOIN recruitment_rounds r ON r.id=a.roundId WHERE r.ownerId=@0",
      [ownerId],
    );
    for (const booking of bookings)
      await db.query(
        "UPDATE mail_outbox SET status='cancelled',sealedPayload=NULL WHERE eventKey LIKE @0 AND status IN('pending','uncertain','dead')",
        [`booking:${booking.id}:%`],
      );
  }
  if (app) await app.close();
  if (db?.isInitialized) await db.destroy();
});
afterEach(() => jest.restoreAllMocks());
async function user(roleCode = "intern") {
  const id = randomUUID(),
    role = await db.getRepository(Role).findOneByOrFail({ code: roleCode });
  await db.getRepository(User).insert({
    id,
    email: `${id}@g4.test`,
    username: id,
    displayName: "G4 QA",
    status: "active",
    passwordHash: "not-a-login-hash",
  });
  await db.getRepository(UserRole).insert({ userId: id, roleId: role.id });
  return id;
}
async function candidate(
  startsAt = future(),
  existing?: { userId: string; roundId: string },
) {
  const userId = existing?.userId ?? (await user()),
    applicationId = randomUUID(),
    slotId = randomUUID(),
    bookingId = randomUUID();
  const targetRound = existing?.roundId ?? roundId;
  if (!existing)
    await db.getRepository(RecruitmentProfile).insert({
      userId,
      status: "role_selected",
      selectedRole: "frontend",
      attemptCount: 0,
    });
  await db.query(
    "INSERT INTO cv_applications(id,roundId,email,fullName,consentVersion,consentedAt,verifiedAt,status,matchedRole,userId) VALUES(@0,@1,@2,N'G4 QA','cv-consent-v1',SYSUTCDATETIME(),SYSUTCDATETIME(),'booked','frontend',@3)",
    [applicationId, targetRound, `${userId}@g4.test`, userId],
  );
  await db.query(
    "INSERT INTO interview_slots(id,roundId,roleCode,startsAt,endsAt,timezone,capacity,minimumPreparationMinutes,credentialsLeadMinutes) VALUES(@0,@1,'frontend',@2,@3,'Asia/Ho_Chi_Minh',1,60,30)",
    [
      slotId,
      targetRound,
      startsAt.toISOString(),
      new Date(startsAt.getTime() + 1800000).toISOString(),
    ],
  );
  await db.query(
    "INSERT INTO interview_bookings(id,applicationId,slotId) VALUES(@0,@1,@2)",
    [bookingId, applicationId, slotId],
  );
  return {
    userId,
    applicationId,
    bookingId,
    slotId,
    startsAt,
    token: app.get(JwtService).sign({ sub: userId, av: 0 }),
  };
}
const route = "/api/v1/recruitment";
it("rejects early direct start and never consumes an attempt", async () => {
  const c = await candidate();
  const response = await request(app.getHttpServer())
    .post(`${route}/me/interviews`)
    .auth(c.token, { type: "bearer" })
    .send({})
    .expect(409);
  expect(response.body.code).toBe("INTERVIEW_NOT_STARTED_YET");
  expect(
    (
      await db
        .getRepository(RecruitmentProfile)
        .findOneByOrFail({ userId: c.userId })
    ).attemptCount,
  ).toBe(0);
});
it("locks the assigned CV career against direct role selection", async () => {
  const c = await candidate();
  const response = await request(app.getHttpServer())
    .patch(`${route}/me/role`)
    .auth(c.token, { type: "bearer" })
    .send({ role: "backend" })
    .expect(409);
  expect(response.body.code).toBe("RECRUITMENT_SCHEDULE_ROLE_LOCKED");
  expect(
    (
      await db
        .getRepository(RecruitmentProfile)
        .findOneByOrFail({ userId: c.userId })
    ).selectedRole,
  ).toBe("frontend");
});
it("admits at T+14:59, resumes after T+15 and reads the same admission after a service restart", async () => {
  const c = await candidate(),
    clock = app.get(InterviewAdmissionsService);
  jest
    .spyOn(clock, "now")
    .mockReturnValue(new Date(c.startsAt.getTime() + 899000));
  const response = await request(app.getHttpServer())
    .post(`${route}/me/interviews`)
    .auth(c.token, { type: "bearer" })
    .send({})
    .expect(201);
  const sessionId = response.body.session.id;
  const late = new Date(c.startsAt.getTime() + 1200000);
  await clock.sweep(late);
  const fresh = new InterviewAdmissionsService(
    db,
    new ConfigService({ NODE_ENV: "test" }),
  );
  jest.spyOn(fresh, "now").mockReturnValue(late);
  expect(await fresh.view(c.userId)).toMatchObject({
    phase: "started",
    sessionId,
  });
  await request(app.getHttpServer())
    .get(`${route}/me/interviews/${sessionId}`)
    .auth(c.token, { type: "bearer" })
    .expect(200);
  expect(
    (
      await db.query("SELECT status FROM cv_applications WHERE id=@0", [
        c.applicationId,
      ])
    )[0].status,
  ).toBe("booked");
  expect(
    (
      await db
        .getRepository(RecruitmentProfile)
        .findOneByOrFail({ userId: c.userId })
    ).attemptCount,
  ).toBe(1);
});
it("persists exactly T+15 no-show despite HTTP 409 without consuming an interview attempt", async () => {
  const c = await candidate(),
    clock = app.get(InterviewAdmissionsService),
    late = new Date(c.startsAt.getTime() + 900000);
  jest.spyOn(clock, "now").mockReturnValue(late);
  const response = await request(app.getHttpServer())
    .post(`${route}/me/interviews`)
    .auth(c.token, { type: "bearer" })
    .send({})
    .expect(409);
  expect(response.body.code).toBe("INTERVIEW_NO_SHOW");
  await clock.sweep(late);
  const [attendance] = await db.query(
    "SELECT sessionId,noShowAt FROM interview_admissions WHERE bookingId=@0",
    [c.bookingId],
  );
  expect(attendance.sessionId).toBeNull();
  expect(attendance.noShowAt.toISOString()).toBe(late.toISOString());
  expect(
    (
      await db.query("SELECT status FROM cv_applications WHERE id=@0", [
        c.applicationId,
      ])
    )[0].status,
  ).toBe("deferred");
  expect(
    (
      await db
        .getRepository(RecruitmentProfile)
        .findOneByOrFail({ userId: c.userId })
    ).attemptCount,
  ).toBe(0);
});
it("serializes two starts and a no-show worker, keeping one admission and one consumed attempt", async () => {
  const c = await candidate(),
    clock = app.get(InterviewAdmissionsService),
    ready = new Date(c.startsAt.getTime() + 899000);
  jest.spyOn(clock, "now").mockReturnValue(ready);
  const responses = await Promise.all([
    request(app.getHttpServer())
      .post(`${route}/me/interviews`)
      .auth(c.token, { type: "bearer" })
      .send({}),
    request(app.getHttpServer())
      .post(`${route}/me/interviews`)
      .auth(c.token, { type: "bearer" })
      .send({}),
    clock.sweep(new Date(c.startsAt.getTime() + 900000)),
  ]);
  const statuses = responses
    .slice(0, 2)
    .map((response) => (response as request.Response).status)
    .sort();
  const [count] = await db.query(
    "SELECT COUNT(*) n FROM interview_admissions WHERE bookingId=@0",
    [c.bookingId],
  );
  expect(count.n).toBe(1);
  const [attendance] = await db.query(
    "SELECT sessionId,noShowAt FROM interview_admissions WHERE bookingId=@0",
    [c.bookingId],
  );
  const profile = await db
    .getRepository(RecruitmentProfile)
    .findOneByOrFail({ userId: c.userId });
  if (attendance.sessionId) {
    expect(statuses).toEqual([201, 409]);
    expect(attendance.noShowAt).toBeNull();
    expect(profile.attemptCount).toBe(1);
  } else {
    expect(statuses).toEqual([409, 409]);
    expect(attendance.noShowAt).not.toBeNull();
    expect(profile.attemptCount).toBe(0);
  }
});
async function nextSlot(startsAt: Date) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO interview_slots(id,roundId,roleCode,startsAt,endsAt,timezone,capacity,minimumPreparationMinutes,credentialsLeadMinutes) VALUES(@0,@1,'frontend',@2,@3,'Asia/Ho_Chi_Minh',1,60,30)",
    [
      id,
      roundId,
      startsAt.toISOString(),
      new Date(startsAt.getTime() + 1800000).toISOString(),
    ],
  );
  return id;
}
const staffToken = (id = ownerId) =>
  app.get(JwtService).sign({ sub: id, av: 0 });
const retakePath = (id: string) =>
  `/api/v1/recruitment-rounds/${roundId}/applications/${id}/retake`;
it("requires a staff-owned fresh appointment for retake, preserves prior attendance and does not reset attempts/passwords", async () => {
  const c = await candidate(),
    clock = app.get(InterviewAdmissionsService);
  jest.spyOn(clock, "now").mockReturnValue(c.startsAt);
  const first = await request(app.getHttpServer())
    .post(`${route}/me/interviews`)
    .auth(c.token, { type: "bearer" })
    .send({})
    .expect(201);
  await db.query(
    "UPDATE interview_sessions SET status='completed' WHERE id=@0",
    [first.body.session.id],
  );
  await db.query(
    "UPDATE recruitment_profiles SET status='failed' WHERE userId=@0",
    [c.userId],
  );
  const startsAt = new Date(c.startsAt.getTime() + 3600000),
    slotId = await nextSlot(startsAt),
    body = { slotId, reason: "Đã thống nhất lịch phỏng vấn lại với ứng viên." };
  const detail = await request(app.getHttpServer())
    .get(
      `/api/v1/recruitment-rounds/${roundId}/applications/${c.applicationId}`,
    )
    .auth(staffToken(), { type: "bearer" })
    .expect(200);
  expect(detail.body.interviewPolicy).toMatchObject({
    canRebook: true,
    attemptsUsed: 1,
    allowedRoleCodes: ["frontend"],
  });
  expect(detail.body.interviewPolicy.serverNow).toBe(c.startsAt.toISOString());
  await request(app.getHttpServer())
    .post(retakePath(c.applicationId))
    .auth(c.token, { type: "bearer" })
    .send(body)
    .expect(403);
  const outsider = await user("instructor");
  await request(app.getHttpServer())
    .post(retakePath(c.applicationId))
    .auth(staffToken(outsider), { type: "bearer" })
    .send(body)
    .expect(404);
  await request(app.getHttpServer())
    .post(retakePath(c.applicationId))
    .auth(staffToken(), { type: "bearer" })
    .send(body)
    .expect(201);
  await request(app.getHttpServer())
    .post(retakePath(c.applicationId))
    .auth(staffToken(), { type: "bearer" })
    .send(body)
    .expect(201);
  expect(
    (
      await db.query(
        "SELECT COUNT(*) n FROM mail_outbox WHERE eventKey LIKE @0",
        [`booking:${c.bookingId}:2:%`],
      )
    )[0].n,
  ).toBe(2);
  expect(
    (
      await db
        .getRepository(RecruitmentProfile)
        .findOneByOrFail({ userId: c.userId })
    ).attemptCount,
  ).toBe(1);
  expect(
    (await db.getRepository(User).findOneByOrFail({ id: c.userId }))
      .passwordHash,
  ).toBe("not-a-login-hash");
  jest.mocked(clock.now).mockReturnValue(startsAt);
  const second = await request(app.getHttpServer())
    .post(`${route}/me/interviews`)
    .auth(c.token, { type: "bearer" })
    .send({})
    .expect(201);
  expect(second.body.session.attemptNumber).toBe(2);
  const history: Array<{ bookingVersion: number; sessionId: string }> =
    await db.query(
      "SELECT bookingVersion,sessionId FROM interview_admissions WHERE bookingId=@0 ORDER BY bookingVersion",
      [c.bookingId],
    );
  expect(history.map((row) => row.bookingVersion)).toEqual([1, 2]);
  expect(history[0].sessionId.toLowerCase()).toBe(
    first.body.session.id.toLowerCase(),
  );
});
it("requires an audited staff override to reopen a no-show and still caps the total attempts", async () => {
  const c = await candidate(),
    clock = app.get(InterviewAdmissionsService);
  jest
    .spyOn(clock, "now")
    .mockReturnValue(new Date(c.startsAt.getTime() + 900000));
  await request(app.getHttpServer())
    .post(`${route}/me/interviews`)
    .auth(c.token, { type: "bearer" })
    .send({})
    .expect(409);
  const slotId = await nextSlot(new Date(c.startsAt.getTime() + 3600000));
  await request(app.getHttpServer())
    .post(retakePath(c.applicationId))
    .auth(staffToken(), { type: "bearer" })
    .send({
      slotId,
      reason: "Ngoại lệ được giảng viên xác nhận sau khi trao đổi.",
    })
    .expect(201);
  expect(
    (
      await db.query("SELECT status FROM cv_applications WHERE id=@0", [
        c.applicationId,
      ])
    )[0].status,
  ).toBe("booked");
  expect(
    (
      await db.query(
        "SELECT COUNT(*) n FROM audit_logs WHERE targetId=@0 AND action='interview.rebooked'",
        [c.applicationId],
      )
    )[0].n,
  ).toBe(1);
  expect(
    (
      await db.query(
        "SELECT noShowAt FROM interview_admissions WHERE bookingId=@0 AND bookingVersion=1",
        [c.bookingId],
      )
    )[0].noShowAt,
  ).not.toBeNull();
  await db.query(
    "UPDATE recruitment_profiles SET attemptCount=3,status='failed' WHERE userId=@0",
    [c.userId],
  );
  const blocked = await request(app.getHttpServer())
    .post(retakePath(c.applicationId))
    .auth(staffToken(), { type: "bearer" })
    .send({
      slotId: await nextSlot(new Date(c.startsAt.getTime() + 7200000)),
      reason: "Không được đặt lại số lượt đã sử dụng.",
    })
    .expect(409);
  expect(blocked.body.code).toBe("INTERVIEW_ATTEMPT_LIMIT");
});
it("leaves only the candidate capability when switching rounds and preserves CV, account and interview history", async () => {
  const c = await candidate(),
    capability = "g".repeat(43);
  await db.query(
    "UPDATE cv_applications SET capabilityHash=@1,capabilityExpiresAt=DATEADD(day,1,SYSUTCDATETIME()) WHERE id=@0",
    [c.applicationId, digest(capability)],
  );
  const response = await request(app.getHttpServer())
    .post("/api/v1/applications/leave")
    .set("Cookie", `vintern_candidate=${capability}`)
    .send({})
    .expect(201);
  expect(String(response.headers["set-cookie"])).toContain(
    "vintern_candidate=;",
  );
  expect(
    (
      await db.query(
        "SELECT capabilityHash,status FROM cv_applications WHERE id=@0",
        [c.applicationId],
      )
    )[0],
  ).toMatchObject({ capabilityHash: null, status: "booked" });
  await request(app.getHttpServer())
    .get("/api/v1/applications/me")
    .set("Cookie", `vintern_candidate=${capability}`)
    .expect(401);
  expect(
    (await db.getRepository(User).findOneByOrFail({ id: c.userId }))
      .passwordHash,
  ).toBe("not-a-login-hash");
});
it.each(["completed", "no_show"])(
  "does not silently reopen a separately cancelled application after %s",
  async (previous) => {
    const c = await candidate(),
      clock = app.get(InterviewAdmissionsService);
    jest
      .spyOn(clock, "now")
      .mockReturnValue(
        new Date(c.startsAt.getTime() + (previous === "no_show" ? 900000 : 0)),
      );
    const started = await request(app.getHttpServer())
      .post(`${route}/me/interviews`)
      .auth(c.token, { type: "bearer" })
      .send({})
      .expect(previous === "no_show" ? 409 : 201);
    if (previous === "completed") {
      await db.query(
        "UPDATE interview_sessions SET status='completed' WHERE id=@0",
        [started.body.session.id],
      );
      await db.query(
        "UPDATE recruitment_profiles SET status='failed' WHERE userId=@0",
        [c.userId],
      );
    }
    await request(app.getHttpServer())
      .post(
        `/api/v1/recruitment-rounds/${roundId}/applications/${c.applicationId}/cancel`,
      )
      .auth(staffToken(), { type: "bearer" })
      .send({})
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(retakePath(c.applicationId))
      .auth(staffToken(), { type: "bearer" })
      .send({
        slotId: await nextSlot(new Date(c.startsAt.getTime() + 3600000)),
        reason: "Không được khôi phục ngầm hồ sơ đã hủy.",
      })
      .expect(409);
    expect(response.body.code).toBe("APPLICATION_REBOOK_NOT_ALLOWED");
    expect(
      (
        await db.query("SELECT status FROM cv_applications WHERE id=@0", [
          c.applicationId,
        ])
      )[0].status,
    ).toBe("cancelled");
  },
);
it("expires each old appointment independently when the same candidate has a newer application in another round", async () => {
  const clock = app.get(InterviewAdmissionsService),
    now = new Date(),
    old = await candidate(new Date(now.getTime() - 3600000)),
    otherRound = randomUUID();
  await db.query(
    "INSERT INTO recruitment_rounds(id,ownerId,name,status,opensAt,closesAt) VALUES(@0,@1,N'Next QA round','open',DATEADD(day,-1,SYSUTCDATETIME()),DATEADD(day,7,SYSUTCDATETIME()))",
    [otherRound, ownerId],
  );
  const next = await candidate(new Date(now.getTime() + 3600000), {
    userId: old.userId,
    roundId: otherRound,
  });
  await clock.sweep(now);
  expect(
    (
      await db.query("SELECT status FROM cv_applications WHERE id=@0", [
        old.applicationId,
      ])
    )[0].status,
  ).toBe("deferred");
  expect(
    (
      await db.query("SELECT status FROM cv_applications WHERE id=@0", [
        next.applicationId,
      ])
    )[0].status,
  ).toBe("booked");
  expect((await clock.view(old.userId))?.bookingId?.toLowerCase()).toBe(
    next.bookingId.toLowerCase(),
  );
  expect(
    (
      await db
        .getRepository(RecruitmentProfile)
        .findOneByOrFail({ userId: old.userId })
    ).attemptCount,
  ).toBe(0);
});
it("never transitions an active interview back to role selection through the staff retake command", async () => {
  const c = await candidate(),
    clock = app.get(InterviewAdmissionsService);
  jest.spyOn(clock, "now").mockReturnValue(c.startsAt);
  const first = await request(app.getHttpServer())
    .post(`${route}/me/interviews`)
    .auth(c.token, { type: "bearer" })
    .send({})
    .expect(201);
  const response = await request(app.getHttpServer())
    .post(retakePath(c.applicationId))
    .auth(staffToken(), { type: "bearer" })
    .send({
      slotId: await nextSlot(new Date(c.startsAt.getTime() + 3600000)),
      reason: "Không được làm gián đoạn phiên phỏng vấn đang chạy.",
    })
    .expect(409);
  expect(response.body.code).toBe("INTERVIEW_ALREADY_IN_PROGRESS");
  const profile = await db
    .getRepository(RecruitmentProfile)
    .findOneByOrFail({ userId: c.userId });
  expect(profile.status).toBe("interview_in_progress");
  expect(profile.attemptCount).toBe(1);
  expect(profile.currentInterviewSessionId?.toLowerCase()).toBe(
    first.body.session.id.toLowerCase(),
  );
  expect(
    (
      await db.query("SELECT version FROM interview_bookings WHERE id=@0", [
        c.bookingId,
      ])
    )[0].version,
  ).toBe(1);
});
