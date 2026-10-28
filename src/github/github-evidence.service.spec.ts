import { DataSource } from "typeorm";
import { GithubAuthService } from "./github-auth.service";
import { GithubClient } from "./github-client";
import {
  GithubEvidenceService,
  SubmissionSnapshot,
} from "./github-evidence.service";
import { GithubRepositoriesService } from "./github-repositories.service";

describe("GitHub submission evidence boundaries", () => {
  const headSha = "a".repeat(40),
    baseSha = "b".repeat(40),
    blobSha = "c".repeat(40);
  const snapshot: SubmissionSnapshot = {
    headSha,
    baseSha,
    repositoryId: 123,
    sourceKind: "pull",
    sourceRef: "7",
    pullNumber: 7,
  };
  const repository = {
    status: "ready",
    repoId: 123,
    defaultBranch: "main",
    ownerUserId: "teacher",
    ownerLogin: "teacher",
    repoName: "course",
  };

  function serviceWith(call: (path: string) => Promise<unknown>) {
    return new GithubEvidenceService(
      {
        query: async () => [{ sessionId: "session" }],
      } as unknown as DataSource,
      {
        token: async () => ({ token: "fake-token" }),
      } as unknown as GithubAuthService,
      { call } as unknown as GithubClient,
      { read: async () => repository } as unknown as GithubRepositoriesService,
    );
  }

  function remote(
    file: { filename: string; sha: string; status: string; patch?: string },
    blobAvailable = true,
  ) {
    return async (path: string): Promise<unknown> => {
      if (path === "/repos/teacher/course") return { id: 123 };
      if (path === "/repos/teacher/course/pulls/7")
        return {
          head: { sha: headSha, repo: { full_name: "teacher/course" } },
          base: { sha: baseSha, repo: { id: 123 } },
          changed_files: 1,
          state: "open",
          merged: false,
        };
      if (path.includes("/compare/") || path.includes("/pulls/7/files"))
        return path.includes("/compare/") ? { files: [file] } : [file];
      if (path.includes("/git/blobs/")) {
        if (!blobAvailable) throw new Error("Blob unavailable");
        return {
          content: Buffer.from("export const answer = 42;\n").toString(
            "base64",
          ),
          encoding: "base64",
          size: Buffer.byteLength("export const answer = 42;\n"),
        };
      }
      if (path.includes("/check-runs")) return { check_runs: [] };
      throw new Error(`Unexpected GitHub request: ${path}`);
    };
  }

  it.each(['tests/notes.spec.cjs', 'playwright.config.mjs'])('collects standard JavaScript module source %s with the same SHA and bounds', async filename => {
    const service = serviceWith(remote({ filename, sha: blobSha, status: 'added', patch: '+export const answer = 42;' }));
    const evidence = await service.collect('task', snapshot);
    expect(evidence).toMatchObject({ complete: true, files: [{ path: filename, sha: blobSha, content: 'export const answer = 42;\n' }] });
  });
  it('does not admit oversized JavaScript modules to obtain a complete review', async () => {
    const fallback = remote({ filename: 'tests/large.spec.cjs', sha: blobSha, status: 'added', patch: '+large test' });
    const service = serviceWith(async path => path.includes('/git/blobs/') ? { encoding: 'base64', size: 30001, content: Buffer.alloc(30001, 'x').toString('base64') } : fallback(path));
    const evidence = await service.collect('task', snapshot);
    expect(evidence.complete).toBe(false); expect(evidence.files).toHaveLength(0);
    expect(evidence.warnings).toContain('File quá lớn hoặc không đọc được: tests/large.spec.cjs');
  });
  it('keeps credentials out of CommonJS source and marks the evidence incomplete', async () => {
    const fallback = remote({ filename: 'config.cjs', sha: blobSha, status: 'added', patch: '+module config' });
    const source = 'module.exports = { password: "synthetic-secret-for-test" };';
    const service = serviceWith(async path => path.includes('/git/blobs/') ? { encoding: 'base64', size: Buffer.byteLength(source), content: Buffer.from(source).toString('base64') } : fallback(path));
    const evidence = await service.collect('task', snapshot);
    expect(evidence.complete).toBe(false); expect(evidence.files).toHaveLength(0);
    expect(JSON.stringify(evidence)).not.toContain('synthetic-secret-for-test');
  });
  it("collects the saved base/head comparison instead of mutable PR file responses", async () => {
    const fallback = remote({
      filename: "src/locked.ts",
      sha: blobSha,
      status: "modified",
      patch: "+export const answer = 42;",
    });
    const requests: string[] = [];
    const service = serviceWith(async (path) => {
      requests.push(path);
      if (path.includes("/pulls/7/files"))
        return [
          {
            filename: "src/live-only.ts",
            sha: blobSha,
            status: "modified",
            patch: "+unrelated live diff",
          },
        ];
      if (
        path.includes("/compare/") &&
        !path.includes(`${baseSha}...${headSha}`)
      )
        throw new Error("Comparison does not match submitted snapshot");
      return fallback(path);
    });

    const evidence = await service.collect("task", snapshot);

    expect(evidence.files.map((file) => file.path)).toEqual(["src/locked.ts"]);
    expect(evidence).toMatchObject({ headSha, baseSha, complete: true });
    expect(requests.some((path) => path.includes("/pulls/7/files"))).toBe(
      false,
    );
  });

  it("rejects a changed live PR base before returning any code evidence", async () => {
    const fallback = remote({
      filename: "src/locked.ts",
      sha: blobSha,
      status: "modified",
      patch: "+export const answer = 42;",
    });
    const service = serviceWith(async (path) => {
      if (path === "/repos/teacher/course/pulls/7")
        return {
          head: { sha: headSha, repo: { full_name: "teacher/course" } },
          base: { sha: "d".repeat(40), repo: { id: 123 } },
          changed_files: 1,
          state: "open",
          merged: false,
        };
      return fallback(path);
    });

    await expect(service.collect("task", snapshot)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "SUBMISSION_SHA_CHANGED" }),
    });
  });

  it("marks deleted source incomplete when neither its patch nor old blob is available", async () => {
    const service = serviceWith(
      remote(
        { filename: "src/deleted.ts", sha: blobSha, status: "removed" },
        false,
      ),
    );

    const evidence = await service.collect("task", snapshot);

    expect(evidence.complete).toBe(false);
    expect(evidence.warnings.length).toBeGreaterThan(0);
  });

  it("excludes deleted credential files and their patch contents from AI evidence", async () => {
    const secret = "synthetic-private-value-for-regression";
    const service = serviceWith(
      remote({
        filename: ".env",
        sha: blobSha,
        status: "removed",
        patch: `@@ -1 +0,0 @@\n-DATABASE_PASSWORD=${secret}`,
      }),
    );

    const evidence = await service.collect("task", snapshot);

    expect(JSON.stringify(evidence)).not.toContain(secret);
    expect(evidence.files).toEqual([]);
    expect(evidence.complete).toBe(false);
  });

  it.each([
    [
      "config.json",
      '{"database":{"password":"synthetic-private-regression-value"}}',
    ],
    [
      "config.yaml",
      "database:\n  password: synthetic-private-regression-value\n",
    ],
  ])(
    "excludes credential values in ordinary %s source files",
    async (filename, content) => {
      const fallback = remote({
        filename,
        sha: blobSha,
        status: "modified",
        patch: `+${content}`,
      });
      const service = serviceWith(async (path) =>
        path.includes("/git/blobs/")
          ? {
              content: Buffer.from(content).toString("base64"),
              encoding: "base64",
              size: Buffer.byteLength(content),
            }
          : fallback(path),
      );

      const evidence = await service.collect("task", snapshot);

      expect(JSON.stringify(evidence)).not.toContain(
        "synthetic-private-regression-value",
      );
      expect(evidence.files).toEqual([]);
      expect(evidence.complete).toBe(false);
    },
  );

  it("rejects an immutable commit when the remote repository was replaced", async () => {
    const service = serviceWith(async (path) => {
      if (path === "/repos/teacher/course") return { id: 999 };
      throw new Error(`Unexpected GitHub request: ${path}`);
    });

    await expect(
      service.assertFresh("task", {
        ...snapshot,
        sourceKind: "commit",
        sourceRef: headSha,
        pullNumber: null,
      }),
    ).rejects.toThrow();
  });

  it("rejects an immutable commit when its remote repository no longer exists", async () => {
    const service = serviceWith(async () => {
      throw new Error("Repository not found");
    });

    await expect(
      service.assertFresh("task", {
        ...snapshot,
        sourceKind: "commit",
        sourceRef: headSha,
        pullNumber: null,
      }),
    ).rejects.toThrow();
  });
});
