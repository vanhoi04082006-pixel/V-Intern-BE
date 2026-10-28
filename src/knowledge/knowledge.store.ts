import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CareerRolesService } from '../career-roles/career-roles.service';
import { PermissionsService } from '../rbac/permissions.service';
import { KnowledgeEntry } from './entities/knowledge-entry.entity';
import { KnowledgeRevision } from './entities/knowledge-revision.entity';
import { KnowledgeDraft, KnowledgeListQuery, KnowledgeSnapshot, KnowledgeStatus } from './knowledge.contracts';
import { normalizeKnowledgeDraft, serializeKnowledgeSnapshot } from './knowledge.policy';
import { validateKnowledgePublication } from './knowledge-publication.policy';

/** Internal authoring port. HTTP publication and Agent retrieval are separate capabilities. */
@Injectable()
export class KnowledgeStore {
  constructor(private readonly db: DataSource, private readonly permissions: PermissionsService, private readonly careers: CareerRolesService) {}

  private async authorize(actor: string) {
    if (!await this.permissions.hasRole(actor, 'admin')) throw new ForbiddenException('Chỉ quản trị viên được truy cập kho tri thức biên soạn.');
  }
  private code(value: string) {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{1,79}$/.test(value)) throw new BadRequestException('Mã tri thức không hợp lệ.');
  }
  private decode(row: KnowledgeRevision): KnowledgeSnapshot {
    if (createHash('sha256').update(row.snapshotJson, 'utf8').digest('hex') !== row.sha256) {
      throw new InternalServerErrorException({ code: 'KNOWLEDGE_INTEGRITY_ERROR', message: 'Không thể xác minh phiên bản tri thức. Hãy liên hệ quản trị viên.' });
    }
    return JSON.parse(row.snapshotJson) as KnowledgeSnapshot;
  }
  private assertVersion(current: KnowledgeEntry | undefined, expectedVersion: number | null) {
    if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > 2147483646)) throw new BadRequestException('Version tri thức không hợp lệ.');
    if (current ? current.version !== expectedVersion : expectedVersion !== null) {
      throw new ConflictException({ code: 'KNOWLEDGE_VERSION_CONFLICT', message: 'Tri thức đã thay đổi hoặc chưa tồn tại. Hãy tải lại trước khi lưu.', details: { currentVersion: current?.version ?? null } });
    }
  }
  private async append(em: EntityManager, actor: string, code: string, current: KnowledgeEntry | undefined, content: KnowledgeDraft, status: KnowledgeStatus, action: string, restoredFrom?: number) {
    for (const roleCode of [...content.roleCodes].sort()) await this.careers.requireRole(roleCode, em);
    const id = current?.id ?? randomUUID(), version = (current?.version ?? 0) + 1;
    const snapshot = serializeKnowledgeSnapshot(code, version, status, content);
    const entries = em.getRepository(KnowledgeEntry);
    if (current) await entries.update({ id }, { version, status });
    else await entries.insert({ id, code, version, status });
    await em.insert(KnowledgeRevision, { entryId: id, version, ...snapshot, createdBy: actor });
    await em.insert(AuditLog, {
      actorId: actor, action, targetType: 'knowledge_entry', targetId: id,
      detail: JSON.stringify({ code, version, sha256: snapshot.sha256, ...(restoredFrom === undefined ? {} : { restoredFrom }) }), ip: null, userAgent: null,
    });
    return { id: id.toLowerCase(), code, version, status, snapshot: JSON.parse(snapshot.snapshotJson) as KnowledgeSnapshot, sha256: snapshot.sha256 };
  }
  async saveDraft(actor: string, code: string, expectedVersion: number | null, input: KnowledgeDraft) {
    await this.authorize(actor); this.code(code);
    const content = normalizeKnowledgeDraft(input);
    return this.db.transaction(async em => {
      const [current]: KnowledgeEntry[] = await em.query('SELECT * FROM knowledge_entries WITH(UPDLOCK,HOLDLOCK) WHERE code=@0', [code]);
      this.assertVersion(current, expectedVersion);
      return this.append(em, actor, code, current, content, 'draft', 'knowledge.draft_saved');
    });
  }

  async publish(actor: string, code: string, expectedVersion: number) { return this.changeStatus(actor, code, expectedVersion, 'published'); }
  async archive(actor: string, code: string, expectedVersion: number) { return this.changeStatus(actor, code, expectedVersion, 'archived'); }
  private async changeStatus(actor: string, code: string, expectedVersion: number, status: 'published' | 'archived') {
    await this.authorize(actor); this.code(code);
    return this.db.transaction(async em => {
      const [current]: KnowledgeEntry[] = await em.query('SELECT * FROM knowledge_entries WITH(UPDLOCK,HOLDLOCK) WHERE code=@0', [code]);
      this.assertVersion(current, expectedVersion);
      if (!current) throw new NotFoundException('Không tìm thấy tri thức.');
      if (current.status === status) throw new ConflictException({ code: 'KNOWLEDGE_INVALID_TRANSITION', message: status === 'published' ? 'Phiên bản hiện tại đã được xuất bản.' : 'Tri thức này đã được lưu trữ.' });
      if (status === 'published' && current.status !== 'draft') throw new ConflictException({ code: 'KNOWLEDGE_INVALID_TRANSITION', message: 'Hãy khôi phục thành bản nháp và kiểm tra nội dung trước khi xuất bản lại.' });
      const row = await em.getRepository(KnowledgeRevision).findOneByOrFail({ entryId: current.id, version: current.version });
      const content = normalizeKnowledgeDraft(this.decode(row));
      if (status === 'published') validateKnowledgePublication(content);
      return this.append(em, actor, code, current, content, status, `knowledge.${status}`);
    });
  }
  async restore(actor: string, code: string, expectedVersion: number, sourceVersion: number) {
    await this.authorize(actor); this.code(code);
    if (!Number.isInteger(sourceVersion) || sourceVersion < 1 || sourceVersion > 2147483646) throw new BadRequestException('Phiên bản nguồn không hợp lệ.');
    return this.db.transaction(async em => {
      const [current]: KnowledgeEntry[] = await em.query('SELECT * FROM knowledge_entries WITH(UPDLOCK,HOLDLOCK) WHERE code=@0', [code]);
      this.assertVersion(current, expectedVersion);
      if (!current) throw new NotFoundException('Không tìm thấy tri thức.');
      const row = await em.getRepository(KnowledgeRevision).findOneBy({ entryId: current.id, version: sourceVersion });
      if (!row) throw new NotFoundException('Không tìm thấy phiên bản nguồn.');
      return this.append(em, actor, code, current, normalizeKnowledgeDraft(this.decode(row)), 'draft', 'knowledge.restored', sourceVersion);
    });
  }

  async get(actor: string, code: string) {
    await this.authorize(actor); this.code(code);
    // One statement sees the current pointer and its immutable snapshot together.
    const [row]: Array<KnowledgeRevision & { id: string; code: string; status: string; updatedAt: Date }> = await this.db.query(`
      SELECT e.id,e.code,e.status,e.updatedAt,r.entryId,r.version,r.snapshotJson,r.sha256,r.createdBy,r.createdAt
      FROM knowledge_entries e JOIN knowledge_revisions r ON r.entryId=e.id AND r.version=e.version WHERE e.code=@0`, [code]);
    if (!row) throw new NotFoundException('Không tìm thấy tri thức.');
    const snapshot = this.decode(row);
    if (snapshot.code !== row.code || snapshot.version !== row.version || snapshot.status !== row.status) throw new InternalServerErrorException('Phiên bản tri thức không nhất quán.');
    return { id: row.id.toLowerCase(), code: row.code, version: row.version, status: row.status, snapshot, sha256: row.sha256, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  async list(actor: string, q: KnowledgeListQuery) {
    await this.authorize(actor);
    const query = this.db.getRepository(KnowledgeEntry).createQueryBuilder('entry')
      .innerJoin(KnowledgeRevision, 'revision', 'revision.entryId=entry.id AND revision.version=entry.version');
    if (q.status) query.andWhere('entry.status=:status', { status: q.status });
    if (q.kind) query.andWhere("JSON_VALUE(revision.snapshotJson,'$.kind')=:kind", { kind: q.kind });
    if (q.audience) query.andWhere("JSON_VALUE(revision.snapshotJson,'$.audience')=:audience", { audience: q.audience });
    if (q.purpose) query.andWhere("EXISTS(SELECT 1 FROM OPENJSON(revision.snapshotJson,'$.purposes') purpose WHERE purpose.[value]=:purpose)", { purpose: q.purpose });
    if (q.roleCode) query.andWhere("EXISTS(SELECT 1 FROM OPENJSON(revision.snapshotJson,'$.roleCodes') career WHERE career.[value]=:roleCode)", { roleCode: q.roleCode });
    if (q.search) query.andWhere("(CHARINDEX(:search,entry.code)>0 OR CHARINDEX(:search,JSON_VALUE(revision.snapshotJson,'$.title'))>0)", { search: q.search });
    const total = await query.getCount();
    const rows = await query.select(['entry.id AS id', 'entry.code AS code', 'entry.version AS version', 'entry.status AS status', 'entry.updatedAt AS updatedAt', 'revision.snapshotJson AS snapshotJson', 'revision.sha256 AS sha256'])
      .orderBy('entry.updatedAt', 'DESC').addOrderBy('entry.code', 'ASC').offset((q.page - 1) * q.pageSize).limit(q.pageSize)
      .getRawMany<KnowledgeRevision & { id: string; code: string; status: KnowledgeStatus; updatedAt: Date }>();
    return { items: rows.map(row => {
      const snapshot = this.decode(row);
      return { id: row.id.toLowerCase(), code: row.code, version: row.version, status: row.status, updatedAt: row.updatedAt, sha256: row.sha256,
        title: snapshot.title, summary: snapshot.summary, kind: snapshot.kind, language: snapshot.language, difficulty: snapshot.difficulty,
        audience: snapshot.audience, purposes: snapshot.purposes, roleCodes: snapshot.roleCodes, tags: snapshot.tags };
    }), total, page: q.page, pageSize: q.pageSize };
  }

  async checkPublication(actor: string, code: string) {
    const document = await this.get(actor, code), issues: string[] = [];
    if (document.status !== 'draft') issues.push(document.status === 'published' ? 'Phiên bản hiện tại đã được xuất bản.' : 'Khôi phục thành bản nháp trước khi xuất bản lại.');
    try { validateKnowledgePublication(document.snapshot); }
    catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      const body = error.getResponse();
      issues.push(typeof body === 'object' && body && 'message' in body && typeof body.message === 'string' ? body.message : 'Nội dung chưa đủ điều kiện xuất bản.');
    }
    return { code: document.code, currentVersion: document.version, status: document.status, sha256: document.sha256, publishable: issues.length === 0, issues };
  }

  async history(actor: string, code: string, page = 1, pageSize = 20) {
    await this.authorize(actor); this.code(code);
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new BadRequestException('Phân trang tri thức không hợp lệ.');
    const entry = await this.db.getRepository(KnowledgeEntry).findOneBy({ code });
    if (!entry) throw new NotFoundException('Không tìm thấy tri thức.');
    const [rows, total] = await this.db.getRepository(KnowledgeRevision).findAndCount({ where: { entryId: entry.id }, order: { version: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize });
    return { items: rows.map(row => ({ version: row.version, snapshot: this.decode(row), sha256: row.sha256, createdBy: row.createdBy, createdAt: row.createdAt })), total, page, pageSize };
  }
}
