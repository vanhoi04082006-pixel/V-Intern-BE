import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { User } from "../src/users/entities/user.entity";
import { recordSystemInvitation } from "../src/github/github-grant-ledger";
import type { InvitationResult } from "../src/github/github-invitation-policy";
let db: DataSource;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? "";
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(database) ||
    source.options.type !== "mssql"
  )
    throw Error("Disposable SQL only");
  db = new DataSource({ ...source.options, database });
  await db.initialize();
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});
async function fixture() {
  const user = await db
      .getRepository(User)
      .save({
        email: randomUUID() + "@grant.test",
        username: randomUUID(),
        displayName: 'Grant fixture',
        passwordHash: "not-a-login",
        status: "active",
      }),
    sessionId = randomUUID(),
    eventId = randomUUID(),
    repo = {
      ownerLogin: "platform",
      repoName: "qa",
      repoId: Date.now(),
      githubOwnerId: 1,
    };
  await db.query(
    "INSERT INTO internship_sessions(id,code,name,status,startDate,endDate) VALUES(@0,@0,'Grant fixture','active',SYSUTCDATETIME(),DATEADD(day,1,SYSUTCDATETIME()))",
    [sessionId],
  );
  await db.query(
    "INSERT INTO github_invitation_events(id,sessionId,userId,githubUserId,invitationId,action,status,source) VALUES(@0,@1,@2,2,50,'invited','pending','automatic_sync')",
    [eventId, sessionId, user.id],
  );
  const result: InvitationResult = {
    status: "pending",
    githubUserId: "2",
    login: "student",
    invitationId: "50",
    invitedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    errorCode: null,
    invited: true,
  };
  return { user, sessionId, eventId, repo, result };
}
it("does not claim observed/manual invitation or existing 204 access, even if an invited event exists", async () => {
  const f = await fixture();
  for (const status of ["pending", "accepted"] as const)
    await db.transaction((em) =>
      recordSystemInvitation(em, f.eventId, f.sessionId, f.user.id, f.repo, {
        ...f.result,
        status,
        invited: false,
      }),
    );
  expect(
    await db.query(
      "SELECT id FROM github_repository_grants WHERE sourceSessionId=@0",
      [f.sessionId],
    ),
  ).toHaveLength(0);
});
it("records a verified new invitation exactly once and binds repository, numeric identity and immutable event", async () => {
  const f = await fixture();
  for (let i = 0; i < 2; i++)
    await db.transaction((em) =>
      recordSystemInvitation(
        em,
        f.eventId,
        f.sessionId,
        f.user.id,
        f.repo,
        f.result,
      ),
    );
  const rows = await db.query(
    "SELECT id,provenance,state,repoId,githubUserId FROM github_repository_grants WHERE sourceSessionId=@0",
    [f.sessionId],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    provenance: "github_201",
    state: "invited",
  });
  expect(rows[0].id.toLowerCase()).toBe(f.eventId.toLowerCase());
  expect(String(rows[0].repoId)).toBe(String(f.repo.repoId));
  expect(String(rows[0].githubUserId)).toBe("2");
});
it("rejects owner grants and a mismatched audit event instead of fabricating proof", async () => {
  const f = await fixture();
  await expect(
    db.transaction((em) =>
      recordSystemInvitation(
        em,
        f.eventId,
        f.sessionId,
        f.user.id,
        { ...f.repo, githubOwnerId: 2 },
        f.result,
      ),
    ),
  ).rejects.toThrow("GITHUB_GRANT_PROOF_INVALID");
  await expect(
    db.transaction((em) =>
      recordSystemInvitation(
        em,
        randomUUID(),
        f.sessionId,
        f.user.id,
        f.repo,
        f.result,
      ),
    ),
  ).rejects.toThrow("GITHUB_GRANT_PROOF_INVALID");
});
