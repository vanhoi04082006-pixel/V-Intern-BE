import { spawn } from "node:child_process";
import { chmod, mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sandboxArgs, validateCounts } from "./policy.mjs";

export function docker(args, { timeout = 85000, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "",
      size = 0,
      timer;
    const stop = (error) => {
      child.kill("SIGKILL");
      reject(error);
    };
    timer = setTimeout(
      () => stop(Error("Container deadline exceeded")),
      timeout,
    );
    child.on("error", reject);
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (data) => {
        size += data.length;
        if (size > 64000) stop(Error("Container output exceeded limit"));
        else output += data.toString();
      });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(Error("Container execution failed"));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export async function downloadArchive(request, fetcher = fetch) {
  const [, owner, repository] = new URL(request.repository).pathname.split("/");
  const response = await fetcher(
    `https://codeload.github.com/${owner}/${repository}/tar.gz/${request.headSha}`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok || !response.body) throw Error("Commit archive unavailable");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) {
      await response.body.cancel().catch(() => {});
      throw Error("Source archive exceeds limit");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function runGrade(
  request,
  suite,
  execute = docker,
  archive = downloadArchive,
) {
  // Resolve once; only this freshly-created opaque archive directory is writable by the service.
  const root = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(root, "vintern-grade-"));
  const suffix = randomUUID(),
    app = `vi-app-${suffix}`,
    tester = `vi-test-${suffix}`;
  let executionStarted = false;
  try {
    const source = path.join(directory, "source.tar.gz");
    await writeFile(source, await archive(request), { mode: 0o444 });
    // systemd UMask=0077 masks create-mode bits; the different sandbox UID
    // must still read this public archive through its read-only bind mount.
    await chmod(source, 0o444);
    // A loopback-only namespace has no bridge, host gateway or outbound route.
    executionStarted = true;
    await execute(
      [
        ...sandboxArgs(app, "none", suite.runtimeImage),
        "--detach",
        "--mount",
        `type=bind,src=${source},dst=/submission/source.tar.gz,readonly`,
        suite.runtimeImage,
        ...suite.command,
      ],
      { timeout: 5000 },
    );
    const output = await execute(
      [
        ...sandboxArgs(tester, `container:${app}`, suite.testerImage),
        "--interactive",
        suite.testerImage,
        "node",
        "/runner/tester.mjs",
      ],
      {
        input: JSON.stringify({ checks: suite.checks }),
        timeout: 85000,
      },
    );
    const report = JSON.parse(output);
    return {
      ...validateCounts(report, suite.checks.length),
      checks: report.results.map((r, i) => ({ name: String(suite.checks[i].name ?? `Check ${i + 1}`).slice(0, 120), passed: r.passed })),
      failedChecks: report.results.flatMap((r, i) =>
        r.passed
          ? []
          : [String(suite.checks[i].name ?? `Check ${i + 1}`).slice(0, 120)],
      ),
    };
  } finally {
    // Fixed generated names only. Kill before removing files, including timeout/startup failure paths.
    try {
      if (executionStarted) {
        await execute(["rm", "--force", tester, app], { timeout: 5000 }).catch(
          () => {},
        );
        const remaining = await execute(
          [
            "ps",
            "--all",
            "--quiet",
            "--filter",
            `name=^/(vi-app-${suffix}|vi-test-${suffix})$`,
          ],
          { timeout: 5000 },
        );
        if (remaining) throw Error("Container cleanup failed");
      }
    } finally {
      const resolved = await realpath(directory);
      if (
        path.dirname(resolved) !== root ||
        !path.basename(resolved).startsWith("vintern-grade-")
      )
        throw Error("Unsafe cleanup path");
      await rm(resolved, { recursive: true, force: true });
    }
  }
}
