import { mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRunner } from "../server.mjs";
import { runGrade } from "../docker-worker.mjs";
import { hash, digestSuite } from "../policy.mjs";

// Test-only bridge: owned fixtures replace the archive download, while HTTP/auth/signing/
// Docker/app/browser execute normally. It never activates a suite in application data.
const directory = path.dirname(fileURLToPath(import.meta.url));
const temporaryRoot = await realpath(tmpdir());
const temporary = await mkdtemp(path.join(temporaryRoot, "vintern-bridge-"));
const token = randomBytes(32).toString("hex"),
  signingKey = randomBytes(32).toString("hex");
const checks = JSON.parse(
  await readFile(
    path.join(directory, "../suites/notes-foundation.json"),
    "utf8",
  ),
);
const catalog = {},
  backendSuites = {},
  archives = {};
const specHash = hash({ fixture: "synthetic acceptance only" });
const original = await readFile(
  path.join(directory, "fixtures/notes/index.html"),
  "utf8",
);
for (const variant of ["valid", "broken"]) {
  const suite = {
    templateCode: "FIXTURE-ONLY",
    repository: "https://github.com/synthetic-teacher/synthetic-course",
    taskId: `fixture-${variant}`,
    taskSpecHash: specHash,
    runtimeImage: process.env.RUNTIME_IMAGE,
    testerImage: process.env.TESTER_IMAGE,
    command: ["node", "/runner/launch.mjs"],
    checks,
  };
  catalog[variant] = suite;
  backendSuites[`FIXTURE-ONLY:${suite.taskId}`] = {
    id: variant,
    digest: digestSuite(suite),
  };
  await writeFile(
    path.join(temporary, "index.html"),
    variant === "broken"
      ? original.replace("const validate = true", "const validate = false")
      : original,
  );
  const archive = path.join(temporary, "fixture.tar.gz");
  if (
    spawnSync("tar", ["-czf", archive, "-C", temporary, "./index.html"])
      .status !== 0
  )
    throw Error("Fixture archive failed");
  archives[variant] = await readFile(archive);
}
let completed = 0;
const server = createRunner({
  token,
  signingKey,
  catalog,
  worker: async (request, suite) => {
    const result = await runGrade(
      request,
      suite,
      undefined,
      async () => archives[request.suiteId],
    );
    completed++;
    if (completed === 2) setTimeout(() => server.close(), 500);
    return result;
  },
});
const manifest = path.join(process.env.HOME, "http-bridge.json");
try {
  await new Promise((resolve) => server.listen(8091, "127.0.0.1", resolve));
  await writeFile(
    manifest,
    JSON.stringify({ token, signingKey, backendSuites, specHash }),
    { mode: 0o600 },
  );
  console.log("Synthetic Docker HTTP bridge listening on 127.0.0.1:8091");
  await new Promise((resolve) => server.once("close", resolve));
} finally {
  await rm(manifest, { force: true });
  const resolved = await realpath(temporary);
  if (
    path.dirname(resolved) !== temporaryRoot ||
    !path.basename(resolved).startsWith("vintern-bridge-")
  )
    throw Error("Unsafe fixture cleanup");
  await rm(resolved, { recursive: true, force: true });
}
