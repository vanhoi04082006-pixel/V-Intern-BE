import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { runChecks } from "../images/tester/tester.mjs";

test("trusted HTTP checks distinguish valid response, incorrect data/status and external URL", async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ title: "Real server data", total: 1 }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const report = await runChecks(
      [
        { kind: "http", path: "/", status: 200, jsonIncludes: { total: 1 } },
        { kind: "http", path: "/", status: 201 },
        { kind: "http", path: "/", status: 200, jsonIncludes: { total: 100 } },
        { kind: "http", path: "https://example.com/", status: 200 },
      ],
      { base: `http://127.0.0.1:${server.address().port}` },
    );
    assert.deepEqual(report.results, [
      { passed: true },
      { passed: false },
      { passed: false },
      { passed: false },
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
