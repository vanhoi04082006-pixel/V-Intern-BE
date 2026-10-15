import { createHash, timingSafeEqual } from "node:crypto";

export const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const digestSuite = hash;
export function equalSecret(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function validateRequest(body, catalog) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw Error("Invalid request");
  const { requestHash, ...data } = body;
  if (!equalSecret(hash(data), requestHash))
    throw Error("Invalid request hash");
  if (
    !/^[a-f0-9]{40}$/.test(body.headSha) ||
    !/^[a-f0-9]{40}$/.test(body.baseSha) ||
    typeof body.nonce !== "string" ||
    body.nonce.length < 16 ||
    body.nonce.length > 100 ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
      body.repository,
    )
  )
    throw Error("Invalid immutable source");
  const suite = Object.hasOwn(catalog, body.suiteId)
    ? catalog[body.suiteId]
    : null;
  if (
    !suite ||
    digestSuite(suite) !== body.suiteDigest ||
    ["templateCode", "repository", "taskId", "taskSpecHash"].some(
      (key) => !suite[key] || suite[key] !== body[key],
    )
  )
    throw Error("Suite scope mismatch");
  if (
    !Array.isArray(suite.command) ||
    !suite.command.length ||
    suite.command.some((s) => typeof s !== "string") ||
    !Array.isArray(suite.checks) ||
    !suite.checks.length ||
    suite.checks.length > 50
  )
    throw Error("Invalid trusted suite");
  return suite;
}
export function sandboxArgs(name, network, image) {
  if (!/^(?:[a-zA-Z0-9./:_-]+@)?sha256:[a-f0-9]{64}$/.test(image))
    throw Error("Image must be digest pinned");
  return [
    "run",
    "--name",
    name,
    "--pull=never",
    "--network",
    network,
    "--read-only",
    "--label=io.vintern.grading=true",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--user=10001:10001",
    "--pids-limit=128",
    "--memory=512m",
    "--memory-swap=512m",
    "--cpus=1",
    "--ulimit",
    "nofile=1024:1024",
    "--log-driver=none",
    "--shm-size=128m",
    "--tmpfs",
    "/work:rw,nosuid,nodev,size=268435456,uid=10001,gid=10001",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=67108864,uid=10001,gid=10001",
  ];
}
export function validateCounts(report, expected) {
  if (
    !Number.isSafeInteger(expected) ||
    expected < 1 ||
    !Array.isArray(report?.results) ||
    report.results.length !== expected ||
    report.results.some((r) => typeof r.passed !== "boolean")
  )
    throw Error("Incomplete trusted report");
  const passed = report.results.filter((r) => r.passed).length;
  return { passed, failed: expected - passed };
}
