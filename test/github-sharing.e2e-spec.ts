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

// Real SQL tests. Only the external OAuth exchange/identity HTTP transport is mocked.
describe("consent and OAuth persistence on the current SQL schema", () => {
  let db: DataSource, permissions: PermissionsService, sharing: SharingService;
  let owner: User, reader: User, student: User, sessionId: string;
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

  it("requests, approves, reads only the chosen session and revokes, with notifications/audit", async () => {
    const grant = await sharing.request(reader.id, {
      ownerEmail: owner.email,
      reason: "Review the chosen teaching session with consent.",
    });
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
    await expect(
      sharing.decide(reader.id, grant.id, { decision: "revoke" }),
    ).rejects.toMatchObject({ status: 404 });
    await sharing.decide(owner.id, grant.id, { decision: "revoke" });
    await expect(
      sharing.snapshot(reader.id, grant.id, 1, 10),
    ).rejects.toMatchObject({ status: 403 });
    const [counts] = await db.query(
      "SELECT COUNT(*) n FROM audit_logs WHERE targetId=@0",
      [grant.id],
    );
    expect(Number(counts.n)).toBe(3);
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
});
