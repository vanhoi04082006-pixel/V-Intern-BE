import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { PermissionsService } from '../rbac/permissions.service';
import { CareerRoleContentDto, CareerRolePageDto, CareerRoleQueryDto, CreateCareerRoleDto, UpdateCareerRoleDto } from './career-role.dto';
import { CareerRole } from './entities/career-role.entity';
import { CareerRoleRevision } from './entities/career-role-revision.entity';

function snapshot(row: CareerRole) {
  return {
    code: row.code, name: row.name, description: row.description, level: row.level, language: row.language,
    requiredSkills: JSON.parse(row.requiredSkillsJson) as string[], optionalSkills: JSON.parse(row.optionalSkillsJson) as string[],
    competencyWeights: JSON.parse(row.competencyWeightsJson) as Record<string, number>,
    status: row.status, acceptingApplications: row.acceptingApplications, version: row.version,
  };
}
function view(row: CareerRole) { return { ...snapshot(row), createdAt: row.createdAt, updatedAt: row.updatedAt }; }

/** Governs career data only. RBAC grants remain owned by PermissionsService. */
@Injectable()
export class CareerRolesService {
  constructor(private readonly db: DataSource, private readonly permissions: PermissionsService) {}

  private async authorize(actor: string) {
    if (!await this.permissions.hasRole(actor, 'admin')) throw new ForbiddenException('Chỉ quản trị viên được thay đổi thư viện nghề nghiệp.');
  }

  async list(actor: string, q: CareerRoleQueryDto) {
    await this.authorize(actor);
    const query = this.db.getRepository(CareerRole).createQueryBuilder('role');
    if (q.status) query.andWhere('role.status=:status', { status: q.status });
    if (q.search) query.andWhere('(CHARINDEX(:search,role.code)>0 OR CHARINDEX(:search,role.name)>0)', { search: q.search });
    const [rows, total] = await query.orderBy('role.name', 'ASC').addOrderBy('role.code', 'ASC').skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
    return { items: rows.map(view), total, page: q.page, pageSize: q.pageSize };
  }

  async get(actor: string, code: string) {
    await this.authorize(actor);
    const row = await this.db.getRepository(CareerRole).findOneBy({ code });
    if (!row) throw new NotFoundException('Không tìm thấy nghề nghiệp.');
    return view(row);
  }

  async revisions(actor: string, code: string, q: CareerRolePageDto) {
    await this.get(actor, code);
    const [rows, total] = await this.db.getRepository(CareerRoleRevision).findAndCount({ where: { roleCode: code }, order: { version: 'DESC' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize });
    return { items: rows.map(row => ({ version: row.version, snapshot: JSON.parse(row.snapshotJson) as unknown, createdBy: row.createdBy, createdAt: row.createdAt })), total, page: q.page, pageSize: q.pageSize };
  }

  async listRecruiting() {
    const rows = await this.db.getRepository(CareerRole).find({ where: { status: 'published', acceptingApplications: true }, order: { name: 'ASC', code: 'ASC' } });
    return { items: rows.map(row => ({ code: row.code, label: row.name, description: row.description, level: row.level, language: row.language, requiredSkills: JSON.parse(row.requiredSkillsJson) as string[], optionalSkills: JSON.parse(row.optionalSkillsJson) as string[], version: row.version })) };
  }

  async requireRole(code: string, em: EntityManager = this.db.manager, recruiting = false) {
    // A held shared lock serializes eligibility with admin archive/publication.
    const [row]: CareerRole[] = await em.query('SELECT * FROM career_roles WITH(HOLDLOCK) WHERE code=@0', [code]);
    if (!row) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Mã nghề nghiệp không tồn tại trong thư viện.' });
    if (recruiting && (row.status !== 'published' || !row.acceptingApplications)) {
      throw new ConflictException({ code: 'CAREER_ROLE_NOT_RECRUITING', message: 'Nghề nghiệp này đang đóng nhận hồ sơ. Hãy chọn vị trí đang tuyển hoặc liên hệ quản trị viên.' });
    }
    return row;
  }

  async label(code: string) {
    const row = await this.db.getRepository(CareerRole).findOneBy({ code });
    return row?.name ?? code;
  }

  private validateContent(input: CareerRoleContentDto, publishing: boolean) {
    const skills = [...input.requiredSkills, ...input.optionalSkills].map(s => s.toLocaleLowerCase('vi'));
    if (new Set(skills).size !== skills.length) throw new BadRequestException('Kỹ năng bắt buộc và tùy chọn không được trùng nhau.');
    const weights = Object.entries(input.competencyWeights);
    if (weights.some(([skill, weight]) => !input.requiredSkills.includes(skill) || !Number.isInteger(weight) || weight < 1 || weight > 100)
      || (weights.length > 0 && (weights.length !== input.requiredSkills.length || weights.reduce((sum, [, weight]) => sum + weight, 0) !== 100))) {
      throw new BadRequestException('Trọng số phải bao phủ kỹ năng bắt buộc, là số nguyên dương và có tổng bằng 100.');
    }
    if (publishing && (input.description.length < 20 || input.requiredSkills.length === 0 || weights.length === 0)) {
      throw new BadRequestException('Trước khi xuất bản, cần mô tả ít nhất 20 ký tự, kỹ năng bắt buộc và trọng số năng lực.');
    }
  }

  private async lock(em: EntityManager, code: string) {
    // HOLDLOCK also protects a missing primary-key range during concurrent creation.
    await em.query('SELECT code FROM career_roles WITH(UPDLOCK,HOLDLOCK) WHERE code=@0', [code]);
    return em.getRepository(CareerRole).findOneBy({ code });
  }

  private assertVersion(row: CareerRole, expected: number) {
    if (row.version !== expected) throw new ConflictException({ code: 'CAREER_ROLE_VERSION_CONFLICT', message: 'Nghề nghiệp đã được cập nhật. Hãy tải lại trước khi lưu.', details: { currentVersion: row.version } });
  }

  private async record(em: EntityManager, row: CareerRole, actor: string, action: string) {
    await em.insert(CareerRoleRevision, { roleCode: row.code, version: row.version, snapshotJson: JSON.stringify(snapshot(row)), createdBy: actor });
    await em.insert(AuditLog, { actorId: actor, action, targetType: 'career_role', targetId: row.code, detail: JSON.stringify({ version: row.version, status: row.status, acceptingApplications: row.acceptingApplications }), ip: null, userAgent: null });
  }

  async create(actor: string, input: CreateCareerRoleDto) {
    await this.authorize(actor); this.validateContent(input, false);
    return this.db.transaction(async em => {
      if (await this.lock(em, input.code)) throw new ConflictException({ code: 'CAREER_ROLE_CODE_EXISTS', message: 'Mã nghề nghiệp đã tồn tại; hãy dùng mã khác hoặc cập nhật bản hiện có.' });
      const row = await em.getRepository(CareerRole).save({ code: input.code, name: input.name, description: input.description, level: input.level, language: input.language, requiredSkillsJson: JSON.stringify(input.requiredSkills), optionalSkillsJson: JSON.stringify(input.optionalSkills), competencyWeightsJson: JSON.stringify(input.competencyWeights), status: 'draft', acceptingApplications: false, version: 1 });
      await this.record(em, row, actor, 'career_role.created');
      return view(row);
    });
  }

  async update(actor: string, code: string, input: UpdateCareerRoleDto) {
    await this.authorize(actor); this.validateContent(input, input.status === 'published');
    if (input.acceptingApplications && input.status !== 'published') throw new BadRequestException('Chỉ nghề nghiệp đã xuất bản mới được nhận hồ sơ.');
    return this.db.transaction(async em => {
      const row = await this.lock(em, code);
      if (!row) throw new NotFoundException('Không tìm thấy nghề nghiệp.');
      this.assertVersion(row, input.version);
      Object.assign(row, { name: input.name, description: input.description, level: input.level, language: input.language, requiredSkillsJson: JSON.stringify(input.requiredSkills), optionalSkillsJson: JSON.stringify(input.optionalSkills), competencyWeightsJson: JSON.stringify(input.competencyWeights), status: input.status, acceptingApplications: input.acceptingApplications, version: row.version + 1 });
      await em.save(row); await this.record(em, row, actor, 'career_role.updated');
      return view(row);
    });
  }

  async archive(actor: string, code: string, version: number) {
    await this.authorize(actor);
    return this.db.transaction(async em => {
      const row = await this.lock(em, code);
      if (!row) throw new NotFoundException('Không tìm thấy nghề nghiệp.');
      this.assertVersion(row, version);
      row.status = 'archived'; row.acceptingApplications = false; row.version += 1;
      await em.save(row); await this.record(em, row, actor, 'career_role.archived');
      return view(row);
    });
  }
}
