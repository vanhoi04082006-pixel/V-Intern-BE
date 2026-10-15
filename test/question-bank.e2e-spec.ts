import { randomUUID } from 'crypto';
import { hash } from 'bcryptjs';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import source from '../src/database/data-source';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { ensureRecruitmentQuestions } from '../src/recruitment/question-seed';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
const password = 'E2e-Question-123!';
let db: DataSource, app: INestApplication, admin: string, teacher: string, student: string;
let questionId: string, version = 1;
const content = { roleCode: 'backend', phase: 'technical', difficulty: 'medium', language: 'vi', prompt: 'Bạn bảo vệ một transaction tạo đơn hàng như thế nào?', expectedConcepts: ['transaction', 'rollback'], exampleAnswer: 'PRIVATE-BANK-MARKER: Validate, khóa tồn kho, ghi đơn và rollback khi lỗi.', scoringRubric: 'Chấm theo tính nguyên tử và bằng chứng kiểm thử concurrency.', followUpHints: ['Yêu cầu một ví dụ lỗi giữa transaction.'], tags: ['SQL', 'transaction'], isActive: true };
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_(?:E2E|Test)_[A-Za-z0-9_]+$/.test(database)) throw Error('Disposable database required.');
  const options = source.options; if (options.type !== 'mssql') throw Error('SQL Server required.');
  db = new DataSource({ ...options, database, synchronize: false }); await db.initialize(); await db.runMigrations({ transaction: 'all' }); await ensureRbac(db); await ensureRecruitmentQuestions(db);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' }); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.listen(0);
  const tokens: string[] = [];
  for (const code of ['admin', 'instructor', 'intern']) {
    const suffix = randomUUID().slice(0, 8), role = await db.getRepository(Role).findOneByOrFail({ code });
    const u = await db.getRepository(User).save({ email: `bank.${suffix}@vintern.test`, username: `bank.${suffix}`, displayName: `Bank ${code}`, passwordHash: await hash(password, 10), status: 'active' });
    await db.getRepository(UserRole).insert({ userId: u.id, roleId: role.id });
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: u.email, password }).expect(200); tokens.push(login.body.accessToken);
  }
  [admin, teacher, student] = tokens;
}, 120000);
afterAll(async () => { await app?.close(); if (db?.isInitialized) await db.destroy(); });
function api(token: string) { return { get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`), post: (url: string) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`), put: (url: string) => request(app.getHttpServer()).put(url).set('Authorization', `Bearer ${token}`), delete: (url: string) => request(app.getHttpServer()).delete(url).set('Authorization', `Bearer ${token}`) }; }
const base = '/api/v1/admin/question-bank';
describe('private administrator question bank', () => {
  it('rejects instructor/student reads and writes before exposing answer guidance', async () => {
    for (const token of [teacher, student]) { await api(token).get(base).expect(403); await api(token).post(base).send(content).expect(403); }
    await request(app.getHttpServer()).get(base).expect(401);
  });
  it('creates, searches and versions private content with pagination and coverage', async () => {
    const created = await api(admin).post(base).send(content).expect(201); questionId = created.body.id;
    expect(created.body).toMatchObject({ version: 1, exampleAnswer: content.exampleAnswer });
    expect(created.body.sortOrder).toBeGreaterThanOrEqual(1000);
    const result = await api(admin).get(base + '?roleCode=backend&phase=technical&status=active&pageSize=1&search=' + encodeURIComponent('bảo vệ một transaction')).expect(200);
    expect(result.body.items).toHaveLength(1); expect(result.body.items[0].id).toBe(questionId); expect(result.body.coverage.length).toBeGreaterThan(0);
    const updated = await api(admin).put(`${base}/${questionId}`).send({ ...content, prompt: content.prompt + ' Nêu cách retry.', version }).expect(200); version = updated.body.version; expect(version).toBe(2);
    await api(admin).put(`${base}/${questionId}`).send({ ...content, version: 1 }).expect(409);
    await api(admin).put(`${base}/${questionId}`).send({ ...content, roleCode: 'frontend', version }).expect(400);
    const audits = await db.query("SELECT detail FROM audit_logs WHERE targetId=@0 AND targetType='interview_question'", [questionId]);
    expect(audits).toHaveLength(2); expect(JSON.stringify(audits)).not.toContain('PRIVATE-BANK-MARKER');
  });
  it('validates guidance and language and retires without removing history', async () => {
    await api(admin).post(base).send({ ...content, prompt: ' '.repeat(12) }).expect(400);
    await api(admin).post(base).send({ ...content, phase: 'english', language: 'vi' }).expect(400);
    await api(admin).delete(`${base}/${questionId}?version=${version}`).expect(200);
    const retired = await api(admin).get(`${base}/${questionId}`).expect(200);
    expect(retired.body).toMatchObject({ isActive: false, version: 3, exampleAnswer: content.exampleAnswer });
    await api(admin).delete(`${base}/${questionId}?version=${version}`).expect(409);
  });
  it('preserves existing interview snapshots after editing a selected question', async () => {
    await request(app.getHttpServer()).patch('/api/v1/recruitment/me/role').set('Authorization', `Bearer ${student}`).send({ role: 'backend' }).expect(200);
    const started = await api(student).post('/api/v1/recruitment/me/interviews').send({}).expect(201);
    const [snapshot] = await db.query('SELECT TOP(1) * FROM interview_session_questions WHERE sessionId=@0 ORDER BY position', [started.body.session.id]);
    const original = (await api(admin).get(`${base}/${snapshot.questionId}`).expect(200)).body;
    try {
      await api(admin).put(`${base}/${snapshot.questionId}`).send({ roleCode: original.roleCode, phase: original.phase, difficulty: original.difficulty, language: original.language, prompt: 'Nội dung mới chỉ áp dụng cho buổi phỏng vấn tương lai.', expectedConcepts: original.expectedConcepts, exampleAnswer: content.exampleAnswer, scoringRubric: content.scoringRubric, followUpHints: content.followUpHints, tags: original.tags.slice(0, 20), isActive: original.isActive, version: original.version }).expect(200);
      const [pinned] = await db.query('SELECT promptSnapshot,rubricSnapshot FROM interview_session_questions WHERE id=@0', [snapshot.id]);
      expect(pinned).toEqual({ promptSnapshot: snapshot.promptSnapshot, rubricSnapshot: snapshot.rubricSnapshot });
      const own = await api(student).get(`/api/v1/recruitment/me/interviews/${started.body.session.id}/conversation`).expect(200);
      expect(JSON.stringify(own.body)).not.toMatch(/PRIVATE-BANK-MARKER|rubricSnapshot|exampleAnswer|expectedConcepts/);
    } finally {
      const current = (await api(admin).get(`${base}/${snapshot.questionId}`)).body;
      await api(admin).put(`${base}/${snapshot.questionId}`).send({ roleCode: original.roleCode, phase: original.phase, difficulty: original.difficulty, language: original.language, prompt: original.prompt, expectedConcepts: original.expectedConcepts, exampleAnswer: original.exampleAnswer, scoringRubric: original.scoringRubric, followUpHints: original.followUpHints, tags: original.tags.slice(0, 20), isActive: original.isActive, version: current.version }).expect(200);
    }
  });
  it('audits versioned AI settings, blocks secret/URL overrides and reports safe integration status', async () => {
    const url = '/api/v1/admin/ai-configuration';
    for (const token of [teacher, student]) { await api(token).get(url).expect(403); await api(token).put(url).send({}).expect(403); await api(token).get('/api/v1/admin/system/status').expect(403); }
    const [prior] = await db.query("SELECT * FROM system_settings WHERE settingKey='ai.runtime'");
    try {
      const original = (await api(admin).get(url).expect(200)).body;
      const policy = { model: 'gemini-model-for-test', timeoutMs: 30000, maxRetries: 1, version: original.policy.version };
      const saved = await api(admin).put(url).send(policy).expect(200);
      expect(saved.body).toMatchObject({ source: 'database', policy: { ...policy, version: policy.version + 1 } });
      await api(admin).put(url).send(policy).expect(409);
      await api(admin).put(url).send({ ...policy, version: policy.version + 1, apiKey: 'must-never-store' }).expect(400);
      await api(admin).put(url).send({ ...policy, version: policy.version + 1, model: 'https://unknown-host/model' }).expect(400);
      await request(app.getHttpServer()).patch('/api/v1/settings').set('Authorization', `Bearer ${admin}`).send({ key: 'ai.runtime', value: '{}' }).expect(400);
      const status = (await api(admin).get('/api/v1/admin/system/status').expect(200)).body;
      expect(status.counts.activeQuestions).toBeGreaterThan(0); expect(status.integrations.runner.connectivity).toBe('not_probed');
      expect(JSON.stringify(status)).not.toMatch(/tokenCiphertext|PRIVATE-BANK-MARKER|must-never-store/);
      await api(admin).get('/api/v1/admin/system/repositories?pageSize=1').expect(200);
      await api(admin).get('/api/v1/admin/system/repositories?pageSize=101').expect(400);
    } finally {
      if (prior) await db.query("UPDATE system_settings SET value=@0,description=@1,updatedAt=@2 WHERE settingKey='ai.runtime'", [prior.value, prior.description, prior.updatedAt]);
      else await db.query("DELETE FROM system_settings WHERE settingKey='ai.runtime'");
    }
  });
});
