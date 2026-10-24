import { randomUUID, createHash } from 'crypto';
import { DataSource } from 'typeorm';
import source from '../src/database/data-source';
import { CreateTemplateMaterials1763068800000 } from '../src/database/migrations/1763068800000-CreateTemplateMaterials';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { LEGACY_LEARNING_LIBRARY } from '../src/templates/learning-library';
import { User } from '../src/users/entities/user.entity';
import { Project } from '../src/projects/entities/project.entity';
import { InternshipSession } from '../src/sessions/entities/internship-session.entity';
let db: DataSource, before: unknown, emptyRoundTrip = false;
const actor = randomUUID(), template = randomUUID(), project = randomUUID(), session = randomUUID(), run = randomUUID();
const json = JSON.stringify(LEGACY_LEARNING_LIBRARY[0]), snapshot = JSON.stringify({ ...LEGACY_LEARNING_LIBRARY[0], name: 'Run cũ trước khi sửa mẫu' });
const counts = () => db.query('SELECT (SELECT COUNT(*) FROM project_templates) templates,(SELECT COUNT(*) FROM template_runs) runs,(SELECT COUNT(*) FROM users) users');
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '', migrations = source.options.migrations;
  if (!/^VIntern_E2E_CI_\d+_\d+$/.test(database) || source.options.type !== 'mssql' || !Array.isArray(migrations)) throw Error('Fresh dedicated migration database required.');
  const index = migrations.indexOf(CreateTemplateMaterials1763068800000); if (index < 0) throw Error('Migration not registered.');
  db = new DataSource({ ...source.options, database, migrations: migrations.slice(0, index) }); await db.initialize(); await db.runMigrations({ transaction: 'all' });
  if ((await db.query("SELECT OBJECT_ID('project_template_revisions','U') id"))[0].id !== null) throw Error('Use a fresh database, never reset.');
  await ensureRbac(db);
  const runner = db.createQueryRunner(); await runner.connect();
  try { const migration = new CreateTemplateMaterials1763068800000(); await migration.up(runner); await migration.down(runner); emptyRoundTrip = true; }
  finally { await runner.release(); }
  for (const code of ['templates.assessment.read', 'templates.assessment.manage']) {
    await db.query('DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permissionId WHERE p.code=@0', [code]);
    await db.query('DELETE FROM permissions WHERE code=@0', [code]);
  }
  await db.getRepository(User).insert({ id: actor, email: `${actor}@migration.test`, username: actor, displayName: 'Migration verification', passwordHash: 'not-a-login-hash', status: 'active' });
  await db.query("INSERT INTO project_templates(id,code,name,difficulty,definitionJson,version,createdById) VALUES(@0,'P01-LEGACY',N'Mẫu cũ','beginner',@1,3,@2)", [template, json, actor]);
  await db.getRepository(Project).insert({ id: project, code: 'P01-MIG-P', name: 'Old project', description: 'Historical project kept through the migration.', difficulty: 'beginner', status: 'active', mentorId: actor });
  await db.getRepository(InternshipSession).insert({ id: session, code: 'P01-MIG-S', name: 'Old session', status: 'upcoming', leadInstructorId: actor, startDate: new Date('2027-02-01'), endDate: new Date('2027-02-10') });
  await db.query('INSERT INTO template_runs(id,templateId,projectId,sessionId,templateVersion,snapshotJson) VALUES(@0,@1,@2,@3,2,@4)', [run, template, project, session, snapshot]);
  before = await counts(); await db.destroy();
  db = new DataSource({ ...source.options, database, migrations: migrations.slice(0, index + 1) }); await db.initialize(); await db.runMigrations({ transaction: 'all' });
}, 120000);
afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
it('round-trips an empty schema and backfills only the actual current revision without changing historical runs', async () => {
  expect(emptyRoundTrip).toBe(true); expect(await counts()).toEqual(before);
  const [row] = await db.query('SELECT * FROM project_template_revisions WHERE templateId=@0', [template]);
  expect(row.version).toBe(3); expect(row.definitionJson).toBe(json); expect(row.sha256).toBe(createHash('sha256').update(json, 'utf8').digest('hex'));
  expect(await db.query('SELECT * FROM project_template_revisions WHERE templateId=@0 AND version=2', [template])).toHaveLength(0);
  expect((await db.query('SELECT snapshotJson,templateVersion FROM template_runs WHERE id=@0', [run]))[0]).toMatchObject({ snapshotJson: snapshot, templateVersion: 2 });
  expect((await db.query('SELECT COUNT(*) count FROM project_template_assessments'))[0].count).toBe(0);
});
it('grants explicit staff permissions and none to the intern role, with idempotent migration history', async () => {
  for (const code of ['templates.assessment.read', 'templates.assessment.manage']) {
    const grants = await db.query('SELECT r.code FROM role_permissions rp JOIN roles r ON r.id=rp.roleId JOIN permissions p ON p.id=rp.permissionId WHERE p.code=@0 ORDER BY r.code', [code]);
    expect(grants.map((row: { code: string }) => row.code)).toEqual(['admin', 'instructor']);
  }
  expect(await db.runMigrations({ transaction: 'all' })).toEqual([]);
});
it('enforces revision keys, referential integrity and immutable content', async () => {
  await expect(db.query('INSERT INTO project_template_assessments(templateId,version,assessmentJson,sha256) VALUES(@0,99,@1,@2)', [template, '{}', 'a'.repeat(64)])).rejects.toThrow();
  await expect(db.query("UPDATE project_template_revisions SET definitionJson=N'{}' WHERE templateId=@0", [template])).rejects.toThrow(/immutable/);
  await expect(db.query('DELETE FROM project_template_revisions WHERE templateId=@0', [template])).rejects.toThrow(/immutable/);
});
it('refuses destructive rollback once a revision must be preserved', async () => {
  const runner = db.createQueryRunner(); await runner.connect();
  try { await expect(new CreateTemplateMaterials1763068800000().down(runner)).rejects.toThrow(/Preserve/); } finally { await runner.release(); }
  expect(await counts()).toEqual(before);
  expect((await db.query('SELECT COUNT(*) count FROM project_template_revisions WHERE templateId=@0', [template]))[0].count).toBe(1);
});
