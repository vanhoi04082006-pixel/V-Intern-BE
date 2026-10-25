import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { CreateReplacementWorkflow1763587200000 } from "../src/database/migrations/1763587200000-CreateReplacementWorkflow";
let db: DataSource,
  sessionId: string,
  targetId: string,
  candidateId: string,
  projectId: string,
  assignmentId: string,
  incidentId: string,
  eventId: string;
const snapshot = () =>
  db.query("SELECT id,passwordHash,authVersion FROM users ORDER BY id");
let identities: unknown;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? "",
    registry = source.options.migrations;
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(database) ||
    !Array.isArray(registry) ||
    source.options.type !== "mssql"
  )
    throw Error("Disposable migration database required");
  const index = registry.indexOf(CreateReplacementWorkflow1763587200000);
  if (index < 0) throw Error("Replacement migration is not registered");
  db = new DataSource({
    ...source.options,
    database,
    migrations: registry.slice(0, index),
  });
  await db.initialize();
  await db.runMigrations({ transaction: "all" });
  if (
    (
      await db.query(
        "SELECT OBJECT_ID('participation_replacement_commands','U') id",
      )
    )[0].id
  )
    throw Error("Fresh database required; never reset");
  targetId = randomUUID();
  candidateId = randomUUID();
  for (const id of [targetId, candidateId])
    await db.query(
      "INSERT INTO users(id,email,username,displayName,passwordHash,status) VALUES(@0,@1,@0,'Protected migration identity','preserved-hash','active')",
      [id, id + "@migration.test"],
    );
  sessionId = randomUUID();
  await db.query(
    "INSERT INTO internship_sessions(id,code,name,status,startDate,endDate) VALUES(@0,@0,'Protected migration session','active',SYSUTCDATETIME(),DATEADD(day,1,SYSUTCDATETIME()))",
    [sessionId],
  );
  projectId = randomUUID();
  await db.query(
    "INSERT INTO projects(id,code,name,description,status) VALUES(@0,@0,'Protected project','Migration fixture','active')",
    [projectId],
  );
  assignmentId = randomUUID();
  await db.query(
    "INSERT INTO assignments(id,internId,projectId,sessionId,status,assignedAt) VALUES(@0,@1,@2,@3,'active',SYSUTCDATETIME())",
    [assignmentId, targetId, projectId, sessionId],
  );
  const taskId = randomUUID();
  await db.query(
    "INSERT INTO tasks(id,code,title,projectId,assigneeId,status) VALUES(@0,@0,'Protected task',@1,@2,'doing')",
    [taskId, projectId, targetId],
  );
  incidentId = randomUUID();
  await db.query(
    "INSERT INTO participation_incidents(id,taskId,internId,sessionId,deadlineVersion,policyVersion,dueAt,kind,status,ordinal,points,recommendReplacement,policySnapshot) VALUES(@0,@1,@2,@3,1,1,SYSUTCDATETIME(),'missing','active',3,0,1,'{}')",
    [incidentId, taskId, targetId, sessionId],
  );
  eventId = randomUUID();
  await db.query(
    "INSERT INTO participation_events(id,sessionId,internId,taskId,incidentId,action,detail) VALUES(@0,@1,@2,@3,@4,'replacement.advised','{}')",
    [eventId, sessionId, targetId, taskId, incidentId],
  );
  identities = await snapshot();
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});
async function run(method: "up" | "down") {
  const q = db.createQueryRunner();
  await q.connect();
  try {
    await new CreateReplacementWorkflow1763587200000()[method](q);
  } finally {
    await q.release();
  }
}
it("round-trips an unused additive schema while retaining accounts, active assignments and incident history", async () => {
  await run("up");
  await run("down");
  await run("up");
  expect(await snapshot()).toEqual(identities);
  expect(
    (
      await db.query("SELECT status FROM assignments WHERE id=@0", [
        assignmentId,
      ])
    )[0].status,
  ).toBe("active");
  expect(
    await db.query("SELECT id FROM participation_incidents WHERE id=@0", [
      incidentId,
    ]),
  ).toHaveLength(1);
});
it("preserves a prepared preview instead of discarding its evidence during downgrade", async () => {
  await db.query(
    "INSERT INTO participation_replacement_commands(id,sessionId,adviceId,incidentId,oldAssignmentId,targetInternId,candidateId,projectId,roleCode,previewJson,previewHash,createdById) VALUES(NEWID(),@0,@1,@2,@3,@4,@5,@6,'frontend','{}',@7,@4)",
    [
      sessionId,
      eventId,
      incidentId,
      assignmentId,
      targetId,
      candidateId,
      projectId,
      "0".repeat(64),
    ],
  );
  await expect(run("down")).rejects.toThrow("Preserve replacement approvals");
  expect(
    (
      await db.query(
        "SELECT COUNT(*) n FROM participation_replacement_commands",
      )
    )[0].n,
  ).toBe(1);
  expect(await snapshot()).toEqual(identities);
});
it("rejects an approval lacking provenance, invalid JSON and a self-replacement at the schema boundary", async () => {
  await expect(
    db.query("UPDATE participation_replacement_commands SET status='approved'"),
  ).rejects.toThrow();
  await expect(
    db.query(
      "UPDATE participation_replacement_commands SET previewJson='not-json'",
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      "UPDATE participation_replacement_commands SET candidateId=targetInternId",
    ),
  ).rejects.toThrow();
  expect(
    (await db.query("SELECT status FROM participation_replacement_commands"))[0]
      .status,
  ).toBe("pending");
});
