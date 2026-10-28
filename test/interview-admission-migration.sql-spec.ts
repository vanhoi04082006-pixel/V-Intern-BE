import { createHash, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { CreateInterviewAdmissions1763328000000 } from "../src/database/migrations/1763328000000-CreateInterviewAdmissions";

let db: DataSource, actor: string, before: string;
const identities = async () =>
  createHash("sha256")
    .update(
      JSON.stringify(
        await db.query(
          "SELECT id,email,username,passwordHash,status,authVersion FROM users ORDER BY id",
        ),
      ),
    )
    .digest("hex");
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? "",
    registry = source.options.migrations;
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(database) ||
    source.options.type !== "mssql" ||
    !Array.isArray(registry)
  )
    throw Error("Fresh disposable SQL required");
  const index = registry.indexOf(CreateInterviewAdmissions1763328000000);
  if (index < 0) throw Error("Migration not registered");
  db = new DataSource({
    ...source.options,
    database,
    migrations: registry.slice(0, index),
  });
  await db.initialize();
  await db.runMigrations({ transaction: "all" });
  if ((await db.query("SELECT OBJECT_ID('interview_admissions','U') id"))[0].id)
    throw Error("Fresh migration database required; never reset");
  actor = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,username,displayName,passwordHash,status) VALUES(@0,@1,@0,N'Protected admission fixture','unchanged-fixture-hash','active')",
    [actor, `${actor}@migration.test`],
  );
  before = await identities();
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});
it("round-trips an unused admission ledger without changing accounts or previous schema", async () => {
  const q = db.createQueryRunner();
  await q.connect();
  const migration = new CreateInterviewAdmissions1763328000000();
  try {
    await migration.up(q);
    expect(await identities()).toBe(before);
    await migration.down(q);
    expect(await identities()).toBe(before);
    await migration.up(q);
    expect(await identities()).toBe(before);
  } finally {
    await q.release();
  }
});
it("preserves an actual no-show snapshot and refuses a destructive rollback", async () => {
  const round = randomUUID(),
    slot = randomUUID(),
    application = randomUUID(),
    booking = randomUUID();
  await db.query(
    "INSERT INTO recruitment_rounds(id,ownerId,name,opensAt,closesAt) VALUES(@0,@1,N'Admission migration',SYSUTCDATETIME(),DATEADD(day,1,SYSUTCDATETIME()))",
    [round, actor],
  );
  await db.query(
    "INSERT INTO interview_slots(id,roundId,roleCode,startsAt,endsAt,timezone,capacity,minimumPreparationMinutes,credentialsLeadMinutes) VALUES(@0,@1,'frontend',SYSUTCDATETIME(),DATEADD(minute,30,SYSUTCDATETIME()),'UTC',1,60,30)",
    [slot, round],
  );
  await db.query(
    "INSERT INTO cv_applications(id,roundId,email,fullName,consentVersion,consentedAt,userId) VALUES(@0,@1,@2,N'Admission fixture','cv-consent-v1',SYSUTCDATETIME(),@3)",
    [application, round, `${actor}@migration.test`, actor],
  );
  await db.query(
    "INSERT INTO interview_bookings(id,applicationId,slotId) VALUES(@0,@1,@2)",
    [booking, application, slot],
  );
  await db.query(
    "INSERT INTO interview_admissions(bookingId,bookingVersion,applicationId,userId,slotId,roleCode,startsAt,endsAt,noShowAt) VALUES(@0,1,@1,@2,@3,'frontend',SYSUTCDATETIME(),DATEADD(minute,30,SYSUTCDATETIME()),SYSUTCDATETIME())",
    [booking, application, actor, slot],
  );
  const q = db.createQueryRunner();
  await q.connect();
  try {
    await expect(
      new CreateInterviewAdmissions1763328000000().down(q),
    ).rejects.toThrow(/Preserve/);
  } finally {
    await q.release();
  }
  expect(
    (await db.query("SELECT COUNT(*) n FROM interview_admissions"))[0].n,
  ).toBe(1);
  expect(await identities()).toBe(before);
});
