import { DataSource } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { GithubAuthService } from "./github-auth.service";
import { GithubApiError, GithubClient } from "./github-client";
import { GithubRepositoriesService } from "./github-repositories.service";
import { GithubWebhookService } from './github-webhook.service';

const SESSION = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const NAME = "vintern-course-11111111";
interface Member {
  userId: string;
  login: string | null;
  githubUserId: number | null;
}

function fixture(
  options: {
    members?: Member[];
    repository?: Record<string, unknown>;
    connectionId?: number;
    authenticatedId?: number;
    remoteId?: number;
    remoteOwnerId?: number;
    remotePrivate?: boolean;
    remoteMissing?: boolean;
    resolvedMemberId?: number;
  } = {},
) {
  const repository = {
    sessionId: SESSION,
    ownerUserId: OWNER,
    githubOwnerId: 101,
    ownerLogin: "teacher",
    repoName: NAME,
    repoId: 5001,
    htmlUrl: `https://github.com/teacher/${NAME}`,
    defaultBranch: "main",
    status: "ready",
    leaseId: "lease",
    updatedAt: new Date(),
    errorCode: null,
    ...options.repository,
  };
  const members = options.members ?? [
    { userId: "student", login: "old-student", githubUserId: 202 },
  ];
  const savedMembers = new Map<string, string>();
  const connectionId = options.connectionId ?? 101;
  const connection = {
    userId: OWNER,
    githubUserId: connectionId,
    login: connectionId === 101 ? "teacher" : "another-teacher",
    scopes: "public_repo",
    tokenCiphertext: "fixture",
    expiresAt: null,
  };
  const remote = {
    id: options.remoteId ?? 5001,
    name: NAME,
    owner: { id: options.remoteOwnerId ?? 101, login: "teacher" },
    private: options.remotePrivate ?? false,
    description: `V-INTERN session ${SESSION}`,
    default_branch: "main",
    html_url: repository.htmlUrl,
  };
  const writes: Array<{ path: string; method: string; body?: object }> = [];
  const reads: string[] = [];
  const query = jest.fn(
    async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
      if (/SELECT.*FROM internship_sessions/is.test(sql))
        return [
          {
            id: SESSION,
            code: "course",
            leadInstructorId: OWNER,
            status: "active",
          },
        ];
      if (/SELECT.*FROM session_repositories/is.test(sql))
        return [{ ...repository }];
      if (/SELECT.*FROM session_members\s+m/is.test(sql)) {
        let limit = members.length;
        const literal = sql.match(/TOP\s*\(?\s*(\d+)\s*\)?/i);
        const parameter = sql.match(/TOP\s*\(?\s*@(\d+)\s*\)?/i);
        if (literal) limit = Number(literal[1]);
        if (parameter) limit = Number(params[Number(parameter[1])]);
        return members
          .filter((member) => savedMembers.get(member.userId) !== "invited")
          .slice(0, limit);
      }
      if (/SELECT.*FROM session_repo_members/is.test(sql)) {
        if (params.length > 1)
          return savedMembers.has(String(params[1]))
            ? [
                {
                  userId: params[1],
                  status: savedMembers.get(String(params[1])),
                },
              ]
            : [];
        return [...savedMembers].map(([userId, status]) => ({
          userId,
          status,
        }));
      }
      if (
        /INSERT INTO session_repo_members|UPDATE session_repo_members/i.test(
          sql,
        )
      ) {
        savedMembers.set(String(params[1]), String(params[2]));
        return [];
      }
      return [];
    },
  );
  const db = {
    query,
    transaction: async (
      fn: (manager: { query: typeof query }) => Promise<unknown>,
    ) => fn({ query }),
  };
  const auth = {
    token: jest.fn(async () => ({ token: "fixture-token", connection })),
  };
  const client = {
    call: jest.fn(
      async (path: string, _token: string, method = "GET", body?: object) => {
        if (method !== "GET") {
          writes.push({ path, method, body });
          return method === "POST" ? remote : undefined;
        }
        reads.push(path);
        if (path === "/user")
          return {
            id: options.authenticatedId ?? connectionId,
            login: connection.login,
          };
        if (/^\/user\/\d+$/.test(path)) {
          const id = Number(path.split("/").pop());
          return {
            id: options.resolvedMemberId ?? id,
            login: id === 202 ? "current-student" : `current-student-${id}`,
          };
        }
        if (path.startsWith("/users/"))
          return { id: 999, login: "old-student" };
        if (path.startsWith("/repos/")) {
          if (options.remoteMissing) throw new GithubApiError(404);
          return remote;
        }
        throw new Error(`Unexpected GitHub request: ${path}`);
      },
    ),
  };
  const service = new GithubRepositoriesService(
    db as unknown as DataSource,
    auth as unknown as GithubAuthService,
    client as unknown as GithubClient,
    {} as PermissionsService,
    { register: jest.fn() } as unknown as GithubWebhookService,
  );
  return { service, writes, reads, savedMembers, repository };
}

describe("GitHub repository invitation trust boundaries", () => {
  it("invites the current username belonging to the linked immutable GitHub ID", async () => {
    const f = fixture();
    await f.service.invite(SESSION, OWNER);
    expect(f.writes).toEqual([
      {
        path: `/repos/teacher/${NAME}/collaborators/current-student`,
        method: "PUT",
        body: { permission: "push" },
      },
    ]);
    expect(f.savedMembers.get("student")).toBe("invited");
  });

  it("never grants write access when a resolved recipient has a different GitHub ID", async () => {
    const f = fixture({ resolvedMemberId: 999 });
    await f.service.invite(SESSION, OWNER).catch(() => undefined);
    expect(f.writes).toEqual([]);
    expect(f.savedMembers.get("student")).not.toBe("invited");
  });

  it("rejects a current session lead who does not own the recorded repository", async () => {
    const f = fixture({ repository: { ownerUserId: "another-owner" } });
    await expect(f.service.invite(SESSION, OWNER)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });

  it.each([
    ["replacement repository", { remoteId: 9001 }],
    ["different GitHub owner", { remoteOwnerId: 999 }],
    ["private repository", { remotePrivate: true }],
    ["changed linked GitHub identity", { connectionId: 303 }],
    [
      "token belonging to a different GitHub identity",
      { authenticatedId: 999 },
    ],
  ])(
    "does not grant collaborators access to a %s",
    async (_description, options) => {
      const f = fixture(options);
      await expect(f.service.invite(SESSION, OWNER)).rejects.toThrow();
      expect(f.writes).toEqual([]);
    },
  );

  it("processes at most five collaborator invitations in one request", async () => {
    const members = Array.from({ length: 37 }, (_, i) => ({
      userId: `student-${i}`,
      login: `cached-${i}`,
      githubUserId: 202 + i,
    }));
    const f = fixture({ members });
    await f.service.invite(SESSION, OWNER);
    expect(f.writes.length).toBeGreaterThan(0);
    expect(f.writes.length).toBeLessThanOrEqual(5);
    expect(f.savedMembers.size).toBeLessThan(members.length);
  });

  it("makes progress through later members without repeating successful invitations", async () => {
    const members = Array.from({ length: 7 }, (_, i) => ({
      userId: `student-${i}`,
      login: `cached-${i}`,
      githubUserId: 202 + i,
    }));
    const f = fixture({ members });
    await f.service.invite(SESSION, OWNER);
    await f.service.invite(SESSION, OWNER);
    expect([...f.savedMembers.values()]).toEqual(Array(7).fill("invited"));
    expect(f.writes).toHaveLength(7);
    expect(new Set(f.writes.map((write) => write.path)).size).toBe(7);
  });

  it("does not create another repository when a failed claim belongs to a different linked GitHub identity", async () => {
    const f = fixture({
      repository: { status: "failed", repoId: null },
      connectionId: 303,
      remoteMissing: true,
    });
    await expect(f.service.provision(SESSION, OWNER)).rejects.toThrow();
    expect(f.writes).toEqual([]);
  });
});
