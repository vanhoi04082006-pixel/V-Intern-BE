import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { docker, runGrade } from "../docker-worker.mjs";
import { sandboxArgs } from "../policy.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const runtimeImage = process.env.RUNTIME_IMAGE,
  testerImage = process.env.TESTER_IMAGE;
sandboxArgs("check", "check", runtimeImage);
sandboxArgs("check", "check", testerImage);
assert.equal(await docker(["info", "--format", "{{.OSType}}"]), "linux");
const checks = JSON.parse(
  await readFile(
    path.join(directory, "../suites/notes-foundation.json"),
    "utf8",
  ),
);
const suite = {
  runtimeImage,
  testerImage,
  command: ["node", "/runner/launch.mjs"],
  checks,
};
const root = await realpath(tmpdir()),
  temporary = await mkdtemp(path.join(root, "vintern-smoke-"));
try {
  const original = await readFile(
    path.join(directory, "fixtures/notes/index.html"),
    "utf8",
  );
  for (const broken of [false, true]) {
    await writeFile(
      path.join(temporary, "index.html"),
      broken
        ? original.replace("const validate = true", "const validate = false")
        : original,
    );
    const archivePath = path.join(temporary, "fixture.tar.gz");
    const archive = spawnSync("tar", [
      "-czf",
      archivePath,
      "-C",
      temporary,
      "./index.html",
    ]);
    assert.equal(archive.status, 0);
    const bytes = await readFile(archivePath);
    const result = await runGrade({}, suite, docker, async () => bytes);
    if (!broken)
      assert.equal(result.passed, checks.length, JSON.stringify(result));
    else
      assert.ok(result.failed > 0, "Broken empty-title validation must fail");
    console.log(
      JSON.stringify({ fixture: broken ? "broken" : "valid", ...result }),
    );
  }
  const apiOriginal = await readFile(path.join(directory, 'fixtures/tasks-api/server.mjs'), 'utf8');
  const apiSuite = { ...suite, command: ['node', '/runner/launch.mjs', 'node-http', 'server.mjs'],
    checks: JSON.parse(await readFile(path.join(directory, '../suites/tasks-api.json'), 'utf8')) };
  for (const variant of ['valid', 'broken-validation', 'broken-ownership']) {
    const source = variant === 'broken-validation' ? apiOriginal.replace('const enforceValidation = true', 'const enforceValidation = false')
      : variant === 'broken-ownership' ? apiOriginal.replace('const enforceOwnership = true', 'const enforceOwnership = false') : apiOriginal;
    await writeFile(path.join(temporary, 'server.mjs'), source);
    const archivePath = path.join(temporary, 'api-fixture.tar.gz');
    assert.equal(spawnSync('tar', ['-czf', archivePath, '-C', temporary, './server.mjs']).status, 0);
    const result = await runGrade({}, apiSuite, docker, async () => readFile(archivePath));
    assert.equal(result.passed, variant === 'valid' ? 4 : 3, JSON.stringify(result));
    assert.equal(result.failed, variant === 'valid' ? 0 : 1, JSON.stringify(result));
    console.log(JSON.stringify({ fixture: `tasks-api-${variant}`, ...result }));
  }
} finally {
  const resolved = await realpath(temporary);
  if (
    path.dirname(resolved) !== root ||
    !path.basename(resolved).startsWith("vintern-smoke-")
  )
    throw Error("Unsafe cleanup");
  await rm(resolved, { recursive: true, force: true });
}
