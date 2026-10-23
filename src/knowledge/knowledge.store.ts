import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CareerRolesService } from '../career-roles/career-roles.service';
import { PermissionsService } from '../rbac/permissions.service';
import { KnowledgeEntry } from './entities/knowledge-entry.entity';
import { KnowledgeRevision } from './entities/knowledge-revision.entity';
import { KnowledgeDraft, KnowledgeSnapshot } from './knowledge.contracts';
import { normalizeKnowledgeDraft, serializeKnowledgeSnapshot } from './knowledge.policy';

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
  async saveDraft(actor: string, code: string, expectedVersion: number | null, input: KnowledgeDraft) {
    await this.authorize(actor); this.code(code);
    if (expectedVersion !== null && (!Number.isInteger(expectedVersion) || expectedVersion < 1 || expectedVersion > 2147483646)) throw new BadRequestException('Version tri thức không hợp lệ.');
    const content = normalizeKnowledgeDraft(input);
    return this.db.transaction(async em => {
      const [current]: KnowledgeEntry[] = await em.query('SELECT * FROM knowledge_entries WITH(UPDLOCK,HOLDLOCK) WHERE code=@0', [code]);
      if (current ? current.version !== expectedVersion : expectedVersion !== null) {
        throw new ConflictException({ code: 'KNOWLEDGE_VERSION_CONFLICT', message: 'Tri thức đã thay đổi hoặc chưa tồn tại. Hãy tải lại trước khi lưu.', details: { currentVersion: current?.version ?? null } });
      }
      for (const roleCode of [...content.roleCodes].sort()) await this.careers.requireRole(roleCode, em);
      const id = current?.id ?? randomUUID(), version = (current?.version ?? 0) + 1;
      const snapshot = serializeKnowledgeSnapshot(code, version, 'draft', content);
      const entries = em.getRepository(KnowledgeEntry);
      if (current) await entries.update({ id }, { version, status: 'draft' });
      else await entries.insert({ id, code, version, status: 'draft' });
      await em.insert(KnowledgeRevision, { entryId: id, version, ...snapshot, createdBy: actor });
      await em.insert(AuditLog, {
        actorId: actor, action: 'knowledge.draft_saved', targetType: 'knowledge_entry', targetId: id,
        detail: JSON.stringify({ code, version, sha256: snapshot.sha256 }), ip: null, userAgent: null,
      });
      return { id: id.toLowerCase(), code, version, status: 'draft' as const, snapshot: JSON.parse(snapshot.snapshotJson) as KnowledgeSnapshot, sha256: snapshot.sha256 };
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

  async history(actor: string, code: string, page = 1, pageSize = 20) {
    await this.authorize(actor); this.code(code);
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new BadRequestException('Phân trang tri thức không hợp lệ.');
    const entry = await this.db.getRepository(KnowledgeEntry).findOneBy({ code });
    if (!entry) throw new NotFoundException('Không tìm thấy tri thức.');
    const [rows, total] = await this.db.getRepository(KnowledgeRevision).findAndCount({ where: { entryId: entry.id }, order: { version: 'DESC' }, skip: (page - 1) * pageSize, take: pageSize });
    return { items: rows.map(row => ({ version: row.version, snapshot: this.decode(row), sha256: row.sha256, createdBy: row.createdBy, createdAt: row.createdAt })), total, page, pageSize };
  }
}
