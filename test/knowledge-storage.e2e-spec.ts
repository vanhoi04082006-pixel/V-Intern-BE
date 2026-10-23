import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
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

  it('observes Admin role revocation on the next call, including history reads', async () => {
    await db.getRepository(UserRole).delete({ userId: admin });
    await expect(store.get(admin, code)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(store.history(admin, code)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(store.saveDraft(admin, code, 3, draft())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
