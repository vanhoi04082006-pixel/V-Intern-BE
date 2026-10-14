import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import { equalSecret, validateRequest } from "./policy.mjs";
import { docker, runGrade } from "./docker-worker.mjs";

export function createRunner({
  token,
  signingKey,
  catalog,
  worker = runGrade,
}) {
  if (
    typeof token !== "string" ||
    token.length < 32 ||
    typeof signingKey !== "string" ||
    signingKey.length < 32
  )
    throw Error(
      "Use distinct random runner credentials with at least 32 characters",
    );
  if (token === signingKey) throw Error("Runner credentials must be distinct");
  let busy = false;
  const nonces = new Map();
  return createServer(
    { requestTimeout: 10000, headersTimeout: 5000, maxHeaderSize: 8192 },
    async (req, res) => {
      const send = (code, data) => {
        res.writeHead(code, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(data));
      };
      if (req.method !== "POST" || req.url !== "/grade")
        return send(404, { error: "Not found" });
      if (!equalSecret(req.headers.authorization, `Bearer ${token}`))
        return send(401, { error: "Unauthorized" });
      if (busy) return send(503, { error: "Worker busy; retry later" });
      let body;
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 16000) {
            send(413, { error: "Request too large" });
            req.destroy();
            return;
          }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const suite = validateRequest(body, catalog);
        for (const [nonce, timestamp] of nonces)
          if (timestamp < Date.now() - 600000) nonces.delete(nonce);
        if (nonces.has(body.nonce))
          return send(409, { error: "Duplicate request" });
        // No async gap between reserving the only slot and starting the worker.
        if (busy || nonces.size >= 10000)
          return send(503, { error: "Worker busy; retry later" });
        nonces.set(body.nonce, Date.now());
        busy = true;
        try {
          const counts = await worker(body, suite);
          if (
            !Number.isSafeInteger(counts.passed) ||
            !Number.isSafeInteger(counts.failed) ||
            counts.passed < 0 ||
            counts.failed < 0 ||
            counts.passed + counts.failed !== suite.checks.length
          )
            throw Error("Invalid worker result");
          const payload = {
            status: "completed",
            requestHash: body.requestHash,
            headSha: body.headSha,
            suiteId: body.suiteId,
            suiteDigest: body.suiteDigest,
            passed: counts.passed,
            failed: counts.failed,
            summary: (
              `${counts.passed}/${suite.checks.length} trusted acceptance checks passed; ${counts.failed} failed.` +
              (counts.failedChecks?.length
                ? ` Failed: ${counts.failedChecks.join("; ")}.`
                : "")
            ).slice(0, 4000),
          };
          const signature = createHmac("sha256", signingKey)
            .update(JSON.stringify(payload))
            .digest("hex");
          send(200, { payload, signature });
        } catch {
          send(503, { error: "Isolated execution unavailable or incomplete" });
        } finally {
          busy = false;
        }
      } catch {
        send(400, { error: "Invalid request or suite scope" });
      }
    },
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const info = await docker(["info", "--format", "{{.OSType}}"], {
    timeout: 5000,
  });
  if (info !== "linux")
    throw Error("A separate Linux Docker worker is required");
  const catalog = JSON.parse(
    await readFile(process.env.RUNNER_CATALOG_PATH, "utf8"),
  );
  const server = createRunner({
    token: process.env.GRADING_RUNNER_TOKEN,
    signingKey: process.env.GRADING_RUNNER_SIGNING_KEY,
    catalog,
  });
  server.listen(
    Number(process.env.PORT ?? 8090),
    process.env.HOST ?? "127.0.0.1",
  );
}
