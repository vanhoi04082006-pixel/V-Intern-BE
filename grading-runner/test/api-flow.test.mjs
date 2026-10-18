import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runChecks } from '../images/tester/tester.mjs';

test('API flows carry captured IDs/tokens, reject mismatched data and keep variables local', async () => {
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : null;
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.url === '/login') return send(201, { token: 'session-token', id: 42 });
    if (req.url === '/items/42' && req.headers.authorization === 'Bearer session-token') return send(200, { title: body.title, ownerId: 42 });
    return send(401, {});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const report = await runChecks([
      { kind: 'api', steps: [
        { method: 'POST', path: '/login', status: 201, capture: { token: 'token', id: 'id' } },
        { method: 'POST', path: '/items/{{id}}', bearer: '{{token}}', body: { title: 'Actual {{nonce}}' }, status: 200, jsonIncludes: { title: 'Actual {{nonce}}', ownerId: '{{id}}' }, jsonAbsent: ['password'] },
      ] },
      { kind: 'api', steps: [{ path: '/items/{{id}}', status: 200 }] },
      { kind: 'api', steps: [{ path: 'https://example.com', status: 200 }] },
      { kind: 'api', steps: [{ path: '/login', status: 201, capture: { missing: 'notPresent' } }] },
      { kind: 'api', steps: [{ path: '/login', status: 201, jsonIncludes: { id: 100 } }] },
      { kind: 'api', steps: [{ path: '/login', status: 201, jsonAbsent: ['token'] }] },
    ], { base: `http://127.0.0.1:${server.address().port}` });
    assert.deepEqual(report.results.map(r => r.passed), [true, false, false, false, false, false]);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
