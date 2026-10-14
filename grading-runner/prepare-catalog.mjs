import { readFile } from "node:fs/promises";
import path from "node:path";
import { hash, digestSuite, validateRequest, sandboxArgs } from "./policy.mjs";

// Input is a trusted instructor/operator plan, never supplied by the student or an AI response.
const file = path.resolve(process.argv[2]);
const entries = JSON.parse(await readFile(file, "utf8"));
const catalog = {},
  backendSuites = {};
for (const entry of entries) {
  const spec = JSON.parse(
    await readFile(path.resolve(path.dirname(file), entry.specFile), "utf8"),
  );
  const checks = JSON.parse(
    await readFile(path.resolve(path.dirname(file), entry.checksFile), "utf8"),
  );
  const suite = {
    templateCode: entry.templateCode,
    repository: entry.repository,
    taskId: entry.taskId.toLowerCase(),
    taskSpecHash: hash(spec),
    runtimeImage: entry.runtimeImage,
    testerImage: entry.testerImage,
    command: entry.command,
    checks,
  };
  sandboxArgs("validation", "internal", suite.runtimeImage);
  sandboxArgs("validation", "internal", suite.testerImage);
  if (
    Object.hasOwn(catalog, entry.id) ||
    Object.hasOwn(backendSuites, `${entry.templateCode}:${suite.taskId}`)
  )
    throw Error("Duplicate suite or task");
  catalog[entry.id] = suite;
  backendSuites[`${entry.templateCode}:${suite.taskId}`] = {
    id: entry.id,
    digest: digestSuite(suite),
  };
  const data = {
    repository: suite.repository,
    templateCode: suite.templateCode,
    taskId: suite.taskId,
    taskSpecHash: suite.taskSpecHash,
    headSha: "a".repeat(40),
    baseSha: "b".repeat(40),
    suiteId: entry.id,
    suiteDigest: digestSuite(suite),
    nonce: "configuration-validation",
  };
  validateRequest({ ...data, requestHash: hash(data) }, catalog);
}
process.stdout.write(JSON.stringify({ catalog, backendSuites }, null, 2));
