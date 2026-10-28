import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { CreateParticipation1763500800000 } from "../src/database/migrations/1763500800000-CreateParticipation";
import { User } from "../src/users/entities/user.entity";
import { Project } from "../src/projects/entities/project.entity";
import { Sprint } from "../src/sprints/entities/sprint.entity";
import { Task } from "../src/tasks/entities/task.entity";
let db: DataSource, userId: string, sessionId: string, submissionId: string;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? "",
    registry = source.options.migrations;
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(database) ||
    !Array.isArray(registry) ||
    source.options.type !== "mssql"
  )
    throw Error("Fresh disposable migration database required");
  const index = registry.indexOf(CreateParticipation1763500800000);
  if (index < 0) throw Error("Participation migration must be registered");
  db = new DataSource({
    ...source.options,
    database,
    migrations: registry.slice(0, index),
  });
  await db.initialize();
  await db.runMigrations({ transaction: "all" });
  if ((await db.query("SELECT OBJECT_ID('participation_events','U') id"))[0].id)
    throw Error("Fresh database required; never reset");
  const user = await db
    .getRepository(User)
    .save({
      email: `${randomUUID()}@migration.test`,
      username: randomUUID(),
      displayName: "Protected history",
      passwordHash: "unchanged",
      status: "active",
    });
  userId = user.id;
  sessionId = randomUUID();
  await db.query(
    "INSERT INTO internship_sessions(id,code,name,status,startDate,endDate) VALUES(@0,@0,'Migration','active',SYSUTCDATETIME(),DATEADD(day,1,SYSUTCDATETIME()))",
    [sessionId],
  );
  const project = await db
    .getRepository(Project)
    .save({
      code: randomUUID(),
      name: "Protected",
      description: "Protected migration fixture",
      status: "active",
    });
  const sprint = await db
    .getRepository(Sprint)
    .save({
      code: randomUUID(),
      name: "Protected",
      projectId: project.id,
      sessionId,
      status: "active",
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000),
    });
  const task = await db
    .getRepository(Task)
    .save({
      code: randomUUID(),
      title: "Protected",
      projectId: project.id,
      sprintId: sprint.id,
      assigneeId: userId,
      status: "done",
    });
  submissionId = randomUUID();
  await db.query(
    "INSERT INTO task_submissions(id,taskId,internId,prUrl,summary,status,score,reviewerId,reviewedAt) VALUES(@0,@1,@2,'https://github.com/qa/repo/pull/1','Existing grade','approved',85,@2,SYSUTCDATETIME())",
    [submissionId, task.id, userId],
  );
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});
async function run(method: "up" | "down") {
  const q = db.createQueryRunner();
  await q.connect();
  try {
    await new CreateParticipation1763500800000()[method](q);
  } finally {
    await q.release();
  }
}
it("adds nullable score evidence without altering old identity or approved grades, and round-trips an unused schema", async () => {
  await run("up");
  expect(
    (
      await db.query(
        "SELECT score,baseScore,latePenalty FROM task_submissions WHERE id=@0",
        [submissionId],
      )
    )[0],
  ).toEqual({ score: 85, baseScore: null, latePenalty: null });
  await run("down");
  await run("up");
  expect(
    (await db.query("SELECT passwordHash FROM users WHERE id=@0", [userId]))[0]
      .passwordHash,
  ).toBe("unchanged");
  expect(
    (
      await db.query("SELECT score FROM task_submissions WHERE id=@0", [
        submissionId,
      ])
    )[0].score,
  ).toBe(85);
});
it("refuses a downgrade that would discard reviewed score provenance even with no incident", async () => {
  await db.query(
    "UPDATE task_submissions SET baseScore=85,latePenalty=0 WHERE id=@0",
    [submissionId],
  );
  await expect(run("down")).rejects.toThrow("Preserve participation history");
  expect(
    (
      await db.query("SELECT baseScore FROM task_submissions WHERE id=@0", [
        submissionId,
      ])
    )[0].baseScore,
  ).toBe(85);
  await db.query(
    "UPDATE task_submissions SET baseScore=NULL,latePenalty=NULL WHERE id=@0",
    [submissionId],
  );
});
it("refuses a downgrade that would discard a configured policy before any incident exists", async () => {
  await db.query("INSERT INTO participation_policies(sessionId) VALUES(@0)", [
    sessionId,
  ]);
  await expect(run("down")).rejects.toThrow("Preserve participation history");
  expect(
    await db.query(
      "SELECT sessionId FROM participation_policies WHERE sessionId=@0",
      [sessionId],
    ),
  ).toHaveLength(1);
});
