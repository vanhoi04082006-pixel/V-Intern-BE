import test from 'node:test';
import assert from 'node:assert/strict';
import { runMiniCheck } from '../images/tester/mini-check.mjs';
test('private expected output stays out of the submitted app request', async () => {
  const check = { operation: 'sum', args: [[2, 3]], expected: 5 };
  await runMiniCheck(check, path => 'http://127.0.0.1:3000' + path, async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { operation: 'sum', args: [[2, 3]] });
    return new Response(JSON.stringify({ value: 5, inputUnchanged: true }), { status: 200 });
  });
  await assert.rejects(() => runMiniCheck(check, path => path, async () => new Response(JSON.stringify({ value: 5, inputUnchanged: false }), { status: 200 })), /Input was mutated/);
  await assert.rejects(() => runMiniCheck(check, path => path, async () => new Response(JSON.stringify({ value: 99, inputUnchanged: true }), { status: 200 })));
});
