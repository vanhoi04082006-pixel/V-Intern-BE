import { createHash, randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { TrackGithubInvitations1763414400000 } from "../src/database/migrations/1763414400000-TrackGithubInvitations";
let db: DataSource, userId: string, sessionId: string, before: string;
const identities = async () =>
  createHash("sha256")
    .update(
      JSON.stringify(
        await db.query(
          "SELECT id,email,username,passwordHash,authVersion FROM users ORDER BY id",
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
  const index = registry.indexOf(TrackGithubInvitations1763414400000);
  if (index < 0) throw Error("Migration not registered");
  db = new DataSource({
    ...source.options,
    database,
    migrations: registry.slice(0, index),
  });
  await db.initialize();
  await db.runMigrations({ transaction: "all" });
  if (
    (await db.query("SELECT OBJECT_ID('github_invitation_events','U') id"))[0]
      .id
  )
    throw Error("Fresh migration DB required; never reset");
  userId = randomUUID();
  sessionId = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,username,displayName,passwordHash,status) VALUES(@0,@1,@0,N'Protected G5 account','unchanged-password-hash','active')",
    [userId, `${userId}@migration.test`],
  );
  await db.query(
    "INSERT INTO internship_sessions(id,code,name,status,startDate,endDate) VALUES(@0,@0,N'G5 migration','active',SYSUTCDATETIME(),DATEADD(day,1,SYSUTCDATETIME()))",
    [sessionId],
  );
  await db.query(
    "INSERT INTO session_repo_members(sessionId,userId,status) VALUES(@0,@1,'invited')",
    [sessionId, userId],
  );
  before = await identities();
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});
it("upgrades populated legacy invitations without guessing accepted or changing credentials and round-trips unused audit", async () => {
  const q = db.createQueryRunner();
  await q.connect();
  try {
    const migration = new TrackGithubInvitations1763414400000();
    await migration.up(q);
    expect(
      (
        await db.query(
          "SELECT status,invitationId FROM session_repo_members WHERE sessionId=@0",
          [sessionId],
        )
      )[0],
    ).toEqual({ status: "pending", invitationId: null });
    expect(await identities()).toBe(before);
    await migration.down(q);
    expect(await identities()).toBe(before);
    expect(
      (
        await db.query(
          "SELECT status FROM session_repo_members WHERE sessionId=@0",
          [sessionId],
        )
      )[0].status,
    ).toBe("invited");
    await migration.up(q);
    expect(await identities()).toBe(before);
  } finally {
    await q.release();
  }
});
it("refuses rollback once invitation audit exists", async () => {
  await db.query(
    "INSERT INTO github_invitation_events(id,sessionId,userId,action,status,source) VALUES(NEWID(),@0,@1,'reconciled','pending','automatic_sync')",
    [sessionId, userId],
  );
  const q = db.createQueryRunner();
  await q.connect();
  try {
    await expect(
      new TrackGithubInvitations1763414400000().down(q),
    ).rejects.toThrow("Preserve GitHub invitation audit");
    expect(await identities()).toBe(before);
  } finally {
    await q.release();
  }
});
