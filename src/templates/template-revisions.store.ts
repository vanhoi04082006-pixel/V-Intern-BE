import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { User } from '../users/entities/user.entity';
import { publicTemplateDefinition, type TemplateAssessment } from './template-package';

export const templateContentHash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const integrity = (): never => { throw new InternalServerErrorException({ code: 'TEMPLATE_REVISION_INTEGRITY', message: 'Không thể xác minh phiên bản mẫu.' }); };
/** Trusted persistence port shared by API writes and the preserving bundled seed. No file execution. */
export async function appendTemplateRevision(em: EntityManager, templateId: string, version: number, definitionJson: string, actor: string | null, assessment?: TemplateAssessment | null) {
  const hash = templateContentHash(definitionJson);
  const [old]: Array<{ sha256: string }> = await em.query('SELECT sha256 FROM project_template_revisions WITH(UPDLOCK,HOLDLOCK) WHERE templateId=@0 AND version=@1', [templateId, version]);
  if (old) {
    if (old.sha256 !== hash) throw new ConflictException({ code: 'TEMPLATE_REVISION_CONFLICT', message: 'Nội dung đã lưu cho phiên bản này không được ghi đè.' });
    return;
  }
  await em.query('INSERT INTO project_template_revisions(templateId,version,definitionJson,sha256,createdById) VALUES(@0,@1,@2,@3,@4)', [templateId, version, definitionJson, hash, actor]);
  if (assessment) {
    const json = JSON.stringify(assessment);
    await em.query('INSERT INTO project_template_assessments(templateId,version,assessmentJson,sha256) VALUES(@0,@1,@2,@3)', [templateId, version, json, templateContentHash(json)]);
  }
}
export async function storedTemplateAssessment(em: EntityManager, templateId: string, version: number): Promise<TemplateAssessment | null> {
  const [row]: Array<{ assessmentJson: string; sha256: string }> = await em.query('SELECT assessmentJson,sha256 FROM project_template_assessments WHERE templateId=@0 AND version=@1', [templateId, version]);
  if (!row) return null;
  if (templateContentHash(row.assessmentJson) !== row.sha256) integrity();
  return JSON.parse(row.assessmentJson) as TemplateAssessment;
}
@Injectable()
export class TemplateRevisionsStore {
  constructor(private readonly db: DataSource, private readonly permissions: PermissionsService) {}
  async authorizeAssessment(actor: string, mode: 'read' | 'manage') {
    const user = await this.db.getRepository(User).findOneBy({ id: actor, status: 'active' });
    if (!user || (!await this.permissions.hasRole(actor, 'admin') && !await this.permissions.hasRole(actor, 'instructor'))
      || !(await this.permissions.getEffectivePermissionCodes(actor)).has(`templates.assessment.${mode}`)) throw new ForbiddenException('Chỉ giảng viên/quản trị được cấp quyền mới được truy cập tài liệu chấm.');
  }
  async history(id: string, page = 1, pageSize = 20) {
    await this.exists(id);
    const [row]: Array<{ count: number }> = await this.db.query('SELECT COUNT(*) count FROM project_template_revisions WHERE templateId=@0', [id]);
    const items: Array<{ version: number; sha256: string; createdAt: Date }> = await this.db.query('SELECT version,sha256,createdAt FROM project_template_revisions WHERE templateId=@0 ORDER BY version DESC OFFSET @1 ROWS FETCH NEXT @2 ROWS ONLY', [id, (page - 1) * pageSize, pageSize]);
    return { items, total: Number(row.count), page, pageSize };
  }
  async revision(id: string, version: number) {
    if (!Number.isSafeInteger(version) || version < 1 || version > 2147483647) throw new BadRequestException('Phiên bản phải là số nguyên dương hợp lệ.');
    const [row]: Array<{ definitionJson: string; sha256: string; createdAt: Date }> = await this.db.query('SELECT definitionJson,sha256,createdAt FROM project_template_revisions WHERE templateId=@0 AND version=@1', [id, version]);
    if (!row) throw new NotFoundException('Không tìm thấy phiên bản mẫu.');
    if (templateContentHash(row.definitionJson) !== row.sha256) integrity();
    return { version, sha256: row.sha256, createdAt: row.createdAt, definition: publicTemplateDefinition(JSON.parse(row.definitionJson) as object) };
  }
  private async exists(id: string) {
    const [row]: Array<{ version: number }> = await this.db.query('SELECT version FROM project_templates WHERE id=@0', [id]);
    if (!row) throw new NotFoundException('Không tìm thấy mẫu dự án.'); return row;
  }
  async assessment(id: string, actor: string, version?: number) {
    await this.authorizeAssessment(actor, 'read');
    const current = await this.exists(id), target = version ?? current.version;
    await this.revision(id, target);
    return { version: target, assessment: await storedTemplateAssessment(this.db.manager, id, target) };
  }
}
