import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGrade, downloadArchive } from '../docker-worker.mjs';

const suite = { runtimeImage: `app@sha256:${'a'.repeat(64)}`, testerImage: `tester@sha256:${'b'.repeat(64)}`,
  command: ['node', '/runner/launch.mjs'], checks: [{ kind: 'http' }, { kind: 'browser' }] };
test('student and tests use separate restricted containers; no credentials or tests reach student', async () => {
  const calls = [];
  const report = await runGrade({}, suite, async (args, options) => {
    calls.push({ args, options });
    return args.includes('--interactive') ? JSON.stringify({ results: [{ passed: true }, { passed: false }] }) : '';
  }, async () => Buffer.from('opaque archive'));
  assert.deepEqual(report, { passed: 1, failed: 1 });
  assert.deepEqual(calls[0].args.slice(0, 3), ['network', 'create', '--internal']);
  const student = calls.find(c => c.args.includes('--detach'));
  const tester = calls.find(c => c.args.includes('--interactive'));
  assert.ok(!student.options.input);
  assert.ok(!tester.args.includes('--mount'));
  assert.equal(JSON.parse(tester.options.input).checks.length, 2);
  assert.ok(calls.some(c => c.args[0] === 'rm' && c.args.includes('--force')));
  assert.ok(calls.some(c => c.args[0] === 'network' && c.args[1] === 'rm'));
});
test('timeout still removes both containers and network, does not return pass', async () => {
  const calls = [];
  await assert.rejects(runGrade({}, suite, async args => {
    calls.push(args);
    if (args.includes('--interactive')) throw Error('timeout');
    return '';
  }, async () => Buffer.from('archive')), /timeout/);
  assert.ok(calls.some(c => c[0] === 'rm'));
  assert.ok(calls.some(c => c[0] === 'network' && c[1] === 'rm'));
});
test('downloads only fixed GitHub codeload commit URL without redirects', async () => {
  await downloadArchive({ repository: 'https://github.com/teacher/class', headSha: 'a'.repeat(40) }, async (url, options) => {
    assert.equal(url, `https://codeload.github.com/teacher/class/tar.gz/${'a'.repeat(40)}`);
    assert.equal(options.redirect, 'error');
    return new Response('archive');
  });
});
