import 'reflect-metadata';
import 'dotenv/config';
import dataSource from '../database/data-source';
import { ensureMiniProjectLibrary } from '../templates/mini-project-seed';
import { ensureMiniProjectAssessments } from '../templates/mini-project-assessment-seed';
async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--apply') || process.argv.length > 3) throw Error('Use --apply after reviewing the bundled material.');
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST ?? 'localhost')) throw Error('Local database required.');
  const db = await dataSource.initialize();
  try {
    if (!process.argv.includes('--apply')) { process.stdout.write(JSON.stringify({ mode: 'preview', changes: 'Only untouched active MINI v1 may become v2 with private teaching references.', mutationsPerformed: 0 }) + '\n'); return; }
    const [admin]: Array<{ id: string }> = await db.query("SELECT TOP(1) u.id FROM users u JOIN user_roles ur ON ur.userId=u.id JOIN roles r ON r.id=ur.roleId WHERE r.code='admin' AND u.status='active' ORDER BY u.createdAt");
    if (!admin) throw Error('Active Admin required.');
    process.stdout.write(JSON.stringify({ templates: await ensureMiniProjectLibrary(db, admin.id), assessments: await ensureMiniProjectAssessments(db, admin.id) }) + '\n');
  } finally { await db.destroy(); }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Seed failed.'); process.exitCode = 1; });
