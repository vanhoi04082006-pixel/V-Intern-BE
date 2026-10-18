import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createRunner } from "../server.mjs";
import { hash, digestSuite } from "../policy.mjs";

const token = "test-only-token-".repeat(4),
  signingKey = "test-only-signing-".repeat(4);
const suite = {
  templateCode: "notes",
  repository: "https://github.com/teacher/course",
  taskId: "one",
  taskSpecHash: "c".repeat(64),
  runtimeImage: `app@sha256:${"d".repeat(64)}`,
  testerImage: `tests@sha256:${"e".repeat(64)}`,
  command: ["node", "/runner/launch.mjs"],
  checks: [{ kind: "http", path: "/", status: 200 }],
};
function request() {
  const data = {
    repository: suite.repository,
    templateCode: suite.templateCode,
    taskId: suite.taskId,
    taskSpecHash: suite.taskSpecHash,
    headSha: "a".repeat(40),
    baseSha: "b".repeat(40),
    suiteId: "one",
    suiteDigest: digestSuite(suite),
    nonce: randomUUID(),
  };
  return { ...data, requestHash: hash(data) };
}
async function using(worker, run) {
  const server = createRunner({
    token,
    signingKey,
    catalog: { one: suite },
    worker,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const post = (body, credential = token) =>
    fetch(`http://127.0.0.1:${server.address().port}/grade`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credential}` },
      body: JSON.stringify(body),
    });
  try {
    await run(post);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test("HTTP accepts only authenticated scoped requests and signs exact SHA-bound results", async () => {
  let calls = 0;
  await using(
    async () => {
      calls++;
      return { passed: 1, failed: 0, checks: [{ passed: true }] };
    },
    async (post) => {
      assert.equal((await post(request(), "wrong")).status, 401);
      const invalid = { ...request(), headSha: "main" };
      assert.equal((await post(invalid)).status, 400);
      const body = request(),
        response = await post(body);
      assert.equal(response.status, 200);
      const { payload, signature } = await response.json();
      assert.equal(
        signature,
        createHmac("sha256", signingKey)
          .update(JSON.stringify(payload))
          .digest("hex"),
      );
      assert.equal(payload.requestHash, body.requestHash);
      assert.equal(payload.headSha, body.headSha);
      assert.equal(payload.score, 100); assert.ok(Number.isSafeInteger(payload.executionTimeMs)); assert.ok(payload.executionTimeMs >= 0);
      assert.deepEqual(payload.checks, [{ name: 'Check 1', passed: true, log: 'Acceptance behavior verified.' }]);
      assert.equal((await post(body)).status, 409);
      assert.equal(calls, 1);
    },
  );
});
test("execution errors and invalid totals return unavailable, never signed PASS", async () => {
  for (const worker of [
    async () => {
      throw Error("timeout");
    },
    async () => ({ passed: 100, failed: 0 }),
    async () => ({ passed: 1, failed: 0, checks: [{ passed: false }] }),
  ]) {
    await using(worker, async (post) => {
      const response = await post(request());
      assert.equal(response.status, 503);
      assert.equal((await response.json()).signature, undefined);
    });
  }
});
test("rejects parallel requests instead of queueing unbounded execution", async () => {
  let release, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  await using(
    async () => {
      entered();
      await new Promise((resolve) => {
        release = resolve;
      });
      return { passed: 1, failed: 0, checks: [{ passed: true }] };
    },
    async (post) => {
      const pending = post(request());
      await started;
      assert.equal((await post(request())).status, 503);
      release();
      assert.equal((await pending).status, 200);
    },
  );
});
