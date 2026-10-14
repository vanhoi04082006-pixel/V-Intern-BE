import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sandboxArgs, validateCounts } from './policy.mjs';

export function docker(args, { timeout = 85000, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', size = 0, timer;
    const stop = error => { child.kill('SIGKILL'); reject(error); };
    timer = setTimeout(() => stop(Error('Container deadline exceeded')), timeout);
    child.on('error', reject);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
      size += data.length;
      if (size > 64000) stop(Error('Container output exceeded limit'));
      else output += data.toString();
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(Error('Container execution failed'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function downloadArchive(request, fetcher = fetch) {
  const [, owner, repository] = new URL(request.repository).pathname.split('/');
  const response = await fetcher(`https://codeload.github.com/${owner}/${repository}/tar.gz/${request.headSha}`, {
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.body) throw Error('Commit archive unavailable');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) {
      await response.body.cancel().catch(() => {});
      throw Error('Source archive exceeds limit');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function runGrade(request, suite, execute = docker, archive = downloadArchive) {
  // Resolve once; only this freshly-created opaque archive directory is writable by the service.
  const root = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(root, 'vintern-grade-'));
  const suffix = randomUUID(), network = `vi-grade-${suffix}`, app = `vi-app-${suffix}`, tester = `vi-test-${suffix}`;
  let networkCreated = false;
  try {
    const source = path.join(directory, 'source.tar.gz');
    await writeFile(source, await archive(request), { mode: 0o444 });
    // Internal bridge permits app ↔ tester only; no published ports or outbound Internet.
    await execute(['network', 'create', '--internal', network], { timeout: 5000 });
    networkCreated = true;
    await execute([...sandboxArgs(app, network, suite.runtimeImage), '--detach', '--network-alias', 'student',
      '--mount', `type=bind,src=${source},dst=/submission/source.tar.gz,readonly`,
      suite.runtimeImage, ...suite.command], { timeout: 5000 });
    const output = await execute([...sandboxArgs(tester, network, suite.testerImage), '--interactive',
      suite.testerImage, 'node', '/runner/tester.mjs'], {
      input: JSON.stringify({ checks: suite.checks }), timeout: 85000,
    });
    return validateCounts(JSON.parse(output), suite.checks.length);
  } finally {
    // Fixed generated names only. Kill before removing files, including timeout/startup failure paths.
    try {
      if (networkCreated) {
        await execute(['rm', '--force', app, tester], { timeout: 5000 }).catch(() => {});
        // Network removal fails if containers remain attached. Do not sign a successful run in that case.
        await execute(['network', 'rm', network], { timeout: 5000 });
      }
    } finally {
      const resolved = await realpath(directory);
      if (path.dirname(resolved) !== root || !path.basename(resolved).startsWith('vintern-grade-'))
        throw Error('Unsafe cleanup path');
      await rm(resolved, { recursive: true, force: true });
    }
  }
}
