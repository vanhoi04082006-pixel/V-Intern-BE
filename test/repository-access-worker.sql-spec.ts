import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { RepositoryAccessQueue } from "../src/github/repository-access.queue";
import { RepositoryAccessWorker } from "../src/github/repository-access.worker";
import { GithubClient, GithubApiError } from "../src/github/github-client";
import { GithubInvitationsService } from "../src/github/github-invitations.service";
import { GithubRepositoryAccountService } from "../src/github/github-repository-account.service";
import { CommunicationsService } from "../src/communications/communications.service";
import { accessFixture } from "./support/repository-access-fixture";
let db: DataSource;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? "";
  if (
    source.options.type !== "mssql" ||
    !/^VIntern_E2E_CI_\d+_\d+$/.test(database)
  )
    throw Error("Disposable SQL only");
  db = new DataSource({ ...source.options, database });
  await db.initialize();
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});
async function fixture(proof = true) {
  const f = await accessFixture(db),
    repoId = Math.floor(Math.random() * 1e9) + 9e9,
    githubId = Math.floor(Math.random() * 1e9) + 4e9,
    queue = new RepositoryAccessQueue(db);
  await db.query(
    "INSERT INTO session_repositories(sessionId,ownerUserId,githubOwnerId,ownerLogin,repoName,repoId,status,leaseId) VALUES(@0,@1,1,'platform','qa',@2,'ready',NEWID())",
    [f.sessionId, f.teacher, repoId],
  );
  await db.query(
    "INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes) VALUES(@0,@1,'student','fixture-not-token','read:user')",
    [f.target, githubId],
  );
  await db.query(
    "INSERT INTO session_repo_members(sessionId,userId,status,githubUserId,invitationId) VALUES(@0,@1,'pending',@2,50)",
    [f.sessionId, f.target, githubId],
  );
  if (proof) {
    const event = randomUUID();
    await db.query(
      "INSERT INTO github_invitation_events(id,sessionId,userId,githubUserId,invitationId,action,status,source) VALUES(@0,@1,@2,@3,50,'invited','pending','automatic_sync')",
      [event, f.sessionId, f.target, githubId],
    );
    await db.query(
      "INSERT INTO github_repository_grants(id,sourceSessionId,sourceUserId,repoId,githubUserId,githubOwnerId,invitationId,provenance) VALUES(@0,@1,@2,@3,@4,1,50,'github_201')",
      [event, f.sessionId, f.target, repoId, githubId],
    );
  }
  const remote = {
    accepted: false,
    error: 0,
    deletes: 0,
    puts: 0,
    pendingId: 50,
    loseLease: false,
    loseDeleteResponse: false,
  };
  const client = {
    call: jest.fn(async (p: string, _token: string, method = "GET") => {
      if (remote.error) throw new GithubApiError(remote.error);
      if (p.startsWith("/repositories/"))
        return {
          id: repoId,
          name: "qa",
          owner: { id: 1, login: "platform" },
          private: false,
        };
      if (p === `/user/${githubId}`) return { id: githubId, login: "student" };
      if (method === "DELETE") {
        remote.deletes++;
        remote.pendingId = 0;
        if (remote.loseDeleteResponse)
          throw new TypeError("Synthetic uncertain response");
        return undefined;
      }
      if (method === "PUT") {
        remote.puts++;
        remote.pendingId = 81;
        return {
          id: 81,
          invitee: { id: githubId },
          repository: { id: repoId },
          created_at: new Date().toISOString(),
          expired: false,
        };
      }
      if (p.includes("/invitations?")) {
        if (remote.loseLease)
          await db.query(
            "UPDATE repository_access_jobs SET leaseToken=NEWID() WHERE id=@0",
            [f.jobId],
          );
        return remote.pendingId
          ? [
              {
                id: remote.pendingId,
                invitee: { id: githubId },
                repository: { id: repoId },
                created_at: new Date().toISOString(),
                expired: false,
              },
            ]
          : [];
      }
      if (remote.accepted) return undefined;
      throw new GithubApiError(404);
    }),
  } as unknown as GithubClient;
  const invitations = new GithubInvitationsService(db, client, {
      ready: () => false,
    } as unknown as CommunicationsService),
    account = {
      credentials: jest.fn(async () => ({
        userId: f.teacher,
        token: "fixture",
        connection: { githubUserId: "1" },
      })),
    };
  const worker = new RepositoryAccessWorker(
    db,
    queue,
    client,
    invitations,
    account as unknown as GithubRepositoryAccountService,
    new ConfigService({ NODE_ENV: "test" }),
  );
  return {
    ...f,
    queue,
    remote,
    worker,
    client,
    account,
    repoId,
    githubId,
    state: async () =>
      (
        await db.query(
          "SELECT status,errorCode,attempts,effectJson FROM repository_access_jobs WHERE id=@0",
          [f.jobId],
        )
      )[0],
  };
}
it("cancels only a verified pending invitation and records the completed outcome", async () => {
  const f = await fixture();
  await f.worker.tick(f.sessionId);
  expect(f.remote.deletes).toBe(1);
  expect((await f.state()).status).toBe("done");
  expect(
    (
      await db.query(
        "SELECT state FROM github_repository_grants WHERE repoId=@0",
        [f.repoId],
      )
    )[0].state,
  ).toBe("revoked");
  await f.worker.tick(f.sessionId);
  expect(f.remote.deletes).toBe(1);
});
it("preserves shared numeric identity needed by the replacement even across different app users", async () => {
  const f = await fixture();
  await db.query(
    "DELETE FROM github_connections WHERE userId=@0; INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes) VALUES(@1,@2,'student','fixture','read:user')",
    [f.target, f.candidate, f.githubId],
  );
  await f.worker.tick(f.sessionId);
  expect(f.remote.deletes).toBe(0);
  expect((await f.state()).status).toBe("done");
});
it.each(["unknown", "accepted", "different_invitation"])(
  "preserves %s permission and requests staff review",
  async (kind) => {
    const f = await fixture(kind !== "unknown");
    if (kind === "accepted") f.remote.accepted = true;
    if (kind === "different_invitation") f.remote.pendingId = 99;
    await f.worker.tick(f.sessionId);
    expect(f.remote.deletes).toBe(0);
    expect(await f.state()).toMatchObject({
      status: "failed",
      errorCode: "GITHUB_ACCESS_REVIEW_REQUIRED",
    });
    expect(
      await db.query(
        "SELECT id FROM notifications WHERE userId=@0 AND type='github.repository_access_attention'",
        [f.teacher],
      ),
    ).toHaveLength(1);
  },
);
it("waits for a prior invitation lease and prevents a stale worker from mutating remote access", async () => {
  const f = await fixture();
  await db.query(
    "UPDATE session_repo_members SET leaseToken=NEWID(),leaseUntil=DATEADD(minute,2,SYSUTCDATETIME()) WHERE sessionId=@0",
    [f.sessionId],
  );
  await f.worker.tick(f.sessionId);
  expect(f.remote.deletes).toBe(0);
  expect(await f.state()).toMatchObject({ status: "retry", attempts: 0 });
  await db.query(
    "UPDATE session_repo_members SET leaseUntil=DATEADD(second,-1,SYSUTCDATETIME()) WHERE sessionId=@0",
    [f.sessionId],
  );
  await db.query(
    "UPDATE repository_access_jobs SET nextAttemptAt=SYSUTCDATETIME() WHERE id=@0",
    [f.jobId],
  );
  f.remote.loseLease = true;
  await f.worker.tick(f.sessionId);
  expect(f.remote.deletes).toBe(0);
});
it("waits for a disconnected newcomer without consuming network retries", async () => {
  const f = await fixture();
  await db.query("UPDATE repository_access_jobs SET userId=@1 WHERE id=@0", [
    f.jobId,
    f.candidate,
  ]);
  await f.worker.tick(f.sessionId);
  expect(f.remote.puts).toBe(0);
  expect(await f.state()).toMatchObject({
    status: "waiting_user",
    attempts: 0,
  });
});
it("invites a connected newcomer through the canonical service and records 201 provenance", async () => {
  const f = await fixture(false);
  await db.query("UPDATE repository_access_jobs SET userId=@1 WHERE id=@0", [
    f.jobId,
    f.candidate,
  ]);
  await db.query(
    "DELETE FROM github_connections WHERE userId=@0; INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes) VALUES(@1,@2,'student','fixture','read:user')",
    [f.target, f.candidate, f.githubId],
  );
  f.remote.pendingId = 0;
  await f.worker.tick(f.sessionId);
  expect(f.remote.puts).toBe(1);
  expect((await f.state()).status).toBe("done");
  expect(
    await db.query("SELECT id FROM github_repository_grants WHERE repoId=@0", [
      f.repoId,
    ]),
  ).toHaveLength(1);
});
it.each([403, 429])(
  "backs off %s and stops at the bounded retry limit",
  async (error) => {
    const f = await fixture();
    f.remote.error = error;
    await f.worker.tick(f.sessionId);
    expect(await f.state()).toMatchObject({ status: "retry", attempts: 1 });
    await db.query(
      "UPDATE repository_access_jobs SET attempts=5,nextAttemptAt=SYSUTCDATETIME() WHERE id=@0",
      [f.jobId],
    );
    await f.worker.tick(f.sessionId);
    expect(await f.state()).toMatchObject({ status: "failed", attempts: 6 });
  },
);
it("recovers an uncertain DELETE response without deleting a newly observed grant or repeating the old mutation", async () => {
  const f = await fixture();
  f.remote.loseDeleteResponse = true;
  await f.worker.tick(f.sessionId);
  expect(await f.state()).toMatchObject({ status: "retry" });
  expect(f.remote.deletes).toBe(1);
  f.remote.loseDeleteResponse = false;
  await db.query(
    "UPDATE repository_access_jobs SET nextAttemptAt=SYSUTCDATETIME() WHERE id=@0",
    [f.jobId],
  );
  await f.worker.tick(f.sessionId);
  expect((await f.state()).status).toBe("done");
  expect(f.remote.deletes).toBe(1);
});
it("requires confirmation when a newcomer connection differs from its recorded numeric identity", async () => {
  const f = await fixture();
  await db.query("UPDATE repository_access_jobs SET userId=@1 WHERE id=@0", [
    f.jobId,
    f.candidate,
  ]);
  await db.query(
    "INSERT INTO session_repo_members(sessionId,userId,status,githubUserId) VALUES(@0,@1,'pending',@2)",
    [f.sessionId, f.candidate, f.githubId + 1],
  );
  await db.query(
    "DELETE FROM github_connections WHERE userId=@0; INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes) VALUES(@1,@2,'student','fixture','read:user')",
    [f.target, f.candidate, f.githubId],
  );
  await f.worker.tick(f.sessionId);
  expect(await f.state()).toMatchObject({
    status: "waiting_user",
    errorCode: "GITHUB_IDENTITY_CHANGED",
  });
  expect(f.remote.puts).toBe(0);
  expect(f.remote.deletes).toBe(0);
  expect(
    String(
      (
        await db.query(
          "SELECT githubUserId FROM session_repo_members WHERE sessionId=@0 AND userId=@1",
          [f.sessionId, f.candidate],
        )
      )[0].githubUserId,
    ),
  ).toBe(String(f.githubId + 1));
});
