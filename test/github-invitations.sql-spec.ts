import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { GithubInvitationsService } from "../src/github/github-invitations.service";
import { GithubApiError, GithubClient } from "../src/github/github-client";
import { CommunicationsService } from "../src/communications/communications.service";
import { MailTransport } from "../src/communications/mail-transport";
import { createServer } from "node:net";
import { GithubRepositoriesService } from "../src/github/github-repositories.service";
import { GithubAuthService } from "../src/github/github-auth.service";
import { PermissionsService } from "../src/rbac/permissions.service";
import { GithubWebhookService } from "../src/github/github-webhook.service";
import { GithubRepositoryAccountService } from "../src/github/github-repository-account.service";

let db: DataSource;
beforeAll(async () => {
  if (
    !/^VIntern_E2E_CI_\d+_\d+$/.test(process.env.E2E_DB_NAME ?? "") ||
    source.options.type !== "mssql"
  )
    throw Error("Disposable SQL only");
  db = new DataSource({ ...source.options, database: process.env.E2E_DB_NAME });
  await db.initialize();
}, 120000);
afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
});

async function fixture() {
  const sessionId = randomUUID(),
    userId = randomUUID(),
    teacherId = randomUUID();
  for (const id of [userId, teacherId])
    await db.query(
      "INSERT INTO users(id,email,username,displayName,passwordHash,status) VALUES(@0,@1,@0,N'G5 QA','never-a-password','active')",
      [id, `${id}@vintern.test`],
    );
  await db.query(
    "INSERT INTO internship_sessions(id,code,name,status,leadInstructorId,startDate,endDate) VALUES(@0,@0,N'G5 <QA>','active',@1,SYSUTCDATETIME(),DATEADD(day,7,SYSUTCDATETIME()))",
    [sessionId, teacherId],
  );
  await db.query(
    "INSERT INTO session_members(sessionId,userId) VALUES(@0,@1)",
    [sessionId, userId],
  );
  await db.query(
    "INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes) VALUES(@0,@1,'student','not-a-token','read:user')",
    [userId, Math.floor(Math.random() * 1000000000) + 4000000000],
  );
  const [{ githubUserId }] = await db.query(
    "SELECT githubUserId FROM github_connections WHERE userId=@0",
    [userId],
  );
  const repo = {
    sessionId,
    ownerLogin: "platform",
    repoName: `g5-${sessionId}`,
    repoId: Math.floor(Math.random() * 1000000000) + 9000000000,
    githubOwnerId: 1,
  };
  await db.query(
    "INSERT INTO session_repositories(sessionId,ownerUserId,githubOwnerId,ownerLogin,repoName,repoId,status,leaseId) VALUES(@0,@1,1,'platform',@2,@3,'ready',NEWID())",
    [sessionId, teacherId, repo.repoName, repo.repoId],
  );
  const remote = {
    accepted: false,
    pending: [] as Array<{
      id: number;
      invitee: { id: number };
      repository: { id: number };
      created_at: string;
      expired: boolean;
    }>,
    puts: 0,
    error: 0,
  };
  const client = {
    call: jest.fn(async (path: string, _token: string, method = "GET") => {
      if (path.startsWith("/user/"))
        return { id: Number(githubUserId), login: "student-current" };
      if (remote.error) throw new GithubApiError(remote.error);
      if (path.includes("/invitations?")) return remote.pending;
      if (method === "DELETE") {
        remote.pending = [];
        return undefined;
      }
      if (method === "PUT") {
        remote.puts++;
        const [{ utcNow }] = await db.query("SELECT SYSUTCDATETIME() utcNow");
        const invitation = {
          id: 80 + remote.puts,
          invitee: { id: Number(githubUserId) },
          repository: { id: repo.repoId },
          created_at: utcNow.toISOString(),
          expired: false,
        };
        remote.pending = [invitation];
        return invitation;
      }
      if (remote.accepted) return undefined;
      throw new GithubApiError(404);
    }),
  } as unknown as GithubClient;
  const mail = new CommunicationsService(
    db,
    new ConfigService({
      MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      PUBLIC_WEB_ORIGIN: "http://localhost:3001",
    }),
    { configured: () => true } as unknown as MailTransport,
  );
  const service = new GithubInvitationsService(db, client, mail);
  const sync = (force = true, readOnly = false) =>
    service.sync(repo, "private-fixture", teacherId, force, userId, readOnly);
  const state = async () =>
    (
      await db.query(
        "SELECT * FROM session_repo_members WHERE sessionId=@0 AND userId=@1",
        [sessionId, userId],
      )
    )[0];
  const advance = () =>
    db.query(
      "UPDATE session_repo_members SET lastCheckedAt=DATEADD(minute,-2,SYSUTCDATETIME()),lastRequestedAt=DATEADD(minute,-2,SYSUTCDATETIME()) WHERE sessionId=@0",
      [sessionId],
    );
  return {
    sessionId,
    userId,
    teacherId,
    githubUserId,
    repo,
    remote,
    client,
    mail,
    service,
    sync,
    state,
    advance,
  };
}
it("persists pending identity/ID/expiry, one audit, encrypted mail and themed in-app notice", async () => {
  const f = await fixture();
  await f.sync();
  expect(await f.state()).toMatchObject({
    status: "pending",
    invitationId: "81",
    githubUserId: String(f.githubUserId),
    errorCode: null,
    leaseToken: null,
  });
  const events = await db.query(
    "SELECT * FROM github_invitation_events WHERE sessionId=@0",
    [f.sessionId],
  );
  expect(events).toHaveLength(1);
  expect(events[0].actorId.toLowerCase()).toBe(f.teacherId.toLowerCase());
  const notices = await db.query(
    "SELECT * FROM notifications WHERE userId=@0",
    [f.userId],
  );
  expect(notices).toHaveLength(1);
  expect(notices[0].body).toContain(f.repo.repoName);
  const mails = await db.query(
    "SELECT id,sealedPayload FROM mail_outbox WHERE ownerId=@0",
    [f.userId],
  );
  expect(mails).toHaveLength(1);
  expect(mails[0].sealedPayload).not.toContain(f.repo.repoName);
  const preview = await f.mail.preview(mails[0].id);
  expect(JSON.stringify(preview)).toContain("Lời mời cộng tác");
  expect(JSON.stringify(preview)).toContain("G5 &lt;QA&gt;");
});
it('does not invite a stale member removed between the scan and lease claim',async()=>{
  const f=await fixture(),original=db.query.bind(db);let removed=false;
  const spy=jest.spyOn(db,'query').mockImplementation(async(sql,params,runner)=>{const result=await original(sql,params,runner);if(!removed&&sql.includes('SELECT TOP(5) m.userId')){removed=true;await original('DELETE FROM session_members WHERE sessionId=@0 AND userId=@1',[f.sessionId,f.userId]);}return result;});
  try{await expect(f.sync()).rejects.toMatchObject({status:404});expect(f.remote.puts).toBe(0);}finally{spy.mockRestore();}
});
it("serializes concurrent commands and rejects double-clicks without duplicate access or mail", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.sync(), f.sync()]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(f.remote.puts).toBe(1);
  expect(
    await db.query("SELECT id FROM mail_outbox WHERE ownerId=@0", [f.userId]),
  ).toHaveLength(1);
});
it("reconciles pending then accepted without another PUT or acceptance spam", async () => {
  const f = await fixture();
  await f.sync();
  await f.advance();
  await f.sync();
  expect(f.remote.puts).toBe(1);
  expect((await f.state()).status).toBe("pending");
  f.remote.accepted = true;
  await f.advance();
  await f.sync();
  expect((await f.state()).status).toBe("accepted");
  expect(f.remote.puts).toBe(1);
  await f.advance();
  await f.sync();
  expect(f.remote.puts).toBe(1);
});
it("shows expired without auto-resending, then staff can reinvite with a new immutable event", async () => {
  const f = await fixture();
  await f.sync();
  f.remote.pending[0].expired = true;
  await f.advance();
  await f.sync(false, true);
  expect((await f.state()).status).toBe("expired");
  expect(f.remote.puts).toBe(1);
  await f.advance();
  await f.sync();
  expect((await f.state()).invitationId).toBe("82");
  expect(f.remote.puts).toBe(2);
  expect(
    await db.query(
      "SELECT id FROM github_invitation_events WHERE sessionId=@0 AND action='invited'",
      [f.sessionId],
    ),
  ).toHaveLength(2);
});
it("records remote permission failure and recovers after cooldown and staff retry", async () => {
  const f = await fixture();
  f.remote.error = 403;
  await f.sync();
  expect(await f.state()).toMatchObject({
    status: "failed",
    errorCode: "GITHUB_RATE_OR_PERMISSION",
  });
  expect(f.remote.puts).toBe(0);
  f.remote.error = 0;
  await f.advance();
  await f.sync();
  expect((await f.state()).status).toBe("pending");
});
it("retains historic numeric identity on disconnect and blocks silent privilege transfer on reconnect", async () => {
  const f = await fixture();
  await f.sync();
  await db.query("DELETE FROM github_connections WHERE userId=@0", [f.userId]);
  await f.advance();
  await f.sync();
  expect(await f.state()).toMatchObject({
    status: "not_connected",
    githubUserId: String(f.githubUserId),
  });
  await db.query(
    "INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes) VALUES(@0,@1,'other','not-token','read:user')",
    [f.userId, Number(f.githubUserId) + 1],
  );
  await f.advance();
  await f.sync();
  expect(await f.state()).toMatchObject({
    status: "failed",
    errorCode: "GITHUB_IDENTITY_CHANGED",
  });
  expect(f.remote.puts).toBe(1);
});
it("keeps state and pending event when SMTP queueing fails, then retries notices exactly once", async () => {
  const f = await fixture();
  const enqueue = jest
    .spyOn(f.mail, "enqueue")
    .mockRejectedValueOnce(Error("mail unavailable"));
  await f.sync();
  expect((await f.state()).status).toBe("pending");
  expect(
    await db.query("SELECT id FROM mail_outbox WHERE ownerId=@0", [f.userId]),
  ).toHaveLength(0);
  enqueue.mockRestore();
  await f.service.flushNotices(f.sessionId);
  await f.service.flushNotices(f.sessionId);
  expect(
    await db.query("SELECT id FROM mail_outbox WHERE ownerId=@0", [f.userId]),
  ).toHaveLength(1);
  expect(
    await db.query("SELECT id FROM notifications WHERE userId=@0", [f.userId]),
  ).toHaveLength(1);
});
it("honors in-app preferences without dropping the separate GitHub email", async () => {
  const f = await fixture();
  await db.query(
    "INSERT INTO notification_preferences(userId,category,enabled) VALUES(@0,'session',0)",
    [f.userId],
  );
  await f.sync();
  expect(
    await db.query("SELECT id FROM notifications WHERE userId=@0", [f.userId]),
  ).toHaveLength(0);
  expect(
    await db.query("SELECT id FROM mail_outbox WHERE ownerId=@0", [f.userId]),
  ).toHaveLength(1);
});
it("never grants write permission from student self-reconciliation", async () => {
  const f = await fixture();
  await f.sync(false, true);
  expect(f.remote.puts).toBe(0);
  expect((await f.state()).status).toBe("failed");
});
it("lets the student check after automatic reconciliation while throttling repeated manual checks", async () => {
  const f = await fixture();
  await f.sync(false);
  await expect(
    f.service.sync(f.repo, "private-fixture", f.userId, false, f.userId, true),
  ).resolves.toMatchObject({ processed: 1 });
  await expect(
    f.service.sync(f.repo, "private-fixture", f.userId, false, f.userId, true),
  ).rejects.toMatchObject({
    response: expect.objectContaining({ code: "GITHUB_INVITATION_COOLDOWN" }),
  });
  expect(f.remote.puts).toBe(1);
});
it("rejects members outside the current session before contacting GitHub", async () => {
  const f = await fixture();
  await db.query(
    "DELETE FROM session_members WHERE sessionId=@0 AND userId=@1",
    [f.sessionId, f.userId],
  );
  await expect(f.sync()).rejects.toMatchObject({ status: 404 });
  expect(f.client.call).not.toHaveBeenCalled();
});
it("keeps student reads private and forbids students from inviting another member", async () => {
  const f = await fixture();
  await f.sync();
  await db.query(
    "INSERT INTO session_repo_members(sessionId,userId,status) VALUES(@0,@1,'not_connected')",
    [f.sessionId, f.teacherId],
  );
  const repositories = new GithubRepositoriesService(
    db,
    {} as GithubAuthService,
    f.client,
    { hasRole: async () => false } as unknown as PermissionsService,
    {} as GithubWebhookService,
    {} as GithubRepositoryAccountService,
    f.service,
  );
  const own = await repositories.status(f.sessionId, f.userId);
  expect(own.canManage).toBe(false);
  expect(own.members).toHaveLength(1);
  expect(own.members[0].userId.toLowerCase()).toBe(f.userId.toLowerCase());
  expect(
    (await repositories.status(f.sessionId, f.teacherId)).members,
  ).toHaveLength(2);
  await expect(
    repositories.invite(f.sessionId, f.userId, true, f.teacherId),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    repositories.status(f.sessionId, randomUUID()),
  ).rejects.toMatchObject({ status: 403 });
});
it("sends the branded invitation through real loopback SMTP and deduplicates the delivery", async () => {
  const f = await fixture();
  await f.sync();
  const received: string[] = [];
  const server = createServer((socket) => {
    socket.write("220 local V-Intern SMTP\r\n");
    let buffer = "",
      data = false,
      body = "";
    socket.on("data", (bytes) => {
      buffer += bytes.toString();
      let end: number;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            received.push(body);
            body = "";
            data = false;
            socket.write("250 accepted\r\n");
          } else body += line + "\r\n";
        } else if (/^EHLO/.test(line))
          socket.write("250-localhost\r\n250 8BITMIME\r\n");
        else if (line === "DATA") {
          data = true;
          socket.write("354 continue\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const config = new ConfigService({
      MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: (server.address() as { port: number }).port,
      SMTP_FROM: "V-Intern <noreply@vintern.test>",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      SMTP_SECURE: "false",
      SMTP_DEV_ALLOW_PLAIN: "true",
    });
    const worker = new CommunicationsService(
      db,
      config,
      new MailTransport(config),
    );
    await db.query(
      "UPDATE mail_outbox SET availableAt=DATEADD(day,-1,SYSUTCDATETIME()) WHERE ownerId=@0",
      [f.userId],
    );
    expect(await worker.tick()).toBe(1);
    expect(received).toHaveLength(1);
    expect(received[0]).toContain(f.repo.repoName);
    expect(received[0]).toContain("/github/invitation");
    expect(
      (
        await db.query("SELECT status FROM mail_outbox WHERE ownerId=@0", [
          f.userId,
        ])
      )[0].status,
    ).toBe("accepted");
    await f.service.flushNotices(f.sessionId);
    expect(
      await db.query("SELECT id FROM mail_outbox WHERE ownerId=@0", [f.userId]),
    ).toHaveLength(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
