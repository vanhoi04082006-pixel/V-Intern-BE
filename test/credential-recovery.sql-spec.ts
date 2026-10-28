import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { DataSource } from "typeorm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import request from "supertest";
import { AppModule } from "../src/app.module";
import source from "../src/database/data-source";
import { ensureRbac } from "../src/bootstrap/ensure-rbac";
import { ApplicationCredentialRecovery } from "../src/applications/application-credential-recovery.service";
import { ApplicationsService } from "../src/applications/applications.service";
import { openMail } from "../src/communications/mail-template";

const key = Buffer.alloc(32, 17).toString("base64"),
  originalPassword = "Recovery-fixture-password!";
let app: INestApplication,
  db: DataSource,
  recovery: ApplicationCredentialRecovery;
async function fixture() {
  const teacher = randomUUID(),
    outsider = randomUUID(),
    user = randomUUID(),
    round = randomUUID(),
    application = randomUUID(),
    slot = randomUUID(),
    booking = randomUUID();
  const passwordHash = await hash(originalPassword, 10);
  for (const [id, role] of [
    [teacher, "instructor"],
    [outsider, "instructor"],
    [user, "intern"],
  ]) {
    await db.query(
      "INSERT INTO users(id,email,username,displayName,passwordHash,status,mustChangePassword,temporaryPasswordExpiresAt) VALUES(@0,@1,@0,'Recovery fixture',@2,'active',@3,CASE WHEN @3=1 THEN DATEADD(day,-1,SYSUTCDATETIME()) ELSE NULL END)",
      [id, id + "@recovery.test", passwordHash, role === "intern"],
    );
    await db.query(
      "INSERT INTO user_roles(userId,roleId) SELECT @0,id FROM roles WHERE code=@1",
      [id, role],
    );
  }
  await db.query(
    "INSERT INTO recruitment_rounds(id,ownerId,name,status,opensAt,closesAt) VALUES(@0,@1,'Recovery QA','open',DATEADD(day,-1,SYSUTCDATETIME()),DATEADD(day,7,SYSUTCDATETIME()))",
    [round, teacher],
  );
  await db.query(
    "INSERT INTO interview_slots(id,roundId,roleCode,startsAt,endsAt,timezone,capacity,minimumPreparationMinutes,credentialsLeadMinutes) VALUES(@0,@1,'frontend',DATEADD(hour,2,SYSUTCDATETIME()),DATEADD(hour,3,SYSUTCDATETIME()),'Asia/Ho_Chi_Minh',10,60,30)",
    [slot, round],
  );
  await db.query(
    "INSERT INTO cv_applications(id,roundId,email,fullName,consentVersion,consentedAt,verifiedAt,userId,status,matchedRole) VALUES(@0,@1,@2,'Recovery student','cv-consent-v1',SYSUTCDATETIME(),SYSUTCDATETIME(),@3,'booked','frontend')",
    [application, round, user + "@recovery.test", user],
  );
  await db.query(
    "INSERT INTO interview_bookings(id,applicationId,slotId) VALUES(@0,@1,@2)",
    [booking, application, slot],
  );
  await db.query(
    "INSERT INTO recruitment_profiles(id,userId,selectedRole,status,attemptCount) VALUES(NEWID(),@0,'frontend','role_selected',1)",
    [user],
  );
  await db.query(
    "INSERT INTO mail_outbox(id,eventKey,kind,recipientHint,sensitive,status,availableAt,expiresAt) VALUES(NEWID(),@0,'credentials','f***@recovery.test',1,'accepted',DATEADD(day,-3,SYSUTCDATETIME()),DATEADD(day,-2,SYSUTCDATETIME()))",
    [`booking:${booking}:1:credentials`],
  );
  return { teacher, outsider, user, round, application, slot, booking };
}
beforeAll(async () => {
  if (
    source.options.type !== "mssql" ||
    !/^VIntern_E2E_CI_\d+_\d+$/.test(process.env.E2E_DB_NAME ?? "")
  )
    throw Error("Disposable SQL only");
  process.env.MAIL_ENCRYPTION_KEY = key;
  db = new DataSource({ ...source.options, database: process.env.E2E_DB_NAME });
  await db.initialize();
  await ensureRbac(db);
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  recovery = app.get(ApplicationCredentialRecovery);
}, 120000);
afterAll(async () => {
  await app?.close();
  if (db?.isInitialized) await db.destroy();
});
const reason = "Đã xác minh lại email và đối chiếu hồ sơ phỏng vấn.";
it("rotates only expired CV credentials, revokes sessions, seals one mail and preserves attempts and booking", async () => {
  const f = await fixture(),
    preview = await recovery.preview(f.teacher, f.round, f.application, f.slot);
  expect(preview.allowed).toBe(true);
  await db.query(
    "INSERT INTO refresh_tokens(id,userId,tokenHash,familyId,expiresAt) VALUES(NEWID(),@0,@1,NEWID(),DATEADD(day,1,SYSUTCDATETIME()))",
    [f.user, "a".repeat(64)],
  );
  const input = { slotId: f.slot, expectedRevision: preview.revision!, reason };
  const results = await Promise.all([
    recovery.recover(f.teacher, f.round, f.application, input),
    recovery.recover(f.teacher, f.round, f.application, input),
  ]);
  expect(results[0].mailId).toBe(results[1].mailId);
  const [user] = await db.query("SELECT * FROM users WHERE id=@0", [f.user]),
    [mail] = await db.query("SELECT * FROM mail_outbox WHERE id=@0", [
      results[0].mailId,
    ]);
  expect(await compare(originalPassword, user.passwordHash)).toBe(false);
  expect(user.authVersion).toBe(1);
  expect(user.mustChangePassword).toBe(true);
  const envelope = openMail(mail.sealedPayload, key, mail.id) as {
    text: string;
  };
  const password = envelope.text.match(/Mật khẩu tạm: (\S+)/)?.[1];
  expect(password).toBeDefined();
  expect(await compare(password!, user.passwordHash)).toBe(true);
  expect(JSON.stringify(results)).not.toContain(password);
  expect(JSON.stringify(preview)).not.toContain(password);
  expect(
    (
      await db.query("SELECT revokedAt FROM refresh_tokens WHERE userId=@0", [
        f.user,
      ])
    )[0].revokedAt,
  ).not.toBeNull();
  expect(
    (
      await db.query(
        "SELECT attemptCount FROM recruitment_profiles WHERE userId=@0",
        [f.user],
      )
    )[0].attemptCount,
  ).toBe(1);
  expect(
    (
      await db.query("SELECT version FROM interview_bookings WHERE id=@0", [
        f.booking,
      ])
    )[0].version,
  ).toBe(1);
  expect(
    await db.query(
      "SELECT id FROM audit_logs WHERE action='application.credentials_recovered' AND targetId=@0",
      [f.application],
    ),
  ).toHaveLength(1);
  expect(mail.sensitive).toBe(true);
  expect(mail.status).toBe("pending");
  expect(mail.sealedPayload).not.toContain(password);
  await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: f.user + "@recovery.test", password: originalPassword })
    .expect(401);
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: f.user + "@recovery.test", password })
    .expect(200);
  await request(app.getHttpServer())
    .post("/api/v1/auth/change-password")
    .set("Authorization", "Bearer " + login.body.accessToken)
    .send({
      currentPassword: password,
      newPassword: "Changed-recovery-fixture-123!",
    })
    .expect(201);
  expect(
    (await recovery.preview(f.teacher, f.round, f.application, f.slot)).allowed,
  ).toBe(false);
});
it.each([
  "permanent",
  "unexpired",
  "stale_verification",
  "staff",
  "unproven",
  "in_progress",
  "email_changed",
  "closed_round",
  "exhausted_attempts",
])("refuses %s without changing credentials", async (kind) => {
  const f = await fixture();
  if (kind === "permanent")
    await db.query(
      "UPDATE users SET mustChangePassword=0,temporaryPasswordExpiresAt=NULL WHERE id=@0",
      [f.user],
    );
  if (kind === "unexpired")
    await db.query(
      "UPDATE users SET temporaryPasswordExpiresAt=DATEADD(day,1,SYSUTCDATETIME()) WHERE id=@0",
      [f.user],
    );
  if (kind === "stale_verification")
    await db.query(
      "UPDATE cv_applications SET verifiedAt=DATEADD(day,-2,SYSUTCDATETIME()) WHERE id=@0",
      [f.application],
    );
  if (kind === "staff")
    await db.query(
      "INSERT INTO user_roles(userId,roleId) SELECT @0,id FROM roles WHERE code='instructor'",
      [f.user],
    );
  if (kind === "unproven")
    await db.query("UPDATE mail_outbox SET sensitive=0 WHERE eventKey=@0", [
      `booking:${f.booking}:1:credentials`,
    ]);
  if (kind === "in_progress")
    await db.query(
      "UPDATE recruitment_profiles SET status='interview_in_progress' WHERE userId=@0",
      [f.user],
    );
  if (kind === "email_changed")
    await db.query("UPDATE users SET email=@1 WHERE id=@0", [
      f.user,
      randomUUID() + "@changed.test",
    ]);
  if (kind === "closed_round")
    await db.query(
      "UPDATE recruitment_rounds SET status='closed' WHERE id=@0",
      [f.round],
    );
  if (kind === "exhausted_attempts")
    await db.query(
      "UPDATE recruitment_profiles SET attemptCount=3,status='failed' WHERE userId=@0",
      [f.user],
    );
  const preview = await recovery.preview(
    f.teacher,
    f.round,
    f.application,
    f.slot,
  );
  expect(preview.allowed).toBe(false);
  await expect(
    recovery.recover(f.teacher, f.round, f.application, {
      slotId: f.slot,
      expectedRevision: preview.revision ?? "0".repeat(64),
      reason,
    }),
  ).rejects.toBeDefined();
  expect(
    (await db.query("SELECT authVersion FROM users WHERE id=@0", [f.user]))[0]
      .authVersion,
  ).toBe(0);
});
it("rejects stale preview and foreign round access", async () => {
  const f = await fixture(),
    p = await recovery.preview(f.teacher, f.round, f.application, f.slot);
  await expect(
    recovery.preview(f.outsider, f.round, f.application, f.slot),
  ).rejects.toBeDefined();
  await db.query("UPDATE users SET authVersion=authVersion+1 WHERE id=@0", [
    f.user,
  ]);
  await expect(
    recovery.recover(f.teacher, f.round, f.application, {
      slotId: f.slot,
      expectedRevision: p.revision!,
      reason,
    }),
  ).rejects.toMatchObject({
    response: { code: "CREDENTIAL_RECOVERY_CHANGED" },
  });
});
it("rolls back password rotation when encrypted mail cannot be saved", async () => {
  const f = await fixture(),
    p = await recovery.preview(f.teacher, f.round, f.application, f.slot);
  await db.query(
    "CREATE TRIGGER dbo.recovery_mail_failure ON mail_outbox AFTER INSERT AS BEGIN THROW 50001,'Synthetic mail failure',1; END",
  );
  try {
    await expect(
      recovery.recover(f.teacher, f.round, f.application, {
        slotId: f.slot,
        expectedRevision: p.revision!,
        reason,
      }),
    ).rejects.toBeDefined();
  } finally {
    await db.query("DROP TRIGGER dbo.recovery_mail_failure");
  }
  expect(
    (await db.query("SELECT authVersion FROM users WHERE id=@0", [f.user]))[0]
      .authVersion,
  ).toBe(0);
});
it("requires authentication and validates recovery request fields", async () => {
  const f = await fixture(),
    url = `/api/v1/recruitment-rounds/${f.round}/applications/${f.application}/recover-credentials`;
  await request(app.getHttpServer())
    .post(url)
    .send({ slotId: f.slot, expectedRevision: "0".repeat(64), reason })
    .expect(401);
  const login = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email: f.teacher + "@recovery.test", password: originalPassword })
    .expect(200);
  await request(app.getHttpServer())
    .post(url)
    .set("Authorization", "Bearer " + login.body.accessToken)
    .send({ slotId: f.slot, expectedRevision: "x", reason: "short" })
    .expect(400);
});
it("requires fresh email proof and accepts explicit reverification without changing the original verification or attempts", async () => {
  const f = await fixture(),
    token = randomBytes(32).toString("base64url");
  await db.query(
    "UPDATE cv_applications SET verifiedAt=DATEADD(day,-2,SYSUTCDATETIME()),verificationHash=@1,verificationExpiresAt=DATEADD(hour,1,SYSUTCDATETIME()) WHERE id=@0",
    [f.application, createHash("sha256").update(token).digest("hex")],
  );
  expect(
    (await recovery.preview(f.teacher, f.round, f.application, f.slot)).allowed,
  ).toBe(false);
  await app.get(ApplicationsService).verify(token);
  expect(
    (await recovery.preview(f.teacher, f.round, f.application, f.slot)).allowed,
  ).toBe(true);
  expect(
    await db.query(
      "SELECT id FROM application_events WHERE applicationId=@0 AND kind='email_reverified'",
      [f.application],
    ),
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        "SELECT attemptCount FROM recruitment_profiles WHERE userId=@0",
        [f.user],
      )
    )[0].attemptCount,
  ).toBe(1);
});
it("does not rotate while any previous recovery credential is in SMTP delivery", async () => {
  const f = await fixture(),
    p = await recovery.preview(f.teacher, f.round, f.application, f.slot);
  await db.query(
    "INSERT INTO mail_outbox(id,eventKey,kind,recipientHint,sensitive,status,availableAt,expiresAt) VALUES(NEWID(),@0,'credentials','f***@recovery.test',1,'sending',SYSUTCDATETIME(),DATEADD(hour,1,SYSUTCDATETIME()))",
    [`credential-recovery:${f.application}:${"b".repeat(64)}`],
  );
  await expect(
    recovery.recover(f.teacher, f.round, f.application, {
      slotId: f.slot,
      expectedRevision: p.revision!,
      reason,
    }),
  ).rejects.toMatchObject({
    response: { code: "CREDENTIAL_DELIVERY_IN_PROGRESS" },
  });
  expect(
    (await db.query("SELECT authVersion FROM users WHERE id=@0", [f.user]))[0]
      .authVersion,
  ).toBe(0);
});
