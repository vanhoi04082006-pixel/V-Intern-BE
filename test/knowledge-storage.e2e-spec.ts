import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import source from '../src/database/data-source';
import { CreateKnowledgeLibrary1762809600000 } from '../src/database/migrations/1762809600000-CreateKnowledgeLibrary';
import { ensureRbac } from '../src/bootstrap/ensure-rbac';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/rbac/entities/role.entity';
import { UserRole } from '../src/rbac/entities/user-role.entity';
import { GroupMember } from '../src/groups/entities/group-member.entity';
import { GroupRole } from '../src/groups/entities/group-role.entity';
import { Permission } from '../src/rbac/entities/permission.entity';
import { RolePermission } from '../src/rbac/entities/role-permission.entity';
import { PermissionsService } from '../src/rbac/permissions.service';
import { CareerRolesService } from '../src/career-roles/career-roles.service';
import { KnowledgeStore } from '../src/knowledge/knowledge.store';
import { KnowledgeDraft } from '../src/knowledge/knowledge.contracts';
import { KnowledgeEntry } from '../src/knowledge/entities/knowledge-entry.entity';
import { KnowledgeRevision } from '../src/knowledge/entities/knowledge-revision.entity';

let db: DataSource, store: KnowledgeStore, admin: string, teacher: string, student: string;
const code = 'git-' + randomUUID().slice(0, 8);
const draft = (): KnowledgeDraft => ({ kind: 'guide', title: 'Đọc lỗi Git', summary: 'Kiểm tra lỗi trước khi sửa.', language: 'vi', difficulty: 'easy', audience: 'student_safe', purposes: ['mentoring'], roleCodes: ['frontend'], tags: ['Git'], sources: [{ title: 'Git docs', url: 'https://git-scm.com/docs' }], body: { markdown: 'Không ghi đè thay đổi khi chưa kiểm tra working tree.' } });
async function migration(direction: 'up' | 'down') {
  const runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  try { await new CreateKnowledgeLibrary1762809600000()[direction](runner); await runner.commitTransaction(); }
  catch (error) { await runner.rollbackTransaction(); throw error; }
  finally { await runner.release(); }
}
beforeAll(async () => {
  const database = process.env.E2E_DB_NAME ?? '';
  if (!/^VIntern_E2E_(?:CI_\d+_\d+|CareerRoles_Api_\d+)$/.test(database)) throw Error('Dedicated disposable SQL database required.');
  if (source.options.type !== 'mssql') throw Error('SQL Server required.');
  db = new DataSource({ ...source.options, database, synchronize: false, logging: false });
  await db.initialize(); await db.runMigrations({ transaction: 'all' });
  await ensureRbac(db);
  const permissions = new PermissionsService(db.getRepository(UserRole), db.getRepository(GroupMember), db.getRepository(GroupRole), db.getRepository(Role), db.getRepository(RolePermission), db.getRepository(Permission));
  store = new KnowledgeStore(db, permissions, new CareerRolesService(db, permissions));
  const actors: string[] = [];
  for (const roleCode of ['admin', 'instructor', 'intern']) {
    const id = randomUUID(), role = await db.getRepository(Role).findOneByOrFail({ code: roleCode });
    await db.getRepository(User).insert({ id, email: `${id}@knowledge.test`, username: id, displayName: 'Knowledge QA', passwordHash: 'not-a-login-hash', status: 'active' });
    await db.getRepository(UserRole).insert({ userId: id, roleId: role.id }); actors.push(id);
  }
  [admin, teacher, student] = actors;
}, 120000);
afterAll(async () => { if (db?.isInitialized) await db.destroy(); });

describe('knowledge storage on SQL Server 2019', () => {
  it('registers the versioned knowledge schema through migrations without seeding content', async () => {
    const [tables] = await db.query("SELECT OBJECT_ID('knowledge_entries','U') entries,OBJECT_ID('knowledge_revisions','U') revisions");
    expect(tables.entries).not.toBeNull(); expect(tables.revisions).not.toBeNull();
    expect((await db.query('SELECT COUNT(*) count FROM knowledge_entries'))[0].count).toBe(0);
    expect(await db.runMigrations({ transaction: 'all' })).toEqual([]);
  });

  it('round-trips an empty migration without changing existing users, careers or interviews', async () => {
    const count = () => db.query('SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM career_roles) careers,(SELECT COUNT(*) FROM interview_sessions) interviews');
    const before = await count(); await migration('down');
    expect((await db.query("SELECT OBJECT_ID('knowledge_entries','U') id"))[0].id).toBeNull();
    await migration('up'); expect(await count()).toEqual(before);
    expect(await db.getRepository(KnowledgeEntry).count()).toBe(0);
    expect(await db.getRepository(KnowledgeRevision).count()).toBe(0);
  });

  it('denies every non-admin authoring operation before returning content or existence', async () => {
    for (const actor of [teacher, student, randomUUID()]) {
      await expect(store.saveDraft(actor, code, null, draft())).rejects.toBeInstanceOf(ForbiddenException);
      await expect(store.get(actor, code)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(store.history(actor, code)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(await db.getRepository(KnowledgeEntry).count()).toBe(0);
  });

  it('creates a draft and appends a revision without leaking body text into audit logs', async () => {
    const created = await store.saveDraft(admin, code, null, draft());
    expect(created).toMatchObject({ code, version: 1, status: 'draft', snapshot: { schemaVersion: 1, sources: draft().sources, audience: 'student_safe', purposes: ['mentoring'] } });
    expect(created.sha256).toMatch(/^[a-f0-9]{64}$/);
    const old = (await store.history(admin, code)).items[0];
    const updated = await store.saveDraft(admin, code, 1, { ...draft(), title: 'Kiểm tra Git', body: { markdown: 'Bản sửa mới.' } });
    expect(updated.version).toBe(2);
    expect(await store.get(admin, code)).toMatchObject({ version: 2, snapshot: { title: 'Kiểm tra Git' } });
    const history = await store.history(admin, code);
    expect(history.total).toBe(2); expect(history.items[1]).toEqual(old);
    const audits = await db.query("SELECT detail FROM audit_logs WHERE targetType='knowledge_entry' AND targetId=@0 ORDER BY createdAt", [created.id]);
    expect(audits).toHaveLength(2);
    expect(JSON.parse(audits[0].detail)).toEqual({ code, version: 1, sha256: created.sha256 });
    expect(audits.some((row: { detail: string }) => row.detail.includes('working tree'))).toBe(false);
  });

  it('serializes concurrent edits: one new version, one 409, one audit and revision', async () => {
    const results = await Promise.allSettled([store.saveDraft(admin, code, 2, { ...draft(), title: 'Edit A' }), store.saveDraft(admin, code, 2, { ...draft(), title: 'Edit B' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ConflictException);
    expect(failed.reason.getResponse()).toMatchObject({ code: 'KNOWLEDGE_VERSION_CONFLICT', details: { currentVersion: 3 } });
    expect((await store.get(admin, code)).version).toBe(3);
    expect((await store.history(admin, code, 2, 2))).toMatchObject({ total: 3, items: [{ version: 1 }] });
    const [audits] = await db.query("SELECT COUNT(*) count FROM audit_logs WHERE targetType='knowledge_entry' AND targetId=@0", [(await store.get(admin, code)).id]);
    expect(audits.count).toBe(3);
  });

  it('serializes duplicate creation without a second head, snapshot or audit', async () => {
    const duplicate = 'create-' + randomUUID().slice(0, 8);
    const results = await Promise.allSettled([store.saveDraft(admin, duplicate, null, draft()), store.saveDraft(admin, duplicate, null, draft())]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect((await store.history(admin, duplicate)).total).toBe(1);
  });

  it('rejects stale versions, unknown careers and invalid access classification without saving anything', async () => {
    await expect(store.saveDraft(admin, code, null, draft())).rejects.toBeInstanceOf(ConflictException);
    await expect(store.saveDraft(admin, code, 1, draft())).rejects.toBeInstanceOf(ConflictException);
    await expect(store.saveDraft(admin, code, 3, { ...draft(), roleCodes: ['unknown_role'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(store.saveDraft(admin, code, 3, { ...draft(), kind: 'rubric' })).rejects.toBeInstanceOf(BadRequestException);
    expect((await store.history(admin, code)).total).toBe(3);
  });

  it('rolls back current, snapshot and audit together when audit persistence fails', async () => {
    await db.query(`CREATE TRIGGER TR_knowledge_k01_fail_audit ON audit_logs AFTER INSERT AS BEGIN
      IF EXISTS(SELECT 1 FROM inserted WHERE targetType='knowledge_entry') THROW 51021, 'Injected knowledge audit failure.', 1;
    END`);
    try {
      await expect(store.saveDraft(admin, code, 3, draft())).rejects.toThrow('Injected knowledge audit failure');
      const newCode = 'failed-' + randomUUID().slice(0, 8);
      await expect(store.saveDraft(admin, newCode, null, draft())).rejects.toThrow('Injected knowledge audit failure');
      expect(await db.getRepository(KnowledgeEntry).findOneBy({ code: newCode })).toBeNull();
      expect((await store.get(admin, code)).version).toBe(3);
      expect((await store.history(admin, code)).total).toBe(3);
    } finally { await db.query('DROP TRIGGER TR_knowledge_k01_fail_audit'); }
  });

  it('blocks mutation/deletion of immutable revisions and refuses lossy migration rollback', async () => {
    const entry = await store.get(admin, code);
    await expect(db.query('UPDATE knowledge_revisions SET snapshotJson=@0 WHERE entryId=@1 AND version=1', ['{}', entry.id])).rejects.toThrow(/immutable/);
    await expect(db.query('DELETE FROM knowledge_revisions WHERE entryId=@0', [entry.id])).rejects.toThrow(/immutable/);
    await expect(db.query('DELETE FROM knowledge_entries WHERE id=@0', [entry.id])).rejects.toThrow();
    await expect(migration('down')).rejects.toThrow(/Preserve knowledge/);
    expect((await store.history(admin, code)).total).toBe(3);
  });

  it('rejects invalid SQL metadata, JSON, hashes and missing authors without adding revisions', async () => {
    const entry = await store.get(admin, code);
    await expect(db.query("UPDATE knowledge_entries SET status='public' WHERE id=@0", [entry.id])).rejects.toThrow();
    await expect(db.query('UPDATE knowledge_entries SET version=0 WHERE id=@0', [entry.id])).rejects.toThrow();
    for (const [snapshotJson, sha256, author] of [['invalid', '0'.repeat(64), admin], ['{}', 'g'.repeat(64), admin], ['{}', '0'.repeat(64), randomUUID()]]) {
      await expect(db.query('INSERT INTO knowledge_revisions(entryId,version,snapshotJson,sha256,createdBy) VALUES(@0,99,@1,@2,@3)', [entry.id, snapshotJson, sha256, author])).rejects.toThrow();
    }
    expect((await store.history(admin, code)).total).toBe(3);
  });

  it('publishes, redrafts, archives and restores by appending snapshots instead of rewriting history', async () => {
    const lifecycleCode = 'lifecycle-' + randomUUID().slice(0, 8);
    await store.saveDraft(admin, lifecycleCode, null, draft());
    const published = await store.publish(admin, lifecycleCode, 1);
    expect(published).toMatchObject({ version: 2, status: 'published', snapshot: { status: 'published' } });
    const nextDraft = await store.saveDraft(admin, lifecycleCode, 2, { ...draft(), title: 'Bản sửa chưa duyệt' });
    expect(nextDraft.status).toBe('draft');
    expect((await store.history(admin, lifecycleCode)).items[1]).toMatchObject({ version: 2, sha256: published.sha256 });
    expect((await store.archive(admin, lifecycleCode, 3)).status).toBe('archived');
    await expect(store.publish(admin, lifecycleCode, 4)).rejects.toBeInstanceOf(ConflictException);
    const restored = await store.restore(admin, lifecycleCode, 4, 2);
    expect(restored).toMatchObject({ version: 5, status: 'draft', snapshot: { title: draft().title } });
    expect((await store.publish(admin, lifecycleCode, 5)).version).toBe(6);
    const history = await store.history(admin, lifecycleCode);
    expect(history.total).toBe(6); expect(history.items[4].sha256).toBe(published.sha256);
  });

  it('does not publish incomplete QA or increment its version when validation fails', async () => {
    const incompleteCode = 'incomplete-' + randomUUID().slice(0, 8);
    await store.saveDraft(admin, incompleteCode, null, { ...draft(), kind: 'qa', audience: 'grading_only', body: {} });
    await expect(store.publish(admin, incompleteCode, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect((await store.get(admin, incompleteCode))).toMatchObject({ status: 'draft', version: 1 });
    expect((await store.history(admin, incompleteCode)).total).toBe(1);
    await expect(store.restore(admin, incompleteCode, 1, 99)).rejects.toThrow('Không tìm thấy phiên bản nguồn.');
  });

  it('observes Admin role revocation on the next call, including history reads', async () => {
    await db.getRepository(UserRole).delete({ userId: admin });
    await expect(store.get(admin, code)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(store.history(admin, code)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(store.saveDraft(admin, code, 3, draft())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(store.publish(admin, code, 3)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(store.archive(admin, code, 3)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(store.restore(admin, code, 3, 1)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('knowledge Admin HTTP boundary', () => {
  let app: INestApplication, token: string, teacherToken: string, studentToken: string, teacherId: string;
  const password = 'Knowledge-E2e-123!';
  const base = '/api/v1/admin/knowledge', apiCode = 'http-' + randomUUID().slice(0, 8);
  const api = (accessToken = token) => ({
    get: (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${accessToken}`),
    post: (path: string) => request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${accessToken}`),
    put: (path: string) => request(app.getHttpServer()).put(path).set('Authorization', `Bearer ${accessToken}`),
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    const tokens: string[] = [];
    for (const roleCode of ['admin', 'instructor', 'intern']) {
      const id = randomUUID(), role = await db.getRepository(Role).findOneByOrFail({ code: roleCode });
      const user = await db.getRepository(User).save({ email: `${id}@knowledge.test`, username: id, displayName: 'Knowledge HTTP', passwordHash: await hash(password, 10), status: 'active' });
      await db.getRepository(UserRole).insert({ userId: user.id, roleId: role.id });
      if (roleCode === 'instructor') teacherId = user.id;
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.email, password }).expect(200); tokens.push(login.body.accessToken);
    }
    [token, teacherToken, studentToken] = tokens;
  }, 120000);
  afterAll(async () => { await app?.close(); });

  it('requires authentication and effective Admin privileges for every authoring path', async () => {
    await request(app.getHttpServer()).get(base).expect(401);
    for (const access of [teacherToken, studentToken]) {
      const client = api(access);
      await client.get(base).expect(403); await client.get(`${base}/${apiCode}`).expect(403);
      await client.get(`${base}/${apiCode}/revisions`).expect(403);
      await client.post(base).send({ code: apiCode, draft: draft() }).expect(403);
      await client.put(`${base}/${apiCode}`).send({ version: 1, draft: draft() }).expect(403);
      for (const action of ['publish', 'archive', 'restore']) await client.post(`${base}/${apiCode}/${action}`).send({ version: 1, ...(action === 'restore' ? { sourceVersion: 1 } : {}) }).expect(403);
      await client.post(`${base}/import/dry-run`).send({ entries: [{ code: apiCode, draft: draft() }] }).expect(403);
    }
  });

  it('does not turn knowledge permissions on another role into Admin access', async () => {
    const delegated = await db.getRepository(Role).save({ code: 'knowledge_' + randomUUID().slice(0, 8), name: 'Knowledge delegation QA', description: null });
    for (const code of ['knowledge.read', 'knowledge.manage', 'knowledge.publish']) {
      const permission = await db.getRepository(Permission).findOneByOrFail({ code });
      await db.getRepository(RolePermission).insert({ roleId: delegated.id, permissionId: permission.id });
    }
    await db.getRepository(UserRole).insert({ userId: teacherId, roleId: delegated.id });
    await api(teacherToken).get(base).expect(403);
    await api(teacherToken).post(base).send({ code: apiCode, draft: draft() }).expect(403);
    await api(teacherToken).post(`${base}/import/dry-run`).send({ entries: [{ code: apiCode, draft: draft() }] }).expect(403);
    await api(teacherToken).post(`${base}/${apiCode}/publish`).send({ version: 1 }).expect(403);
  });

  it('rejects extra authority fields, invalid nested data and unbounded pagination', async () => {
    await api().post(base).send({ code: apiCode, draft: draft(), status: 'published', actor: teacherId }).expect(400);
    await api().post(base).send({ code: apiCode, draft: { ...draft(), hidden: true } }).expect(400);
    await api().post(base).send({ code: apiCode, draft: { ...draft(), sources: [{ title: 'Source', url: 'file:///private' }] } }).expect(400);
    await api().get(`${base}?pageSize=99999`).expect(400);
    await api().get(`${base}?kind=anything`).expect(400);
  });

  it('exposes draft detail/history and literal search metadata without sending body in collections', async () => {
    const created = await api().post(base).send({ code: apiCode, draft: draft() }).expect(201);
    expect(created.body).toMatchObject({ code: apiCode, status: 'draft', version: 1 });
    await api().post(base).send({ code: apiCode, draft: draft() }).expect(409);
    expect((await api().get(`${base}/${apiCode}`).expect(200)).body.snapshot.body).toEqual(draft().body);
    const list = await api().get(`${base}?search=${apiCode}&status=draft&kind=guide&audience=student_safe&purpose=mentoring&roleCode=frontend&pageSize=1`).expect(200);
    expect(list.body).toMatchObject({ total: 1, pageSize: 1, items: [{ code: apiCode, version: 1, title: draft().title }] });
    expect(list.body.items[0]).not.toHaveProperty('body'); expect(list.body.items[0]).not.toHaveProperty('snapshot');
    expect((await api().get(`${base}?search=%25`).expect(200)).body.total).toBe(0);
    expect((await api().get(`${base}/${apiCode}/revisions`).expect(200)).body.total).toBe(1);
    await api().get(`${base}/not-existent`).expect(404);
  });

  it('checks every import row, distinguishes draft validity from publication and performs no mutations', async () => {
    const counts = () => db.query('SELECT (SELECT COUNT(*) FROM knowledge_entries) entries,(SELECT COUNT(*) FROM knowledge_revisions) revisions');
    const before = await counts(), duplicate = 'duplicate-' + randomUUID().slice(0, 8);
    const result = await api().post(`${base}/import/dry-run`).send({ entries: [
      { code: apiCode, draft: draft() },
      { code: 'incomplete-http', draft: { ...draft(), kind: 'qa', audience: 'grading_only', body: {} } },
      { code: 'bad-role', draft: { ...draft(), roleCodes: ['unknown_role'] } },
      { code: duplicate, draft: draft() }, { code: duplicate, draft: draft() },
      { code: 'extra-authority', draft: draft(), status: 'published' }, null,
    ] }).expect(200);
    expect(result.body).toMatchObject({ total: 7, validDrafts: 2, publishable: 1, mutationsPerformed: 0 });
    expect(result.body.items[0]).toMatchObject({ code: apiCode, exists: true, currentVersion: 1, validDraft: true, publishable: true });
    expect(result.body.items[1]).toMatchObject({ validDraft: true, publishable: false });
    expect(result.body.items[1].publicationIssues.length).toBeGreaterThan(0);
    for (const index of [2, 3, 4, 5, 6]) expect(result.body.items[index].issues.length).toBeGreaterThan(0);
    expect(await counts()).toEqual(before);
    await api().post(`${base}/import/dry-run`).send({ entries: Array.from({ length: 51 }, () => ({ code: apiCode, draft: draft() })) }).expect(400);
  });

  it('enforces lifecycle versions and records restoration without changing published history', async () => {
    const published = await api().post(`${base}/${apiCode}/publish`).send({ version: 1 }).expect(200);
    expect(published.body).toMatchObject({ status: 'published', version: 2 });
    await api().put(`${base}/${apiCode}`).send({ version: 1, draft: draft() }).expect(409);
    await api().post(`${base}/${apiCode}/archive`).send({ version: 2 }).expect(200);
    await api().post(`${base}/${apiCode}/publish`).send({ version: 3 }).expect(409);
    const restored = await api().post(`${base}/${apiCode}/restore`).send({ version: 3, sourceVersion: 2 }).expect(200);
    expect(restored.body).toMatchObject({ status: 'draft', version: 4 });
    const history = await api().get(`${base}/${apiCode}/revisions?pageSize=2&page=2`).expect(200);
    expect(history.body).toMatchObject({ total: 4, items: [{ version: 2, sha256: published.body.sha256 }, { version: 1 }] });
    const [audit] = await db.query("SELECT TOP(1) detail FROM audit_logs WHERE targetId=@0 AND action='knowledge.restored' ORDER BY createdAt DESC", [restored.body.id]);
    expect(JSON.parse(audit.detail).restoredFrom).toBe(2);
  });

  it('uses freshly resolved read and publication permissions rather than stale JWT claims', async () => {
    const role = await db.getRepository(Role).findOneByOrFail({ code: 'admin' });
    for (const code of ['knowledge.publish', 'knowledge.read']) {
      const permission = await db.getRepository(Permission).findOneByOrFail({ code });
      const grant = { roleId: role.id, permissionId: permission.id };
      await db.getRepository(RolePermission).delete(grant);
      try {
        await api().post(`${base}/${apiCode}/publish`).send({ version: 4 }).expect(403);
        if (code === 'knowledge.read') { await api().get(`${base}/${apiCode}`).expect(403); await api().post(base).send({ code: 'no-read', draft: draft() }).expect(403); }
      } finally { await db.getRepository(RolePermission).insert(grant); }
    }
    expect((await api().get(`${base}/${apiCode}`).expect(200)).body.version).toBe(4);
  });

  it('round-trips multiple valid answers, weighted rubric and provenance through the authenticated API', async () => {
    const qaCode = 'qa-' + randomUUID().slice(0, 8);
    const content: KnowledgeDraft = { ...draft(), kind: 'qa', title: 'Xử lý lỗi API bất đồng bộ', summary: 'Đánh giá cách xử lý thất bại và phản hồi rõ ràng cho người dùng.', audience: 'grading_only', purposes: ['interview_evaluation'], sources: [{ title: 'MDN Promise', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise' }], body: {
      question: 'Bạn xử lý lỗi của một yêu cầu API bất đồng bộ như thế nào?',
      expectedConcepts: ['Bắt lỗi', 'Phản hồi cho người dùng'],
      validAnswers: ['Dùng async/await và try/catch để lưu trạng thái lỗi có hướng xử lý tiếp.', 'Dùng Promise.catch và finally để hiện lỗi và kết thúc trạng thái loading.'],
      exampleAnswer: 'Dùng try/catch, báo lỗi phù hợp và cho phép thử lại; dọn loading trong finally.',
      commonMistakes: ['Bỏ qua lỗi rồi hiển thị thành công.'], followUps: ['Khi nào không nên tự động retry yêu cầu?'], weakAnswerExamples: ['Không cần bắt lỗi vì mạng thường ổn định.'],
      rubric: [{ criterion: 'Kiểm soát lỗi', description: 'Bắt và phân biệt nguyên nhân gây lỗi.', weight: 60 }, { criterion: 'Trải nghiệm', description: 'Thông báo thật và giữ khả năng thao tác tiếp.', weight: 40 }],
    } };
    await api().post(base).send({ code: qaCode, draft: content }).expect(201);
    const published = await api().post(`${base}/${qaCode}/publish`).send({ version: 1 }).expect(200);
    expect(published.body.snapshot).toMatchObject({ status: 'published', audience: 'grading_only', purposes: ['interview_evaluation'], sources: content.sources, body: content.body });
    const read = await api().get(`${base}/${qaCode}`).expect(200);
    expect(read.body.sha256).toBe(published.body.sha256); expect(read.body.snapshot.body.validAnswers).toHaveLength(2);
    await api(studentToken).get(`${base}/${qaCode}`).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/knowledge/${qaCode}`).set('Authorization', `Bearer ${studentToken}`).expect(404);
  });

  it('publishes discoverable OpenAPI fields and nested schemas rather than empty DTO objects', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Knowledge QA').setVersion('1').build());
    expect(document.paths[base].post).toBeDefined();
    const schemas = document.components?.schemas ?? {};
    expect(schemas.CreateKnowledgeDto).toMatchObject({ required: ['code', 'draft'], properties: { draft: { $ref: '#/components/schemas/KnowledgeDraftDto' } } });
    expect(schemas.KnowledgeDraftDto).toMatchObject({ required: expect.arrayContaining(['kind', 'audience', 'sources', 'body']), properties: { audience: { enum: ['student_safe', 'staff_only', 'grading_only'] }, body: { type: 'object' } } });
    expect(schemas.RestoreKnowledgeDto).toMatchObject({ required: expect.arrayContaining(['version', 'sourceVersion']) });
  });

  it('checks the saved publication state read-only without requiring authoring permissions or changing versions', async () => {
    const counts = () => db.query('SELECT (SELECT COUNT(*) FROM knowledge_entries) entries,(SELECT COUNT(*) FROM knowledge_revisions) revisions');
    const before = await counts();
    await request(app.getHttpServer()).get(`${base}/${apiCode}/publication-check`).expect(401);
    for (const access of [teacherToken, studentToken]) await api(access).get(`${base}/${apiCode}/publication-check`).expect(403);
    const role = await db.getRepository(Role).findOneByOrFail({ code: 'admin' }), permission = await db.getRepository(Permission).findOneByOrFail({ code: 'knowledge.manage' });
    const grant = { roleId: role.id, permissionId: permission.id };
    await db.getRepository(RolePermission).delete(grant);
    try {
      const result = await api().get(`${base}/${apiCode}/publication-check`).expect(200);
      expect(result.body).toMatchObject({ code: apiCode, currentVersion: 4, status: 'draft', publishable: true, issues: [] });
      expect(result.body.sha256).toMatch(/^[a-f0-9]{64}$/);
      await api().post(`${base}/import/dry-run`).send({ entries: [{ code: apiCode, draft: draft() }] }).expect(403);
      expect(await counts()).toEqual(before);
    } finally { await db.getRepository(RolePermission).insert(grant); }
    const incomplete = 'check-' + randomUUID().slice(0, 8);
    await api().post(base).send({ code: incomplete, draft: { ...draft(), kind: 'qa', audience: 'grading_only', body: {} } }).expect(201);
    const result = await api().get(`${base}/${incomplete}/publication-check`).expect(200);
    expect(result.body).toMatchObject({ currentVersion: 1, status: 'draft', publishable: false });
    expect(result.body.issues.length).toBeGreaterThan(0);
    expect((await api().get(`${base}/${incomplete}/revisions`).expect(200)).body.total).toBe(1);
  });
});
