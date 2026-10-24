import 'reflect-metadata';
import 'dotenv/config';
import dataSource from '../database/data-source';
import { MINI_PROJECT_LIBRARY } from '../templates/mini-project-catalog';
import { ensureMiniProjectLibrary } from '../templates/mini-project-seed';

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply') || args.length > 1) throw Error('Usage: seed:mini-projects [--apply]. Default is read-only preview.');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? 'localhost')) throw Error('Mini-project seed requires a local development database.');
  const db = await dataSource.initialize();
  try {
    if (!args.includes('--apply')) {
      const rows: Array<{ code: string }> = await db.query('SELECT code FROM project_templates');
      const existing = new Set(rows.map(row => row.code.toUpperCase()));
      process.stdout.write(JSON.stringify({ mode: 'preview', mutationsPerformed: 0, templates: MINI_PROJECT_LIBRARY.map(template => ({ code: template.code, action: existing.has(template.code!) ? 'preserve' : 'insert' })) }) + '\n');
      return;
    }
    const [admin]: Array<{ id: string }> = await db.query("SELECT TOP(1) u.id FROM users u JOIN user_roles ur ON ur.userId=u.id JOIN roles r ON r.id=ur.roleId WHERE r.code='admin' AND u.status='active' ORDER BY u.createdAt");
    if (!admin) throw Error('Active local Admin required; this command never creates users.');
    process.stdout.write(JSON.stringify({ mode: 'apply', ...await ensureMiniProjectLibrary(db, admin.id) }) + '\n');
  } finally { await db.destroy(); }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Mini-project seed failed.'); process.exitCode = 1; });
