import { test } from "node:test";
import assert from "node:assert/strict";
import { runGrade, downloadArchive } from "../docker-worker.mjs";

const suite = {
  runtimeImage: `app@sha256:${"a".repeat(64)}`,
  testerImage: `tester@sha256:${"b".repeat(64)}`,
  command: ["node", "/runner/launch.mjs"],
  checks: [{ kind: "http" }, { kind: "browser" }],
};
test("student and tests use separate restricted containers; no credentials or tests reach student", async () => {
  const calls = [];
  const report = await runGrade(
    {},
    suite,
    async (args, options) => {
      calls.push({ args, options });
      return args.includes("--interactive")
        ? JSON.stringify({ results: [{ passed: true }, { passed: false }] })
        : "";
    },
    async () => Buffer.from("opaque archive"),
  );
  assert.deepEqual(report, { passed: 1, failed: 1, failedChecks: ["Check 2"], checks: [{ name: 'Check 1', passed: true }, { name: 'Check 2', passed: false }] });
  const student = calls.find((c) => c.args.includes("--detach"));
  const tester = calls.find((c) => c.args.includes("--interactive"));
  assert.equal(student.args[student.args.indexOf("--network") + 1], "none");
  assert.equal(
    tester.args[tester.args.indexOf("--network") + 1],
    `container:${student.args[student.args.indexOf("--name") + 1]}`,
  );
  assert.ok(!student.options.input);
  assert.ok(!tester.args.includes("--mount"));
  assert.equal(JSON.parse(tester.options.input).checks.length, 2);
  assert.ok(
    calls.some((c) => c.args[0] === "rm" && c.args.includes("--force")),
  );
  assert.ok(!calls.some((c) => c.args[0] === "network"));
});
test("timeout still removes both containers, does not return pass", async () => {
  const calls = [];
  await assert.rejects(
    runGrade(
      {},
      suite,
      async (args) => {
        calls.push(args);
        if (args.includes("--interactive")) throw Error("timeout");
        return "";
      },
      async () => Buffer.from("archive"),
    ),
    /timeout/,
  );
  assert.ok(calls.some((c) => c[0] === "rm"));
  assert.ok(calls.some((c) => c[0] === "ps"));
});
test("downloads only fixed GitHub codeload commit URL without redirects", async () => {
  await downloadArchive(
    { repository: "https://github.com/teacher/class", headSha: "a".repeat(40) },
    async (url, options) => {
      assert.equal(
        url,
        `https://codeload.github.com/teacher/class/tar.gz/${"a".repeat(40)}`,
      );
      assert.equal(options.redirect, "error");
      return new Response("archive");
    },
  );
});

test("rejects oversized archives instead of extracting on the host", async () => {
  await assert.rejects(
    downloadArchive(
      {
        repository: "https://github.com/teacher/class",
        headSha: "a".repeat(40),
      },
      async () => new Response(new Uint8Array(20 * 1024 * 1024 + 1)),
    ),
    /exceeds limit/,
  );
});

test("cleanup failure cannot produce a successful signed result", async () => {
  await assert.rejects(
    runGrade(
      {},
      suite,
      async (args) => {
        if (args[0] === "ps") return "orphaned-container-id";
        return args.includes("--interactive")
          ? JSON.stringify({ results: [{ passed: true }, { passed: true }] })
          : "";
      },
      async () => Buffer.from("archive"),
    ),
    /cleanup failed/,
  );
});
