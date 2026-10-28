import { accessFixture } from "./support/repository-access-fixture";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { RepositoryAccessQueue } from "../src/github/repository-access.queue";
let db: DataSource, queue: RepositoryAccessQueue;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? "";
  if (
    source.options.type !== "mssql" ||
    !/^VIntern_E2E_CI_\d+_\d+$/.test(database)
  )
    throw Error("Disposable SQL only");
  db = new DataSource({ ...source.options, database });
  await db.initialize();
  queue = new RepositoryAccessQueue(db);
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});

it("leases one job under concurrent claims without duplicate processing", async () => {
  const f = await accessFixture(db),
    claims = await Promise.all([
      queue.claim(f.sessionId),
      queue.claim(f.sessionId),
    ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(claims.find(Boolean)!.attempts).toBe(1);
});
it("claims when a pooled SQL connection retains SERIALIZABLE isolation", async () => {
  const f = await accessFixture(db),
    runner = db.createQueryRunner();
  await runner.connect();
  await runner.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  const read = jest
    .spyOn(db, "query")
    .mockImplementationOnce((sql, params) =>
      runner.query(
        "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;\n" + sql,
        params,
      ),
    );
  try {
    expect((await queue.claim(f.sessionId))?.id.toLowerCase()).toBe(f.jobId);
  } finally {
    read.mockRestore();
    await runner.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await runner.release();
  }
});
it("rejects a lost lease and completes an owned job idempotently with one audit", async () => {
  const f = await accessFixture(db),
    job = (await queue.claim(f.sessionId))!;
  expect(
    await queue.finish({ ...job, leaseToken: randomUUID() }, "done", null, {
      kind: "absent",
    }),
  ).toBe(false);
  expect(await queue.finish(job, "done", null, { kind: "absent" })).toBe(true);
  expect(await queue.finish(job, "done", null, { kind: "absent" })).toBe(false);
  expect(
    await db.query(
      "SELECT id FROM audit_logs WHERE targetId=@0 AND action='github.repository_access.done'",
      [f.jobId],
    ),
  ).toHaveLength(1);
});
it("recovers an expired job and respects an in-flight invitation member lease", async () => {
  const f = await accessFixture(db),
    first = (await queue.claim(f.sessionId))!;
  await db.query(
    "UPDATE repository_access_jobs SET leaseUntil=DATEADD(second,-1,SYSUTCDATETIME()) WHERE id=@0",
    [f.jobId],
  );
  const next = (await queue.claim(f.sessionId))!;
  expect(next.leaseToken).not.toBe(first.leaseToken);
  await db.query(
    "INSERT INTO session_repo_members(sessionId,userId,status,leaseToken,leaseUntil) VALUES(@0,@1,'pending',@2,DATEADD(minute,2,SYSUTCDATETIME()))",
    [f.sessionId, f.target, first.leaseToken],
  );
  expect(await queue.memberLease(next)).toBe(false);
  await db.query(
    "UPDATE session_repo_members SET leaseUntil=DATEADD(second,-1,SYSUTCDATETIME()) WHERE sessionId=@0",
    [f.sessionId],
  );
  expect(await queue.memberLease(next)).toBe(true);
  await queue.releaseMember(first);
  expect(await queue.stillOwned(next)).toBe(true);
  expect(await queue.stillOwned(first)).toBe(false);
});
it("waits for user action without consuming retries and deduplicates staff attention", async () => {
  const f = await accessFixture(db);
  for (let i = 0; i < 2; i++) {
    const job = (await queue.claim(f.sessionId))!;
    await queue.finish(
      job,
      "waiting_user",
      "GITHUB_RECONNECT_REQUIRED",
      { kind: "connection_required" },
      0,
      true,
    );
  }
  expect(
    (
      await db.query(
        "SELECT attempts FROM repository_access_jobs WHERE id=@0",
        [f.jobId],
      )
    )[0].attempts,
  ).toBe(0);
  expect(
    await db.query(
      "SELECT id FROM notifications WHERE userId=@0 AND type='github.repository_access_attention'",
      [f.teacher],
    ),
  ).toHaveLength(1);
});
it("rolls completion back on an audit failure, retaining the lease for a safe retry", async () => {
  const f = await accessFixture(db),
    job = (await queue.claim(f.sessionId))!;
  await db.query(
    "CREATE TRIGGER dbo.access_audit_failure ON audit_logs AFTER INSERT AS BEGIN THROW 50001,'Synthetic audit failure',1; END",
  );
  try {
    await expect(
      queue.finish(job, "done", null, { kind: "absent" }),
    ).rejects.toBeDefined();
  } finally {
    await db.query("DROP TRIGGER dbo.access_audit_failure");
  }
  expect(
    (
      await db.query("SELECT status FROM repository_access_jobs WHERE id=@0", [
        f.jobId,
      ])
    )[0].status,
  ).toBe("leased");
  expect(await queue.finish(job, "done", null, { kind: "absent" })).toBe(true);
});
