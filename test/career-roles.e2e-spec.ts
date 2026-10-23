import { randomUUID } from 'crypto';
import { hash } from 'bcryptjs';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import source from '../src/database/data-source';
import { AdoptTemplateCareerRoles1762723200000 } from '../src/database/migrations/1762723200000-AdoptTemplateCareerRoles';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';

const password = 'Career-E2e-123!';
let db: DataSource, app: INestApplication, admin: string, teacher: string, student: string;
const code = 'data_' + randomUUID().replace(/-/g, '').slice(0, 16);
const base = '/api/v1/admin/career-roles', catalog = '/api/v1/career-roles';
const content = {
  name: 'Data Analyst', description: 'Phân tích bộ dữ liệu nhỏ và giải thích kết quả bằng bằng chứng.',
  level: 'intern', language: 'vi', requiredSkills: ['SQL', 'Statistics'], optionalSkills: ['Python'],
  competencyWeights: { SQL: 60, Statistics: 40 },
};
function api(token: string) {
  const server = () => app.getHttpServer();
  return {
    get: (url: string) => request(server()).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(server()).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(server()).put(url).set('Authorization', `Bearer ${token}`),
  };
}

beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_(?:E2E|Test)_[A-Za-z0-9_]+$/.test(database)) throw Error('Disposable database required.');
  if (source.options.type !== 'mssql') throw Error('SQL Server required.');
  db = new DataSource({ ...source.options, database, synchronize: false });
  await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0);
  const tokens: string[] = [];
  for (const roleCode of ['admin', 'instructor', 'intern']) {
    const suffix = randomUUID().slice(0, 8), role = await db.getRepository(Role).findOneByOrFail({ code: roleCode });
    const user = await db.getRepository(User).save({ email: `career.${suffix}@vintern.test`, username: `career.${suffix}`, displayName: `Career ${roleCode}`, passwordHash: await hash(password, 10), status: 'active' });
    await db.getRepository(UserRole).insert({ userId: user.id, roleId: role.id });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200);
    tokens.push(login.body.accessToken);
  }
  [admin, teacher, student] = tokens;
}, 120000);
afterAll(async () => { await app?.close(); if (db?.isInitialized) await db.destroy(); });

describe('dynamic career catalog API', () => {
  it('requires authentication and restricts all administration to effective admins', async () => {
    await request(app.getHttpServer()).get(catalog).expect(401);
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer()).get(`${catalog}/reference`).expect(401);
    await api(student).get(`${catalog}/reference`).expect(403);
    const references = await api(teacher).get(`${catalog}/reference`).expect(200);
    expect(references.body.items.find((role: { code: string }) => role.code === 'frontend')).toEqual({ code: 'frontend', label: 'Frontend Developer' });
    for (const token of [teacher, student]) {
      await api(token).get(base).expect(403);
      await api(token).post(base).send({ code, ...content }).expect(403);
      await api(token).put(`${base}/frontend`).send({ ...content, version: 1, status: 'published', acceptingApplications: true }).expect(403);
      await api(token).post(`${base}/frontend/archive`).send({ version: 1 }).expect(403);
      await api(token).get(`${base}/frontend/revisions`).expect(403);
    }
  });

  it('creates a draft with a versioned snapshot, normalized text and no RBAC side effect', async () => {
    const [before] = await db.query('SELECT COUNT(*) count FROM roles');
    const created = await api(admin).post(base).send({ code, ...content, name: '  Data Analyst  ' }).expect(201);
    expect(created.body).toMatchObject({ code, ...content, version: 1, status: 'draft', acceptingApplications: false });
    await api(admin).post(base).send({ code, ...content }).expect(409);
    const list = await api(student).get(catalog).expect(200);
    expect(list.body.items.some((r: { code: string }) => r.code === code)).toBe(false);
    expect((await api(teacher).get(`${catalog}/reference`)).body.items.some((r: { code: string }) => r.code === code)).toBe(false);
    const detail = await api(admin).get(`${base}/${code}`).expect(200);
    expect(detail.body).toMatchObject({ code, version: 1 });
    expect((await db.query('SELECT COUNT(*) count FROM roles'))[0].count).toBe(before.count);
    const revisions = await api(admin).get(`${base}/${code}/revisions`).expect(200);
    expect(revisions.body.items).toHaveLength(1);
    expect(revisions.body.items[0]).toMatchObject({ version: 1, snapshot: { code, status: 'draft', name: 'Data Analyst' } });
    expect(revisions.body.items[0].createdBy).toMatch(/^[a-f0-9-]{36}$/i);
  });

  it('publishes valid content as a new version and exposes only recruiting catalog fields', async () => {
    await api(admin).put(`${base}/${code}`).send({ ...content, description: '', requiredSkills: [], competencyWeights: {}, version: 1, status: 'published', acceptingApplications: true }).expect(400);
    const published = await api(admin).put(`${base}/${code}`).send({ ...content, version: 1, status: 'published', acceptingApplications: true }).expect(200);
    expect(published.body).toMatchObject({ version: 2, status: 'published', acceptingApplications: true });
    const list = await api(student).get(catalog).expect(200);
    const role = list.body.items.find((r: { code: string }) => r.code === code);
    expect(role).toMatchObject({ code, label: content.name, requiredSkills: content.requiredSkills, version: 2 });
    expect(role).not.toHaveProperty('competencyWeights');
    expect(role).not.toHaveProperty('createdBy');
    const search = await api(admin).get(`${base}?search=${code}&status=published&pageSize=1`).expect(200);
    expect(search.body).toMatchObject({ total: 1, pageSize: 1, items: [{ code }] });
    await api(admin).put(`${base}/${code}`).send({ ...content, version: 1, status: 'published', acceptingApplications: true }).expect(409);
  });

  it('serializes concurrent edits, preserving one winner, one conflict and immutable old revisions', async () => {
    const attempts = await Promise.all(['First update', 'Second update'].map(name => api(admin).put(`${base}/${code}`).send({ ...content, name, version: 2, status: 'published', acceptingApplications: true })));
    expect(attempts.map(r => r.status).sort()).toEqual([200, 409]);
    const revisions = await api(admin).get(`${base}/${code}/revisions`).expect(200);
    expect(revisions.body.items.map((r: { version: number }) => r.version)).toEqual([3, 2, 1]);
    expect(revisions.body.items[2].snapshot).toMatchObject({ name: 'Data Analyst', status: 'draft', version: 1 });
    const audit = await db.query("SELECT action,detail FROM audit_logs WHERE targetType='career_role' AND targetId=@0 ORDER BY createdAt", [code]);
    expect(audit).toHaveLength(3);
    expect(audit.map((r: { detail: string }) => JSON.parse(r.detail).version)).toEqual([1, 2, 3]);
  });

  it('archives without deleting catalog/revisions and supports an explicit versioned reopening', async () => {
    const archived = await api(admin).post(`${base}/${code}/archive`).send({ version: 3 }).expect(201);
    expect(archived.body).toMatchObject({ status: 'archived', acceptingApplications: false, version: 4 });
    await api(admin).post(`${base}/${code}/archive`).send({ version: 3 }).expect(409);
    expect((await api(student).get(catalog)).body.items.some((r: { code: string }) => r.code === code)).toBe(false);
    expect((await api(teacher).get(`${catalog}/reference`)).body.items.some((r: { code: string }) => r.code === code)).toBe(true);
    expect((await api(admin).get(`${base}/${code}/revisions`)).body.items).toHaveLength(4);
    await request(app.getHttpServer()).delete(`${base}/${code}`).set('Authorization', `Bearer ${admin}`).expect(404);
    await api(admin).put(`${base}/${code}`).send({ ...content, version: 4, status: 'published', acceptingApplications: true }).expect(200);
    // Keep this suite's dynamic catalog data from changing unrelated recruitment expectations.
    await api(admin).post(`${base}/${code}/archive`).send({ version: 5 }).expect(201);
  });

  it('rejects invalid codes, duplicate skills, unbalanced weights, unsafe versions and mutable codes', async () => {
    const invalid = [
      { code: 'Frontend New' }, { code: 'x'.repeat(33) }, { name: '  ' },
      { requiredSkills: ['SQL', ' sql '] }, { optionalSkills: ['SQL'] },
      { competencyWeights: { SQL: 101, Statistics: -1 } }, { competencyWeights: { Unknown: 100 } },
      { competencyWeights: { SQL: 20, Statistics: 20 } }, { competencyWeights: { SQL: '60', Statistics: 40 } },
    ];
    for (const bad of invalid) await api(admin).post(base).send({ code: `${code}_x`, ...content, ...bad }).expect(400);
    await api(admin).put(`${base}/${code}`).send({ ...content, code: 'renamed', version: 6, status: 'draft', acceptingApplications: false }).expect(400);
    await api(admin).put(`${base}/${code}`).send({ ...content, version: 6, status: 'draft', acceptingApplications: true }).expect(400);
    await api(admin).post(`${base}/${code}/archive`).send({ version: 0 }).expect(400);
    await api(admin).get(`${base}/not_a_real_career`).expect(404);
  });

  it('uses a new career for question authoring and interviews while preserving attempts on readiness/state errors', async () => {
    const career = `${code}_i`, bank = '/api/v1/admin/question-bank';
    const own = '/api/v1/recruitment/me';
    const select = (role: string) => request(app.getHttpServer()).patch(`${own}/role`).set('Authorization', `Bearer ${student}`).send({ role });
    await api(admin).post(base).send({ code: career, ...content }).expect(201);
    await select(career).expect(409); // Draft is not eligible for new applicants.
    await select('unknown_role').expect(400);
    await api(admin).put(`${base}/${career}`).send({ ...content, version: 1, status: 'published', acceptingApplications: true }).expect(200);
    const selected = await select(career).expect(200);
    expect(selected.body).toMatchObject({ selectedRole: career, selectedRoleLabel: content.name, attemptNumber: 0 });
    const notReady = await api(student).post(`${own}/interviews`).send({}).expect(503);
    expect(notReady.body.code).toBe('INTERVIEW_QUESTION_POOL_INSUFFICIENT');
    expect((await api(student).get(own)).body.attemptNumber).toBe(0);
    for (let i = 0; i < 10; i++) {
      const phase = i < 2 ? 'introduction' : i < 8 ? 'technical' : 'english';
      await api(admin).post(bank).send({ roleCode: career, phase, difficulty: 'easy', language: phase === 'english' ? 'en' : 'vi', prompt: `Interview question ${i}: Explain a specific example.`, expectedConcepts: ['reasoning'], exampleAnswer: 'Private answer guidance only for the evaluator.', scoringRubric: 'Assess reasoning with a concrete example and limitations.', followUpHints: ['Explain another example.'], tags: ['career-e2e'], isActive: true }).expect(201);
    }
    const filtered = await api(admin).get(`${bank}?roleCode=${career}`).expect(200);
    expect(filtered.body.total).toBe(10);
    await api(admin).post(`${base}/${career}/archive`).send({ version: 2 }).expect(201);
    const closed = await api(student).post(`${own}/interviews`).send({}).expect(409);
    expect(closed.body.code).toBe('CAREER_ROLE_NOT_RECRUITING');
    expect((await api(student).get(own)).body.attemptNumber).toBe(0);
    await api(admin).put(`${base}/${career}`).send({ ...content, version: 3, status: 'published', acceptingApplications: true }).expect(200);
    const started = await api(student).post(`${own}/interviews`).send({}).expect(201);
    expect(started.body.session).toMatchObject({ roleCode: career, attemptNumber: 1, questionCount: 10 });
    const [persisted] = await db.query('SELECT COUNT(*) count FROM interview_session_questions WHERE sessionId=@0', [started.body.session.id]);
    expect(persisted.count).toBe(10);
    await api(admin).post(`${base}/${career}/archive`).send({ version: 4 }).expect(201);
    await api(student).get(`${own}/interviews/${started.body.session.id}/conversation`).expect(200);
    expect((await api(student).get(own)).body).toMatchObject({ selectedRole: career, selectedRoleLabel: content.name, attemptNumber: 1 });
    await api(admin).put(`${base}/${career}`).send({ ...content, version: 5, status: 'draft', acceptingApplications: false }).expect(200);
    expect((await api(teacher).get(`${catalog}/reference`)).body.items.some((r: { code: string }) => r.code === career)).toBe(true);
  });
  it('keeps legacy template careers and accepts new catalog careers in versioned templates', async () => {
    const legacy = await api(admin).get(`${base}/devops`).expect(200);
    expect(legacy.body).toMatchObject({ code: 'devops', status: 'archived', acceptingApplications: false });
    const template = (role: string) => ({ name: 'Small data exploration project', description: 'Practice one SQL report with a small reproducible data set.', difficulty: 'beginner', techStack: ['SQL'], roles: [role], modules: ['Report'], sprints: [{ name: 'Data report', goal: 'Deliver one verified report', durationDays: 3, tasks: [{ title: 'Query and explain', requirements: 'Implement a SQL report and verify empty and non-empty data.', dod: ['Query is reproducible'], role, storyPoints: 2 }] }], dod: ['Report works'], rubricVersion: 'task-review-v1', scenarios: ['Empty data set'], documentation: 'Run the query against the provided small data set and explain the result.' });
    await api(admin).post('/api/v1/project-templates').send(template('devops')).expect(201);
    const created = await api(admin).post('/api/v1/project-templates').send(template(code)).expect(201);
    expect(created.body.definition.roles).toEqual([code]);
    const changed = await request(app.getHttpServer()).patch(`/api/v1/project-templates/${created.body.id}`).set('Authorization', `Bearer ${admin}`).send({ definition: { ...template(code), name: 'Revised small report' }, expectedVersion: 1 }).expect(200);
    expect(changed.body.version).toBe(2);
    const started = await api(teacher).post(`/api/v1/project-templates/${created.body.id}/start`).send({ name: 'New-career project cohort', startDate: '2027-01-01T00:00:00.000Z', endDate: '2027-01-10T00:00:00.000Z', requestId: randomUUID() }).expect(201);
    const slots = await api(teacher).get(`/api/v1/projects/${started.body.projectId}/slots`).expect(200);
    expect(slots.body.slots).toEqual([expect.objectContaining({ roleCode: code, requiredCount: 1 })]);
    const context = await api(teacher).get(`/api/v1/projects/${started.body.projectId}/template-context`).expect(200);
    expect(context.body.definition.roles).toEqual([code]);
    await api(admin).post('/api/v1/project-templates').send(template('missing_career')).expect(400);
    expect((await api(student).get(catalog)).body.items.some((r: { code: string }) => r.code === 'devops')).toBe(false);
  });
  it('adopts imported blueprint careers as archived without overwriting edits, and refuses truncation', async () => {
    const imported = `${code}_old`, templateId = randomUUID(), oversizedId = randomUUID();
    const [actor] = await db.query("SELECT TOP(1) ur.userId id FROM user_roles ur JOIN roles r ON r.id=ur.roleId WHERE r.code='admin'");
    const definition = JSON.stringify({ roles: [imported], roleDetails: [{ code: imported }], sprints: [{ tasks: [{ role: imported }] }] });
    await db.query("INSERT INTO project_templates(id,code,name,difficulty,definitionJson,createdById) VALUES(@0,@1,N'Legacy imported blueprint','beginner',@2,@3)", [templateId, `OLD_${code}`, definition, actor.id]);
    const query = db.createQueryRunner();
    await query.connect();
    try {
      const migration = new AdoptTemplateCareerRoles1762723200000();
      await migration.up(query);
      expect((await api(admin).get(`${base}/${imported}`)).body).toMatchObject({ code: imported, status: 'archived', acceptingApplications: false });
      expect((await db.query('SELECT definitionJson FROM project_templates WHERE id=@0', [templateId]))[0].definitionJson).toBe(definition);
      await api(admin).put(`${base}/${imported}`).send({ ...content, name: 'Edited legacy career', version: 1, status: 'archived', acceptingApplications: false }).expect(200);
      await migration.down(); await migration.up(query);
      expect((await api(admin).get(`${base}/${imported}`)).body).toMatchObject({ name: 'Edited legacy career', version: 2 });
      expect((await api(admin).get(`${base}/${imported}/revisions`)).body.total).toBe(2);
      await db.query("INSERT INTO project_templates(id,code,name,difficulty,definitionJson,createdById) VALUES(@0,@1,N'Oversized legacy role','beginner',@2,@3)", [oversizedId, `LONG_${code}`, JSON.stringify({ roles: ['x'.repeat(33)] }), actor.id]);
      await expect(migration.up(query)).rejects.toThrow(/automatic truncation is forbidden/);
      expect((await api(admin).get(`${base}/${imported}`)).body.version).toBe(2);
    } finally {
      await query.release();
      await db.query('DELETE FROM project_templates WHERE id=@0', [oversizedId]);
    }
  });
});
