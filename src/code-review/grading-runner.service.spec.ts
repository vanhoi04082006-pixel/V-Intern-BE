import { ConfigService } from "@nestjs/config";
import { createHash, createHmac } from "crypto";
import { GradingRunnerService } from "./grading-runner.service";

describe("Trusted grading result request binding", () => {
  const signingKey = "synthetic-runner-signing-key";
  const suiteDigest = "d".repeat(64);
  const input = {
    repository: "https://github.com/teacher/course",
    headSha: "a".repeat(40),
    baseSha: "b".repeat(40),
    templateCode: "web-app",
    taskId: "task-one",
    taskSpecHash: "f".repeat(64),
  };
  let fetchMock: jest.SpyInstance;

  function runner() {
    const values: Record<string, string> = {
      GRADING_RUNNER_URL: "https://runner.example.test/grade",
      GRADING_RUNNER_TOKEN: "synthetic-runner-token",
      GRADING_RUNNER_SIGNING_KEY: signingKey,
      GRADING_SUITES_JSON: JSON.stringify({
        "web-app:task-one": { id: "trusted-suite", digest: suiteDigest },
      }),
      NODE_ENV: "test",
    };
    return new GradingRunnerService({
      get: (key: string) => values[key],
    } as ConfigService);
  }
  function requestHash(body: Record<string, unknown>) {
    const bound = { ...body };
    delete bound.requestHash;
    return createHash("sha256").update(JSON.stringify(bound)).digest("hex");
  }
  function signedResponse(
    body: Record<string, unknown>,
    hash: string | undefined,
  ) {
    const payload = {
      headSha: body.headSha,
      suiteId: body.suiteId,
      suiteDigest: body.suiteDigest,
      status: "completed",
      passed: 5,
      failed: 0,
      summary: "Trusted tests passed.",
      ...(hash === undefined ? {} : { requestHash: hash }),
    };
    const signature = createHmac("sha256", signingKey)
      .update(JSON.stringify(payload))
      .digest("hex");
    return new Response(JSON.stringify({ payload, signature }), {
      status: 200,
    });
  }
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("accepts a signed result bound to the complete request, including a fresh nonce", async () => {
    fetchMock.mockImplementation(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        ...input,
        suiteId: "trusted-suite",
        suiteDigest,
      });
      expect(typeof body.nonce).toBe("string");
      expect(String(body.nonce).length).toBeGreaterThanOrEqual(16);
      expect(body.requestHash).toBe(requestHash(body));
      return signedResponse(body, requestHash(body));
    });

    await expect(runner().grade(input)).resolves.toMatchObject({
      status: "completed",
      passed: 5,
      failed: 0,
    });
  });

  it.each([
    ["repository", "https://github.com/another/course"],
    ["baseSha", "c".repeat(40)],
    ["templateCode", "another-template"],
    ["nonce", "nonce-from-another-request"],
    ["taskId", "task-two"],
    ["taskSpecHash", "0".repeat(64)],
  ])(
    "rejects a correctly signed result for another %s",
    async (field, value) => {
      fetchMock.mockImplementation(async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return signedResponse(body, requestHash({ ...body, [field]: value }));
      });

      await expect(runner().grade(input)).resolves.toMatchObject({
        status: "failed",
        passed: 0,
        failed: 0,
      });
    },
  );

  it("rejects signed legacy results that omit the request hash", async () => {
    fetchMock.mockImplementation(async (_url: unknown, init: RequestInit) =>
      signedResponse(
        JSON.parse(String(init.body)) as Record<string, unknown>,
        undefined,
      ),
    );

    await expect(runner().grade(input)).resolves.toMatchObject({
      status: "failed",
      passed: 0,
      failed: 0,
    });
  });

  it("rejects replay of a valid result from a previous request for the same commit", async () => {
    const requests: Record<string, unknown>[] = [];
    let replay: { body: Record<string, unknown>; hash: string } | undefined;
    fetchMock.mockImplementation(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push(body);
      replay ??= { body, hash: requestHash(body) };
      return signedResponse(replay.body, replay.hash);
    });
    const service = runner();

    expect((await service.grade(input)).status).toBe("completed");
    expect((await service.grade(input)).status).toBe("failed");
    expect(requests[0].nonce).not.toEqual(requests[1].nonce);
  });
});
