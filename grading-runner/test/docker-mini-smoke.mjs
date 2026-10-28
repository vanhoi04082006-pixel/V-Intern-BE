import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { runGrade, docker } from '../docker-worker.mjs';
import { sandboxArgs } from '../policy.mjs';

const fixtures = JSON.parse(await readFile(process.env.MINI_FIXTURES_FILE, 'utf8'));
const root = await realpath(process.env.TMPDIR), folder = await mkdtemp(path.join(root, 'mini-docker-'));
const runtimeImage = process.env.RUNTIME_IMAGE, testerImage = process.env.TESTER_IMAGE;
sandboxArgs('check', 'none', runtimeImage); sandboxArgs('check', 'none', testerImage);
const results = [];
try {
  for (const fixture of fixtures) {
    const directory = path.join(folder, fixture.slug); await mkdir(directory);
    for (const file of fixture.files) { const target = path.resolve(directory, file.path); assert.ok(target.startsWith(directory + path.sep)); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, file.content); }
    const original = fixture.files.find(file => file.path === 'src/model.cjs').content;
    for (const variant of [...fixture.variants, { name: 'starter', source: original, expected: 'fail' }]) {
      await writeFile(path.join(directory, 'src/model.cjs'), variant.source);
      const archive = path.join(folder, 'source.tar.gz');
      assert.equal(spawnSync('tar', ['-czf', archive, '-C', folder, fixture.slug]).status, 0);
      const result = await runGrade({}, { runtimeImage, testerImage, command: ['node', '/runner/launch.mjs', 'mini-module'], checks: fixture.checks }, docker, async () => readFile(archive));
      if (variant.expected === 'pass') { assert.equal(result.failed, 0, JSON.stringify({ project: fixture.slug, variant: variant.name, ...result })); assert.equal(result.passed, fixture.checks.length); }
      else { assert.ok(result.failed > 0); if (variant.killedBy) assert.ok(result.failedChecks.includes(variant.killedBy)); }
      const row = { project: fixture.slug, variant: variant.name, ...result }; results.push(row); console.log(JSON.stringify(row));
    }
  }
  await writeFile(process.env.MINI_REPORT_FILE, JSON.stringify({ checkedAt: new Date().toISOString(), runtimeImage, testerImage, results }, null, 2));
} finally {
  const resolved = await realpath(folder); assert.equal(path.dirname(resolved), root); assert.ok(path.basename(resolved).startsWith('mini-docker-'));
  await rm(resolved, { recursive: true, force: true });
}
