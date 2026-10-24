import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import source from '../src/database/data-source';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { ensureLearningLibrary } from '../src/templates/learning-library-seed';
import { MINI_PROJECT_LIBRARY } from '../src/templates/mini-project-catalog';
import { ensureMiniProjectLibrary } from '../src/templates/mini-project-seed';
import { MINI_PROJECT_KNOWLEDGE } from '../src/knowledge/mini-project-knowledge';

let db: DataSource, app: INestApplication, actor: string, token: string, adminToken: string;
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_CI_\d+_\d+$/.test(database) || source.options.type !== 'mssql') throw Error('Fresh disposable SQL database required.');
  db = new DataSource({ ...source.options, database }); await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db);
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DataSource).useValue(db).compile();
  app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  for (const code of ['admin', 'instructor']) {
    const id = randomUUID(), role = await db.getRepository(Role).findOneByOrFail({ code });
    await db.getRepository(User).insert({ id, email: `${id}@mini.test`, username: id, displayName: 'Mini library verification', passwordHash: 'not-a-login-hash', status: 'active' });
    await db.getRepository(UserRole).insert({ userId: id, roleId: role.id });
    const jwt = module.get(JwtService).sign({ sub: id });
    if (code === 'admin') { actor = id; adminToken = jwt; } else token = jwt;
  }
  await ensureLearningLibrary(db, actor);
}, 120000);
afterAll(async () => { if (app) await app.close(); if (db?.isInitialized) await db.destroy(); });

it('adds six separate packages and revisions, preserving old definitions, runs and identities on retry', async () => {
  const before = await db.query("SELECT id,code,version,status,definitionJson FROM project_templates WHERE code LIKE 'LEARN-%' ORDER BY code");
  const identities = await db.query('SELECT id,passwordHash,status FROM users ORDER BY id');
  const runs = await db.query('SELECT id,templateVersion,snapshotJson FROM template_runs ORDER BY id');
  expect(await ensureMiniProjectLibrary(db, actor)).toEqual({ inserted: 6, preserved: 0 });
  expect(await ensureMiniProjectLibrary(db, actor)).toEqual({ inserted: 0, preserved: 6 });
  expect(await db.query("SELECT id,code,version,status,definitionJson FROM project_templates WHERE code LIKE 'LEARN-%' ORDER BY code")).toEqual(before);
  expect(await db.query('SELECT id,passwordHash,status FROM users ORDER BY id')).toEqual(identities);
  expect(await db.query('SELECT id,templateVersion,snapshotJson FROM template_runs ORDER BY id')).toEqual(runs);
  const revisions = await db.query("SELECT r.version,r.definitionJson FROM project_template_revisions r JOIN project_templates t ON t.id=r.templateId WHERE t.code LIKE 'MINI-%'");
  expect(revisions).toHaveLength(6);
  expect(revisions.every((row: { version: number; definitionJson: string }) => row.version === 1 && !row.definitionJson.includes('assessment'))).toBe(true);
});
it.each(MINI_PROJECT_LIBRARY.map(template => [template.code!, template] as const))('%s creates an independent pinned session through the existing HTTP contract', async (code, template) => {
  const [row] = await db.query('SELECT id FROM project_templates WHERE code=@0', [code]);
  const started = await request(app.getHttpServer()).post(`/project-templates/${row.id}/start`).auth(token, { type: 'bearer' }).send({ name: `Demo ${code}`, startDate: '2027-01-01', endDate: '2027-01-07', requestId: randomUUID() }).expect(201);
  const [run] = await db.query('SELECT snapshotJson,templateVersion FROM template_runs WHERE projectId=@0', [started.body.projectId]);
  expect(run.templateVersion).toBe(1); expect(JSON.parse(run.snapshotJson).learningPackage).toEqual(template.learningPackage);
  const context = await request(app.getHttpServer()).get(`/projects/${started.body.projectId}/template-context`).auth(token, { type: 'bearer' }).expect(200);
  expect(JSON.stringify(context.body)).not.toMatch(/solutionFiles|hiddenTestFiles|validAnswers/);
});
it('does not rewrite edited or archived mini templates or their already pinned run', async () => {
  const [row] = await db.query("SELECT id FROM project_templates WHERE code='MINI-NOTES-V1'");
  const before = await db.query('SELECT id,templateVersion,snapshotJson FROM template_runs ORDER BY id');
  await request(app.getHttpServer()).patch(`/project-templates/${row.id}`).auth(token, { type: 'bearer' }).send({ expectedVersion: 1, name: 'Instructor custom notes', status: 'archived' }).expect(200);
  expect(await ensureMiniProjectLibrary(db, actor)).toEqual({ inserted: 0, preserved: 6 });
  const [after] = await db.query('SELECT name,version,status FROM project_templates WHERE id=@0', [row.id]);
  expect(after).toEqual({ name: 'Instructor custom notes', version: 2, status: 'archived' });
  expect(await db.query('SELECT id,templateVersion,snapshotJson FROM template_runs ORDER BY id')).toEqual(before);
});
it('accepts all eighteen knowledge rows through the existing Admin dry-run without publication or mutation', async () => {
  const [before] = await db.query('SELECT COUNT(*) total FROM knowledge_entries');
  const response = await request(app.getHttpServer()).post('/admin/knowledge/import/dry-run').auth(adminToken, { type: 'bearer' }).send({ entries: MINI_PROJECT_KNOWLEDGE }).expect(200);
  expect(response.body).toMatchObject({ total: 18, validDrafts: 18, publishable: 18, mutationsPerformed: 0 });
  const [after] = await db.query('SELECT COUNT(*) total FROM knowledge_entries'); expect(after).toEqual(before);
});
