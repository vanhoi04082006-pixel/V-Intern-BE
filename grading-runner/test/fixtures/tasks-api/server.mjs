// Owned acceptance fixture. It never becomes student source or a production service.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
const enforceOwnership = true;
const enforceValidation = true;
const users = new Map(), tokens = new Map(), tasks = new Map();
createServer(async (req, res) => {
  function send(status, value) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(value === undefined ? undefined : JSON.stringify(value)); }
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    if (req.url === '/api/register' && req.method === 'POST') {
      if (typeof body.email !== 'string' || !body.email.includes('@') || typeof body.password !== 'string' || body.password.length < 8) return send(422, {});
      if (users.has(body.email)) return send(409, {});
      const id = randomUUID(), token = randomUUID(); users.set(body.email, id); tokens.set(token, id); return send(201, { id, token });
    }
    const userId = tokens.get(req.headers.authorization?.replace(/^Bearer /, ''));
    if (!userId) return send(401, {});
    if (req.url === '/api/tasks') {
      if (req.method === 'GET') { const items = [...tasks.values()].filter(t => t.ownerId === userId); return send(200, { items, total: items.length }); }
      if (req.method === 'POST') {
        if (enforceValidation && (typeof body.title !== 'string' || !body.title.trim())) return send(422, {});
        const task = { id: randomUUID(), title: body.title, done: false, ownerId: userId }; tasks.set(task.id, task); return send(201, task);
      }
    }
    const id = req.url.match(/^\/api\/tasks\/([A-Za-z0-9-]+)$/)?.[1], task = tasks.get(id);
    if (!task || enforceOwnership && task.ownerId !== userId) return send(404, {});
    if (req.method === 'PATCH') { if (typeof body.done !== 'boolean') return send(422, {}); task.done = body.done; return send(200, task); }
    if (req.method === 'DELETE') { tasks.delete(id); return send(204); }
    if (req.method === 'GET') return send(200, task);
    return send(405, {});
  } catch { send(400, {}); }
}).listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
