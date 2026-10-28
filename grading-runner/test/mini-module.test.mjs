import test from 'node:test';
import assert from 'node:assert/strict';
import { executeMiniRequest } from '../images/runtime/mini-module.mjs';

test('module adapter compares immutable input and never accepts executable strings or prototype methods', () => {
  const model = { sum: (values) => values.reduce((a, b) => a + b, 0), mutate: (values) => values.pop(), reject: () => { throw Error('secret stack'); } };
  assert.deepEqual(executeMiniRequest(model, { operation: 'sum', args: [[2, 3]] }), { status: 200, body: { value: 5, inputUnchanged: true } });
  assert.equal(executeMiniRequest(model, { operation: 'mutate', args: [[1, 2]] }).body.inputUnchanged, false);
  assert.deepEqual(executeMiniRequest(model, { operation: 'reject', args: [] }), { status: 422, body: { error: 'Input rejected', inputUnchanged: true } });
  assert.equal(executeMiniRequest(model, { operation: 'constructor', args: [] }).status, 400);
  assert.equal(executeMiniRequest(model, { operation: 'sum', args: 'process.exit()' }).status, 400);
  assert.equal(executeMiniRequest(model, { operation: 'sum', args: [], expected: 0 }).status, 400);
});
