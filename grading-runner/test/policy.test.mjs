import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateRequest, digestSuite, sandboxArgs, validateCounts } from '../policy.mjs';

const suite = {
  templateCode: 'LEARN-NOTES-V1', repository: 'https://github.com/teacher/course',
  taskId: 'task-1', taskSpecHash: 'c'.repeat(64),
  runtimeImage: `vintern-runtime@sha256:${'d'.repeat(64)}`,
  testerImage: `vintern-tests@sha256:${'e'.repeat(64)}`,
  command: ['node', '/runner/launch.mjs'],
  checks: [{ name: 'app responds', kind: 'http', path: '/', status: 200 }],
};
function request(changes = {}) {
  const data = {
    repository: suite.repository, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40),
    templateCode: suite.templateCode, taskId: suite.taskId, taskSpecHash: suite.taskSpecHash,
    suiteId: 'notes', suiteDigest: digestSuite(suite), nonce: 'a-new-request-nonce', ...changes,
  };
  return { ...data, requestHash: createHash('sha256').update(JSON.stringify(data)).digest('hex') };
}
test('binds suite to exact repository, task, requirements and immutable commit', () => {
  assert.equal(validateRequest(request(), { notes: suite }), suite);
  for (const changed of [
    { repository: 'https://github.com/attacker/course' }, { taskId: 'task-2' },
    { taskSpecHash: 'f'.repeat(64) }, { headSha: 'main' }, { suiteDigest: '0'.repeat(64) },
    { templateCode: 'another' }, { nonce: '' },
  ]) assert.throws(() => validateRequest(request(changed), { notes: suite }));
  assert.throws(() => validateRequest({ ...request(), requestHash: '0'.repeat(64) }, { notes: suite }));
});
test('only uses pinned trusted images and bounded restricted containers', () => {
  const args = sandboxArgs('one', 'internal-network', suite.runtimeImage);
  for (const flag of ['--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=512m', '--cpus=1', '--pull=never'])
    assert.ok(args.includes(flag));
  assert.ok(args.includes('--user=10001:10001'));
  assert.ok(!args.some(x => x.includes('docker.sock') || x === '--privileged'));
  assert.throws(() => sandboxArgs('one', 'internal-network', 'node:latest'));
});
test('does not accept zero checks, extra counts or student-provided totals', () => {
  assert.deepEqual(validateCounts({ results: [{ passed: true }, { passed: false }] }, 2), { passed: 1, failed: 1 });
  for (const report of [{ passed: 20, failed: 0 }, { results: [] }, { results: [{ passed: 'true' }] }])
    assert.throws(() => validateCounts(report, 1));
});
