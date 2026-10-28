import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { TrackRepositoryGrants1763673600000 } from "../src/database/migrations/1763673600000-TrackRepositoryGrants";
let db: DataSource, userId: string, sessionId: string, eventId: string;
const migration = new TrackRepositoryGrants1763673600000();
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? "",
    registry = source.options.migrations;
  if (
    source.options.type !== "mssql" ||
    !/^VIntern_E2E_CI_\d+_\d+$/.test(database) ||
    !Array.isArray(registry)
  )
    throw Error("Fresh disposable migration DB only");
  const index = registry.indexOf(TrackRepositoryGrants1763673600000);
  if (index < 0) throw Error("Migration not registered");
  db = new DataSource({
    ...source.options,
    database,
    migrations: registry.slice(0, index),
  });
  await db.initialize();
  await db.runMigrations({ transaction: "all" });
  if (
    (await db.query("SELECT OBJECT_ID('github_repository_grants','U') id"))[0]
      .id
  )
    throw Error("Never reset an existing DB");
  userId = randomUUID();
  sessionId = randomUUID();
  eventId = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,username,displayName,passwordHash,status) VALUES(@0,@1,@0,'Migration fixture','protected-hash','active')",
    [userId, userId + "@migration.test"],
  );
  await db.query(
    "INSERT INTO internship_sessions(id,code,name,status,startDate,endDate) VALUES(@0,@0,'Grant history','active',SYSUTCDATETIME(),DATEADD(day,1,SYSUTCDATETIME()))",
    [sessionId],
  );
  await db.query(
    "INSERT INTO github_invitation_events(id,sessionId,userId,githubUserId,invitationId,action,status,source) VALUES(@0,@1,@2,2,50,'invited','pending','automatic_sync')",
    [eventId, sessionId, userId],
  );
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});
const identity = () =>
  db.query("SELECT id,passwordHash,authVersion,status FROM users WHERE id=@0", [
    userId,
  ]);
it("round-trips an unused additive schema without claiming historical/manual invitation events", async () => {
  const before = await identity(),
    q = db.createQueryRunner();
  try {
    await migration.up(q);
    expect(
      await db.query("SELECT id FROM github_repository_grants"),
    ).toHaveLength(0);
    await migration.down(q);
    expect(await identity()).toEqual(before);
    expect(
      await db.query("SELECT id FROM github_invitation_events WHERE id=@0", [
        eventId,
      ]),
    ).toHaveLength(1);
    await migration.up(q);
  } finally {
    await q.release();
  }
});
it("rejects owner grants and unsupported proof at the database boundary", async () => {
  const insert = (owner: number, proof: string) =>
    db.query(
      "INSERT INTO github_repository_grants(id,sourceSessionId,sourceUserId,repoId,githubUserId,githubOwnerId,invitationId,provenance) VALUES(@0,@1,@2,99,2,@3,50,@4)",
      [eventId, sessionId, userId, owner, proof],
    );
  await expect(insert(2, "github_201")).rejects.toBeDefined();
  await expect(insert(1, "observed")).rejects.toBeDefined();
});
it("refuses downgrade once verified provenance exists and preserves its audit and account", async () => {
  const before = await identity();
  await db.query(
    "INSERT INTO github_repository_grants(id,sourceSessionId,sourceUserId,repoId,githubUserId,githubOwnerId,invitationId,provenance) VALUES(@0,@1,@2,99,2,1,50,'github_201')",
    [eventId, sessionId, userId],
  );
  const q = db.createQueryRunner();
  try {
    await expect(migration.down(q)).rejects.toThrow(
      "Preserve GitHub grant provenance",
    );
  } finally {
    await q.release();
  }
  expect(await identity()).toEqual(before);
  expect(
    await db.query("SELECT id FROM github_repository_grants WHERE id=@0", [
      eventId,
    ]),
  ).toHaveLength(1);
});
