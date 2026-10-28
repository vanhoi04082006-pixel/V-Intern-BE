import assert from 'node:assert/strict';

/** Only operation/args cross to the untrusted app; expected output remains in this container. */
export async function runMiniCheck(check, target, fetcher = fetch) {
  const response = await fetcher(target('/execute'), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: check.operation, args: check.args }),
  });
  try {
    assert.equal(response.status, check.error ? 422 : 200);
    let text = '';
    for await (const bytes of response.body) { text += Buffer.from(bytes).toString('utf8'); if (Buffer.byteLength(text) > 64000) throw Error('Module response too large'); }
    const result = JSON.parse(text); assert.equal(result.inputUnchanged, true, 'Input was mutated');
    if (check.error) assert.equal(result.error, 'Input rejected'); else assert.deepEqual(result.value, check.expected);
  } finally { await response.body?.cancel().catch(() => {}); }
}
