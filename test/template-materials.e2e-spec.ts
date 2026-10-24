import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import request from 'supertest';
import source from '../src/database/data-source';
import { AppModule } from '../src/app.module';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { Permission } from '../src/rbac/entities/permission.entity';
import { RolePermission } from '../src/rbac/entities/role-permission.entity';
import { smallProjectFixture, privateAssessmentFixture } from './fixtures/small-project.fixture';
let db: DataSource, app: INestApplication, admin: string, teacher: string, other: string, student: string, templateId: string, projectId: string, studentId: string;
const base = '/project-templates', code = 'P01-' + randomUUID().slice(0, 8);
const api = (token = teacher) => ({
  get: (path: string) => request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' }),
  post: (path: string) => request(app.getHttpServer()).post(path).auth(token, { type: 'bearer' }),
  patch: (path: string) => request(app.getHttpServer()).patch(path).auth(token, { type: 'bearer' }),
});
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_CI_\d+_\d+$/.test(database) || source.options.type !== 'mssql') throw Error('Fresh disposable SQL database required.');
  db = new DataSource({ ...source.options, database }); await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db);
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DataSource).useValue(db).compile();
  app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  const tokens: string[] = [];
  for (const roleCode of ['admin', 'instructor', 'instructor', 'intern']) {
    const id = randomUUID(), role = await db.getRepository(Role).findOneByOrFail({ code: roleCode });
    await db.getRepository(User).insert({ id, email: `${id}@p01.test`, username: id, displayName: 'P01 verification', passwordHash: 'not-a-login-hash', status: 'active' });
    await db.getRepository(UserRole).insert({ userId: id, roleId: role.id }); tokens.push(module.get(JwtService).sign({ sub: id })); if (roleCode === 'intern') studentId = id;
  }
  [admin, teacher, other, student] = tokens;
}, 120000);
afterAll(async () => { if (app) await app.close(); if (db?.isInitialized) await db.destroy(); });
it('creates public starter and private assessment atomically without exposing answers', async () => {
  const created = await api().post(base).send({ ...smallProjectFixture(), code, assessment: privateAssessmentFixture() }).expect(201); templateId = created.body.id;
  expect(JSON.stringify(created.body)).not.toMatch(/PRIVATE_|solutionFiles|hiddenTestFiles|taskSuites/);
  const detail = await api().get(`${base}/${templateId}`).expect(200); expect(detail.body.definition.learningPackage.starterFiles).toHaveLength(1);
  expect(JSON.stringify(detail.body)).not.toContain('PRIVATE_');
  const [stored] = await db.query('SELECT definitionJson FROM project_templates WHERE id=@0', [templateId]); expect(stored.definitionJson).not.toContain('PRIVATE_');
  const assessment = await api().get(`${base}/${templateId}/assessment`).expect(200); expect(assessment.body.assessment.solutionFiles[0].content).toBe('PRIVATE_SOLUTION');
});
it('lists immutable public revisions and rejects invalid version/page input', async () => {
  const history = await api().get(`${base}/${templateId}/revisions?page=1&pageSize=1`).expect(200); expect(history.body.total).toBe(1); expect(history.body.items[0].version).toBe(1);
  const revision = await api().get(`${base}/${templateId}/revisions/1`).expect(200); expect(revision.body.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(revision.body)).not.toMatch(/PRIVATE_|assessmentHash|assessmentJson/);
  await api().get(`${base}/${templateId}/revisions/0`).expect(400); await api().get(`${base}/${templateId}/revisions?pageSize=101`).expect(400);
});
it('pins only public material in a run while staff can read its exact private version', async () => {
  const started = await api().post(`${base}/${templateId}/start`).send({ name: 'P01 pinned session', startDate: '2027-02-01', endDate: '2027-02-05', requestId: randomUUID() }).expect(201); projectId = started.body.projectId;
  const [run] = await db.query('SELECT snapshotJson,templateVersion FROM template_runs WHERE projectId=@0', [projectId]); expect(run.templateVersion).toBe(1); expect(run.snapshotJson).not.toContain('PRIVATE_');
  const context = await api().get(`/projects/${projectId}/template-context`).expect(200); expect(JSON.stringify(context.body)).not.toContain('PRIVATE_');
  const privateContext = await api().get(`/projects/${projectId}/template-assessment`).expect(200); expect(privateContext.body.version).toBe(1);
  await api(other).get(`/projects/${projectId}/template-assessment`).expect(403);
  await api(admin).get(`/projects/${projectId}/template-assessment`).expect(200);
});
it('preserves assessment on public edits and pins old material after a private-only edit', async () => {
  await api().patch(`${base}/${templateId}`).send({ expectedVersion: 1, name: 'Ghi chú có hướng dẫn mới' }).expect(200);
  expect((await api().get(`${base}/${templateId}/assessment`).expect(200)).body.assessment.solutionFiles[0].content).toBe('PRIVATE_SOLUTION');
  const changed = privateAssessmentFixture(); changed.solutionFiles[0].content = 'PRIVATE_SOLUTION_NEW';
  const response = await api().patch(`${base}/${templateId}`).send({ expectedVersion: 2, assessment: changed }).expect(200); expect(response.body.version).toBe(3);
  expect(JSON.stringify(response.body)).not.toContain('PRIVATE_');
  const pinned = await api().get(`/projects/${projectId}/template-assessment`).expect(200); expect(pinned.body.assessment.solutionFiles[0].content).toBe('PRIVATE_SOLUTION');
  expect((await api().get(`${base}/${templateId}/assessment`).expect(200)).body.assessment.solutionFiles[0].content).toBe('PRIVATE_SOLUTION_NEW');
});
it('clears current assessment with null without deleting old teaching evidence', async () => {
  const invalid = smallProjectFixture(); invalid.code = code; invalid.sprints[0].tasks[0].key = 'different-create';
  for (const task of invalid.sprints[0].tasks.slice(1)) task.dependsOn = ['different-create'];
  await api().patch(`${base}/${templateId}`).send({ expectedVersion: 3, definition: invalid }).expect(400);
  expect((await api().get(`${base}/${templateId}`).expect(200)).body.version).toBe(3);
  await api().patch(`${base}/${templateId}`).send({ expectedVersion: 3, assessment: null }).expect(200);
  expect((await api().get(`${base}/${templateId}/assessment`).expect(200)).body.assessment).toBeNull();
  expect((await api().get(`${base}/${templateId}/revisions/1/assessment`).expect(200)).body.assessment).not.toBeNull();
});
it('denies private content to an intern even with forged extra permissions', async () => {
  const role = await db.getRepository(Role).findOneByOrFail({ code: 'intern' });
  const grants = [];
  for (const code of ['projects.manage', 'templates.assessment.read', 'templates.assessment.manage']) {
    const permission = await db.getRepository(Permission).findOneByOrFail({ code }); grants.push({ roleId: role.id, permissionId: permission.id });
  }
  await db.getRepository(RolePermission).insert(grants);
  try {
    await api(student).get(`${base}/${templateId}`).expect(200);
    await api(student).get(`${base}/${templateId}/revisions/1/assessment`).expect(403);
    await api(student).get(`/projects/${projectId}/template-assessment`).expect(403);
    await api(student).patch(`${base}/${templateId}`).send({ expectedVersion: 4, assessment: privateAssessmentFixture() }).expect(403);
  } finally { for (const grant of grants) await db.getRepository(RolePermission).delete(grant); }
});
it('observes permission revocation and rejects locked accounts', async () => {
  const role = await db.getRepository(Role).findOneByOrFail({ code: 'instructor' }), permission = await db.getRepository(Permission).findOneByOrFail({ code: 'templates.assessment.read' });
  const grant = { roleId: role.id, permissionId: permission.id }; await db.getRepository(RolePermission).delete(grant);
  try { await api().get(`${base}/${templateId}/assessment`).expect(403); } finally { await db.getRepository(RolePermission).insert(grant); }
  const manage = await db.getRepository(Permission).findOneByOrFail({ code: 'templates.assessment.manage' }), manageGrant = { roleId: role.id, permissionId: manage.id };
  await db.getRepository(RolePermission).delete(manageGrant);
  try { await api().patch(`${base}/${templateId}`).send({ expectedVersion: 4, assessment: privateAssessmentFixture() }).expect(403); } finally { await db.getRepository(RolePermission).insert(manageGrant); }
  await db.getRepository(User).update(studentId, { status: 'locked' });
  try { await api(student).get(`${base}/${templateId}`).expect(401); } finally { await db.getRepository(User).update(studentId, { status: 'active' }); }
});
it('serializes stale editors and keeps assessment content out of audit details', async () => {
  const responses = await Promise.all(['Một bản được chấp nhận', 'Một bản phải tải lại'].map(name => api().patch(`${base}/${templateId}`).send({ expectedVersion: 4, name })));
  expect(responses.map(row => row.status).sort()).toEqual([200, 409]);
  const rows = await db.query('SELECT version FROM project_template_revisions WHERE templateId=@0', [templateId]); expect(rows).toHaveLength(5);
  const audit = await db.query('SELECT detail FROM audit_logs WHERE targetId=@0', [templateId]); expect(JSON.stringify(audit)).not.toContain('PRIVATE_');
});
it('rejects overwrite/delete of revision and assessment rows at SQL level', async () => {
  await expect(db.query("UPDATE project_template_revisions SET definitionJson=N'{}' WHERE templateId=@0 AND version=1", [templateId])).rejects.toThrow(/immutable/);
  await expect(db.query('DELETE FROM project_template_revisions WHERE templateId=@0', [templateId])).rejects.toThrow(/immutable/);
  await expect(db.query("UPDATE project_template_assessments SET assessmentJson=N'{}' WHERE templateId=@0 AND version=1", [templateId])).rejects.toThrow(/immutable/);
  await expect(db.query('DELETE FROM project_template_assessments WHERE templateId=@0', [templateId])).rejects.toThrow(/immutable/);
});
it('rolls back invalid content and rejects private fields inside a public definition', async () => {
  const before = Number((await db.query('SELECT COUNT(*) count FROM project_templates'))[0].count);
  const invalid = smallProjectFixture(); invalid.code = 'INVALID-' + code; invalid.learningPackage.starterFiles[0].path = '../secret';
  await api().post(base).send({ ...invalid, assessment: privateAssessmentFixture() }).expect(400);
  await api().patch(`${base}/${templateId}`).send({ expectedVersion: 5, definition: { ...smallProjectFixture(), code, assessment: privateAssessmentFixture() } }).expect(400);
  expect(Number((await db.query('SELECT COUNT(*) count FROM project_templates'))[0].count)).toBe(before);
  expect((await api().get(`${base}/${templateId}`).expect(200)).body.version).toBe(5);
});
it('documents the write-only assessment and public small-package fields', () => {
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  expect(doc.paths[`${base}/{id}/assessment`].get).toBeDefined();
  expect(doc.components?.schemas?.CreateTemplateDto).toMatchObject({ properties: { assessment: { writeOnly: true }, learningPackage: { type: 'object' } } });
});
