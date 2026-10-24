import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { realpath, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function executeMiniRequest(model, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).some(key => !['operation', 'args'].includes(key))
    || typeof payload.operation !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(payload.operation)
    || ['constructor', 'prototype', '__proto__'].includes(payload.operation)
    || !Array.isArray(payload.args) || payload.args.length > 8
    || !Object.hasOwn(model, payload.operation) || typeof model[payload.operation] !== 'function') return { status: 400, body: { error: 'Invalid call' } };
  const args = structuredClone(payload.args), before = JSON.stringify(args);
  try {
    const value = model[payload.operation](...args);
    if (value && typeof value.then === 'function') return { status: 400, body: { error: 'Synchronous contract required' } };
    return { status: 200, body: { value, inputUnchanged: JSON.stringify(args) === before } };
  } catch { return { status: 422, body: { error: 'Input rejected', inputUnchanged: JSON.stringify(args) === before } }; }
}
async function main() {
  const file = await realpath('/work/src/model.cjs');
  if (!file.startsWith('/work/') || !(await stat(file)).isFile()) throw Error('Invalid model entry');
  // This import runs exclusively inside the unprivileged submission container.
  const model = createRequire(import.meta.url)(file);
  createServer(async (request, response) => {
    const send = (status, body) => { const text = JSON.stringify(body); if (text.length > 64000) { response.writeHead(500); response.end(); } else { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(text); } };
    if (request.method === 'GET' && request.url === '/') { send(200, { ready: true }); return; }
    if (request.method !== 'POST' || request.url !== '/execute') { send(404, { error: 'Not found' }); return; }
    try {
      let text = '';
      for await (const bytes of request) { text += bytes; if (Buffer.byteLength(text) > 32768) { send(413, { error: 'Input too large' }); return; } }
      const result = executeMiniRequest(model, JSON.parse(text)); send(result.status, result.body);
    } catch { send(400, { error: 'Invalid input' }); }
  }).listen(3000, '127.0.0.1');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
