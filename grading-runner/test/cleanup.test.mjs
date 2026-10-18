import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanupContainers } from "../cleanup-workers.mjs";

test("service restart reaps only explicitly labelled container IDs", async () => {
  const calls = [];
  let removed = false;
  await cleanupContainers(async (args) => {
    calls.push(args);
    if (args[0] === "rm") {
      removed = true;
      return "";
    }
    return removed ? "" : "a".repeat(64);
  });
  assert.ok(calls[0].includes("label=io.vintern.grading=true"));
  assert.deepEqual(
    calls.find((args) => args[0] === "rm"),
    ["rm", "--force", "a".repeat(64)],
  );
});
test("rejects malformed daemon inventories and failed orphan cleanup", async () => {
  await assert.rejects(
    cleanupContainers(async () => "untrusted;identifier"),
    /Invalid owned/,
  );
  await assert.rejects(
    cleanupContainers(async (args) => (args[0] === "ps" ? "b".repeat(64) : "")),
    /remain after cleanup/,
  );
});
