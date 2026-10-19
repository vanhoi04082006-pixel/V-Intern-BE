import "dotenv/config";
import { randomBytes, randomUUID } from "crypto";
import { ConfigService } from "@nestjs/config";
import { hash } from "bcryptjs";
import { DataSource } from "typeorm";
import source from "../src/database/data-source";
import { ensureRbac } from "../src/bootstrap/ensure-rbac";
import { User } from "../src/users/entities/user.entity";
import { UserRole } from "../src/rbac/entities/user-role.entity";
import { Role } from "../src/rbac/entities/role.entity";
import { RolePermission } from "../src/rbac/entities/role-permission.entity";
import { Permission } from "../src/rbac/entities/permission.entity";
import { GroupMember } from "../src/groups/entities/group-member.entity";
import { GroupRole } from "../src/groups/entities/group-role.entity";
import { PermissionsService } from "../src/rbac/permissions.service";
import { InternshipSession } from "../src/sessions/entities/internship-session.entity";
import { SessionMember } from "../src/sessions/entities/session-member.entity";
import { SharingService } from "../src/sharing/sharing.service";
import { GithubAuthService } from "../src/github/github-auth.service";
import { GithubClient } from "../src/github/github-client";
import { GithubApiError } from '../src/github/github-client';
import { GithubRepositoryAccountService } from '../src/github/github-repository-account.service';
import { GithubRepositoriesService } from '../src/github/github-repositories.service';
import { GithubWebhookService } from '../src/github/github-webhook.service';
import { sealToken } from '../src/github/github-security';

// Real SQL tests. Only the external OAuth exchange/identity HTTP transport is mocked.
describe("consent and OAuth persistence on the current SQL schema", () => {
  let db: DataSource, permissions: PermissionsService, sharing: SharingService;
  let owner: User, reader: User, student: User, admin: User, sessionId: string;
  const centralKey = randomBytes(32).toString('base64');
  const centralConfig = new ConfigService({ GITHUB_CLIENT_ID: 'fixture-client', GITHUB_CLIENT_SECRET: 'fixture-secret', GITHUB_CALLBACK_URL: 'http://localhost:8080/api/v1/github/callback', FRONTEND_ORIGIN: 'http://localhost:3001', GITHUB_TOKEN_ENCRYPTION_KEY: centralKey });
  const centralIdentity = { id: Math.floor(Math.random() * 1000000000) + 2000000000, login: 'platform-owner' };
  const centralClient = { call: jest.fn(async () => centralIdentity) };
  let centralAuth: GithubAuthService, centralAccount: GithubRepositoryAccountService;
  let lifecycleGrantId: string;
  const originalFetch = global.fetch;
  beforeAll(async () => {
    const database = process.env.E2E_DB_NAME ?? "";
    if (
      !/^[A-Za-z0-9_]+$/.test(database) ||
      !/(?:^|_)(?:E2E|Test)(?:_|$)/i.test(database)
    )
      throw new Error("Explicit disposable E2E database required.");
    const options = source.options;
    if (options.type !== "mssql")
      throw new Error("SQL Server datasource required.");
    db = new DataSource({ ...options, database, synchronize: false });
    await db.initialize();
    await db.runMigrations({ transaction: "all" });
    expect(await db.showMigrations()).toBe(false);
    await ensureRbac(db);
    permissions = new PermissionsService(
      db.getRepository(UserRole),
      db.getRepository(GroupMember),
      db.getRepository(GroupRole),
      db.getRepository(Role),
      db.getRepository(RolePermission),
      db.getRepository(Permission),
    );
    sharing = new SharingService(db, permissions);
    async function user(roleCode: string) {
      const suffix = randomUUID().slice(0, 8),
        role = await db.getRepository(Role).findOneByOrFail({ code: roleCode });
      const record = await db
        .getRepository(User)
        .save({
          email: `consent.${suffix}@vintern.test`,
          username: `consent.${suffix}`,
          displayName: `Consent ${suffix}`,
          passwordHash: await hash(randomBytes(16).toString("hex"), 10),
          status: "active",
        });
      await db
        .getRepository(UserRole)
        .insert({ userId: record.id, roleId: role.id });
      return record;
    }
    owner = await user("instructor");
    reader = await user("instructor");
    student = await user("intern");
    admin = await user('admin');
    centralAuth = new GithubAuthService(db, centralConfig, centralClient as unknown as GithubClient, permissions);
    centralAccount = new GithubRepositoryAccountService(db, centralAuth, centralClient as unknown as GithubClient, permissions);
    const session = await db
      .getRepository(InternshipSession)
      .save({
        code: `CONSENT-${randomUUID().slice(0, 8)}`,
        name: "Consent SQL regression",
        leadInstructorId: owner.id,
        status: "upcoming",
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
      });
    sessionId = session.id;
    await db
      .getRepository(SessionMember)
      .insert({ sessionId, userId: student.id });
  }, 60000);
  afterEach(() => {
    global.fetch = originalFetch;
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it("requests, deduplicates, approves and reads only the consented session", async () => {
    const grant = await sharing.request(reader.id, {
      ownerEmail: owner.email,
      reason: "Review the chosen teaching session with consent.",
    });
    lifecycleGrantId = grant.id;
    const replay = await sharing.request(reader.id, {
      ownerEmail: owner.email,
      reason: "Duplicate request must return the pending request.",
    });
    expect(replay.id).toBe(grant.id);
    await expect(
      sharing.snapshot(reader.id, grant.id, 1, 10),
    ).rejects.toMatchObject({ status: 403 });
    await sharing.decide(owner.id, grant.id, {
      decision: "approve",
      sessionId,
      days: 7,
    });
    const snapshot = await sharing.snapshot(reader.id, grant.id, 1, 10);
    expect(snapshot.readOnly).toBe(true);
    expect(snapshot.session.id.toLowerCase()).toBe(sessionId.toLowerCase());
    expect(
      snapshot.members.map((u: { id: string }) => u.id.toLowerCase()),
    ).toEqual([student.id.toLowerCase()]);
  });
  it('only the owner revokes consent, immediately blocking the next read with a complete audit', async () => {
    await expect(
      sharing.decide(reader.id, lifecycleGrantId, { decision: "revoke" }),
    ).rejects.toMatchObject({ status: 404 });
    await sharing.decide(owner.id, lifecycleGrantId, { decision: "revoke" });
    await expect(
      sharing.snapshot(reader.id, lifecycleGrantId, 1, 10),
    ).rejects.toMatchObject({ status: 403 });
    const [counts] = await db.query(
      "SELECT COUNT(*) n FROM audit_logs WHERE targetId=@0",
      [lifecycleGrantId],
    );
    expect(Number(counts.n)).toBe(3);
  });
  it('honors the session notification preference while still recording the request', async () => {
    const [before] = await db.query("SELECT COUNT(*) n FROM notifications WHERE userId=@0 AND type='session.sharing'", [owner.id]);
    await db.query("INSERT INTO notification_preferences(userId,category,enabled) VALUES(@0,'session',0)", [owner.id]);
    try {
      const grant = await sharing.request(reader.id, { ownerEmail: owner.email, reason: 'A real consent request with session notifications disabled.' });
      expect(grant.status).toBe('pending');
      const [after] = await db.query("SELECT COUNT(*) n FROM notifications WHERE userId=@0 AND type='session.sharing'", [owner.id]); expect(after.n).toBe(before.n);
      const [audit] = await db.query("SELECT COUNT(*) n FROM audit_logs WHERE targetId=@0 AND action='sharing.requested'", [grant.id]); expect(audit.n).toBe(1);
      await sharing.decide(owner.id, grant.id, { decision: 'deny' });
    } finally { await db.query("DELETE FROM notification_preferences WHERE userId=@0 AND category='session'", [owner.id]); }
  });
  it("rejects inactive owners, self-requests and an unrelated reader", async () => {
    await expect(
      sharing.request(owner.id, {
        ownerEmail: owner.email,
        reason: "Cannot request my own teaching data.",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await db.getRepository(User).update(reader.id, { status: "locked" });
    await expect(
      sharing.request(owner.id, {
        ownerEmail: reader.email,
        reason: "Locked owner must not receive a grant.",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await db.getRepository(User).update(reader.id, { status: "active" });
    const grant = await sharing.request(reader.id, {
      ownerEmail: owner.email,
      reason: "A second approved grant to check expiration.",
    });
    await sharing.decide(owner.id, grant.id, {
      decision: "approve",
      sessionId,
      days: 1,
    });
    await expect(
      sharing.snapshot(owner.id, grant.id, 1, 10),
    ).rejects.toMatchObject({ status: 404 });
    await db.query(
      "UPDATE session_access_requests SET expiresAt=DATEADD(second,-1,SYSUTCDATETIME()) WHERE id=@0",
      [grant.id],
    );
    await expect(
      sharing.snapshot(reader.id, grant.id, 1, 10),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("consumes OAuth state once, stores an encrypted token and binds the active application user", async () => {
    const config = new ConfigService({
      GITHUB_CLIENT_ID: "fixture-client",
      GITHUB_CLIENT_SECRET: "fixture-server-secret",
      GITHUB_CALLBACK_URL: "http://localhost:8080/api/v1/github/callback",
      FRONTEND_ORIGIN: "http://localhost:3001",
      GITHUB_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    });
    const identity = {
      id: Math.floor(Math.random() * 1000000000) + 1000000000,
      login: "fixture-instructor",
    };
    const client = { call: jest.fn(async () => identity) };
    const oauth = new GithubAuthService(
      db,
      config,
      client as unknown as GithubClient,
      permissions,
    );
    const begin = await oauth.begin(owner.id);
    expect(
      new URL(begin.authorizeUrl).searchParams.get("code_challenge_method"),
    ).toBe("S256");
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "fixture-oauth-access-token",
            scope: "read:user public_repo",
          }),
          { status: 200 },
        ),
    ) as typeof fetch;
    await expect(
      oauth.finish("fixture-code", begin.state, "wrong-cookie"),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      await oauth.finish("fixture-code", begin.state, begin.state),
    ).toContain("/instructor/github?connected=1");
    expect((await oauth.connection(owner.id))?.tokenCiphertext).not.toContain(
      "fixture-oauth-access-token",
    );
    expect((await oauth.token(owner.id)).token).toBe(
      "fixture-oauth-access-token",
    );
    await expect(
      oauth.finish("fixture-code", begin.state, begin.state),
    ).rejects.toMatchObject({ status: 401 });
    const locked = await oauth.begin(reader.id);
    await db.getRepository(User).update(reader.id, { status: "locked" });
    await expect(
      oauth.finish("fixture-code", locked.state, locked.state),
    ).rejects.toMatchObject({ status: 401 });
    await db.getRepository(User).update(reader.id, { status: "active" });
  });

  it('lets Admin authorize and select the central repository account without exposing its token', async () => {
    const begin = await centralAuth.begin(admin.id);
    expect(new URL(begin.authorizeUrl).searchParams.get('scope')).toBe('read:user public_repo');
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ access_token: 'central-fixture-token', scope: 'read:user public_repo' }), { status: 200 })) as typeof fetch;
    expect(await centralAuth.finish('code', begin.state, begin.state)).toBe('http://localhost:3001/admin/settings?github=connected');
    expect(await centralAccount.select(admin.id)).toMatchObject({ ready: true, login: 'platform-owner' });
    expect(await centralAccount.status()).toMatchObject({ ready: true });
    const [account] = await db.query('SELECT * FROM github_repository_account WHERE id=1');
    expect(account.userId.toLowerCase()).toBe(admin.id.toLowerCase());
    expect(JSON.stringify(account)).not.toContain('central-fixture-token');
  });

  it('requests identity-only teacher OAuth and rejects teacher selection of the shared account', async () => {
    const begin = await centralAuth.begin(owner.id);
    expect(new URL(begin.authorizeUrl).searchParams.get('scope')).toBe('read:user');
    await expect(centralAccount.select(owner.id)).rejects.toMatchObject({ status: 403 });
  });

  it('creates a centrally owned named repository and invites both teacher and student using real membership SQL', async () => {
    const studentId = Math.floor(Math.random() * 1000000000) + 3000000000;
    await db.query("INSERT INTO github_connections(userId,githubUserId,login,tokenCiphertext,scopes) VALUES(@0,@1,'linked-student',@2,'read:user')", [student.id, studentId, sealToken('student-token', centralKey, student.id.toLowerCase())]);
    await db.getRepository(InternshipSession).update(sessionId, { status: 'active', name: 'Lớp Đồ Án 01', startDate: new Date('2026-10-19T00:00:00Z') });
    let remote: { id: number; name: string; owner: typeof centralIdentity; private: boolean; description: string; html_url: string; default_branch: string } | undefined;
    const calls: string[] = [];
    const client = { call: jest.fn(async (path: string, token: string, method = 'GET', body?: { name: string; description: string }) => {
      expect(token).toBe('central-fixture-token');
      calls.push(`${method} ${path}`);
      if (path === '/user') return centralIdentity;
      if (/^\/user\/\d+$/.test(path)) { const id = Number(path.split('/').pop()); return { id, login: `linked-${id}` }; }
      if (path === '/user/repos' && method === 'POST') {
        remote = { id: studentId + 1, name: body!.name, owner: centralIdentity, private: false, description: body!.description, html_url: `https://github.com/platform-owner/${body!.name}`, default_branch: 'main' };
        return remote;
      }
      if (path.includes('/collaborators/') && method === 'PUT') return {};
      if (path.startsWith('/repos/')) { if (!remote) throw new GithubApiError(404); return remote; }
      throw new Error('Unexpected fixture GitHub API request');
    }) };
    const repos = new GithubRepositoriesService(db, centralAuth, client as unknown as GithubClient, permissions, { register: jest.fn() } as unknown as GithubWebhookService, centralAccount);
    await repos.provision(sessionId, owner.id);
    const repo = await repos.read(sessionId);
    expect(repo?.ownerUserId.toLowerCase()).toBe(admin.id.toLowerCase());
    expect(repo?.repoName).toBe(`vintern-project-lop-do-an-01-20261019-${sessionId.slice(0, 8).toLowerCase()}`);
    expect(calls.filter(call => call.includes('/collaborators/'))).toHaveLength(2);
    const members = await db.query('SELECT userId,status FROM session_repo_members WHERE sessionId=@0', [sessionId]);
    expect(members).toHaveLength(2);
    expect(members.every((member: { status: string }) => member.status === 'invited')).toBe(true);
    await repos.provision(sessionId, owner.id);
    expect(calls.filter(call => call === 'POST /user/repos')).toHaveLength(1);
  });

  it('prevents disconnecting the selected central account', async () => {
    await expect(centralAuth.disconnect(admin.id)).rejects.toMatchObject({ status: 409 });
    expect((await centralAuth.connection(admin.id))?.githubUserId.toString()).toBe(centralIdentity.id.toString());
  });

  it('does not silently relink the selected central account to a different GitHub identity', async () => {
    const auth = new GithubAuthService(db, centralConfig, { call: jest.fn(async () => ({ id: centralIdentity.id + 5, login: 'different-account' })) } as unknown as GithubClient, permissions);
    const begin = await auth.begin(admin.id);
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ access_token: 'wrong-fixture-token', scope: 'read:user public_repo' }), { status: 200 })) as typeof fetch;
    await expect(auth.finish('code', begin.state, begin.state)).rejects.toMatchObject({ status: 409 });
    expect((await centralAuth.connection(admin.id))?.githubUserId.toString()).toBe(centralIdentity.id.toString());
  });
  it('refuses an unexpired repository-owner token after the application account is locked', async () => {
    await db.getRepository(User).update(admin.id, { status: 'locked' });
    try {
      await expect(centralAuth.token(admin.id)).rejects.toMatchObject({ status: 503 });
      await expect(centralAccount.credentials()).rejects.toMatchObject({ status: 503 });
    } finally {
      await db.getRepository(User).update(admin.id, { status: 'active' });
    }
  });
});
