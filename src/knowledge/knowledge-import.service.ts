import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { CareerRolesService } from '../career-roles/career-roles.service';
import { KnowledgeEntry } from './entities/knowledge-entry.entity';
import { CreateKnowledgeDto } from './knowledge.dto';
import { normalizeKnowledgeDraft } from './knowledge.policy';
import { validateKnowledgePublication } from './knowledge-publication.policy';

function messages(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap(error => [...Object.values(error.constraints ?? {}).map(message => `${prefix}${error.property}: ${message}`), ...messages(error.children ?? [], `${prefix}${error.property}.`)]).slice(0, 20);
}
function issue(error: BadRequestException): string {
  const body = error.getResponse();
  return typeof body === 'object' && body && 'message' in body && typeof body.message === 'string' ? body.message : 'Nội dung chưa hợp lệ.';
}
@Injectable()
export class KnowledgeImportService {
  constructor(private readonly db: DataSource, private readonly permissions: PermissionsService, private readonly careers: CareerRolesService) {}
  async dryRun(actor: string, entries: unknown[]) {
    if (!await this.permissions.hasRole(actor, 'admin')) throw new ForbiddenException('Chỉ quản trị viên được kiểm tra import tri thức.');
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 50) throw new BadRequestException('Mỗi lượt kiểm tra cần 1–50 mục.');
    const counts = new Map<string, number>();
    for (const row of entries) {
      if (row && typeof row === 'object' && 'code' in row && typeof row.code === 'string') { const code = row.code.trim(); counts.set(code, (counts.get(code) ?? 0) + 1); }
    }
    const items: Array<{ index: number; code: string | null; validDraft: boolean; publishable: boolean; exists: boolean; currentVersion: number | null; issues: string[]; publicationIssues: string[] }> = [];
    for (const [index, raw] of entries.entries()) {
      const row = { index, code: null as string | null, validDraft: false, publishable: false, exists: false, currentVersion: null as number | null, issues: [] as string[], publicationIssues: [] as string[] };
      items.push(row);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { row.issues.push('Mỗi hàng cần object {code,draft}.'); continue; }
      const dto = plainToInstance(CreateKnowledgeDto, raw);
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      if (errors.length) { row.issues = messages(errors); continue; }
      row.code = dto.code;
      if ((counts.get(dto.code) ?? 0) > 1) { row.issues.push('Mã bị trùng trong lô import.'); continue; }
      try {
        const draft = normalizeKnowledgeDraft(dto.draft);
        for (const roleCode of [...draft.roleCodes].sort()) await this.careers.requireRole(roleCode);
        const existing = await this.db.getRepository(KnowledgeEntry).findOneBy({ code: dto.code });
        row.exists = !!existing; row.currentVersion = existing?.version ?? null; row.validDraft = true;
        try { validateKnowledgePublication(draft); row.publishable = true; }
        catch (error) { if (!(error instanceof BadRequestException)) throw error; row.publicationIssues.push(issue(error)); }
      } catch (error) { if (!(error instanceof BadRequestException)) throw error; row.issues.push(issue(error)); }
    }
    return { total: items.length, validDrafts: items.filter(row => row.validDraft).length, publishable: items.filter(row => row.publishable).length, mutationsPerformed: 0, items };
  }
}
