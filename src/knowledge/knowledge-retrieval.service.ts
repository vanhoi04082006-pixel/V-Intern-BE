import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { projectScope } from '../rbac/ownership';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { InterviewSession } from '../recruitment/entities/interview-session.entity';
import { CareerRole } from '../career-roles/entities/career-role.entity';
import type { KnowledgeSnapshot } from './knowledge.contracts';
import { allowedKnowledge, packKnowledge, retrievalPolicy, retrievalQuery, type KnowledgeConsumer, type RetrievalCandidate, type RetrievalPolicy } from './knowledge-retrieval.policy';

export interface KnowledgeTarget { projectId?: string; interviewId?: string; roleCode?: string }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const deny = (): never => { throw new ForbiddenException('Không được đọc tri thức trong phạm vi này.'); };

/** Internal server port. Models receive a query-only tool, never this actor/consumer/target interface. */
@Injectable()
export class KnowledgeRetrievalService {
  constructor(private readonly db: DataSource, private readonly permissions: PermissionsService) {}

  async resolve(actorId: string, consumer: KnowledgeConsumer, target: KnowledgeTarget = {}) {
    const policy = retrievalPolicy(consumer);
    if (!uuid(actorId)) deny();
    const user = await this.db.getRepository(User).findOne({ where: { id: actorId }, select: { id: true, status: true } });
    if (!user || user.status !== 'active') deny();
    const [permissions, isAdmin, isInstructor, isIntern] = await Promise.all([
      this.permissions.getEffectivePermissionCodes(actorId), this.permissions.hasRole(actorId, 'admin'),
      this.permissions.hasRole(actorId, 'instructor'), this.permissions.hasRole(actorId, 'intern'),
    ]);
    if (!permissions.has(policy.permission)) deny();
    const keys = Object.keys(target);
    const expected = policy.resource === 'catalog' ? ['roleCode'] : policy.resource === 'interview' ? ['interviewId'] : ['projectId'];
    if (keys.some(key => !expected.includes(key))) throw new BadRequestException('Scope tri thức có trường không được phép.');
    let roleCodes: string[] = [];
    if (policy.resource === 'catalog') {
      if (!isAdmin) deny();
      if (target.roleCode !== undefined) {
        if (!/^[a-z][a-z0-9_]{1,31}$/.test(target.roleCode)) throw new BadRequestException('Mã nghề không hợp lệ.');
        const role = await this.db.getRepository(CareerRole).findOneBy({ code: target.roleCode, status: 'published' });
        if (!role) throw new NotFoundException('Không tìm thấy nghề đã xuất bản.');
        roleCodes = [role.code];
      }
    } else if (policy.resource === 'interview') {
      if (!uuid(target.interviewId)) throw new BadRequestException('Cần buổi phỏng vấn hợp lệ.');
      if (consumer === 'interview-evaluator' ? !isAdmin : !isIntern) deny();
      const interview = await this.db.getRepository(InterviewSession).findOneBy({ id: target.interviewId });
      if (!interview || (!isAdmin && interview.userId.toLowerCase() !== actorId.toLowerCase())) throw new NotFoundException('Không tìm thấy buổi phỏng vấn.');
      roleCodes = [interview.roleCode];
    } else if (policy.resource === 'project') {
      if (!isAdmin && !isInstructor) deny();
      if (!uuid(target.projectId)) throw new BadRequestException('Cần dự án hợp lệ.');
      const query = this.db.getRepository(Project).createQueryBuilder('project').where('project.id=:projectId', { projectId: target.projectId });
      const scope = projectScope('project', { userId: actorId, isAdmin });
      if (scope) query.andWhere(scope.clause, scope.params);
      if (!await query.getOne()) throw new NotFoundException('Không tìm thấy dự án.');
      const rows: Array<{ roleCode: string }> = await this.db.query('SELECT roleCode FROM project_role_slots WHERE projectId=@0', [target.projectId]);
      roleCodes = rows.map(row => row.roleCode);
    } else {
      if (!isIntern) deny();
      const profile = await this.db.getRepository(RecruitmentProfile).findOneBy({ userId: actorId });
      roleCodes = profile?.selectedRole ? [profile.selectedRole] : [];
      if (target.projectId !== undefined) {
        if (!uuid(target.projectId)) throw new BadRequestException('Dự án không hợp lệ.');
        const rows: Array<{ roleCode: string | null }> = await this.db.query(`SELECT pm.roleInProject roleCode FROM assignments a
          LEFT JOIN project_members pm ON pm.projectId=a.projectId AND pm.userId=a.internId
          WHERE a.internId=@0 AND a.projectId=@1 AND a.status='active'`, [actorId, target.projectId]);
        if (!rows.length) throw new NotFoundException('Không tìm thấy dự án của bạn.');
        roleCodes = rows.flatMap(row => row.roleCode ? [row.roleCode] : []);
      }
    }
    return { policy, roleCodes: [...new Set(roleCodes)].sort() };
  }

  async search(actorId: string, consumer: KnowledgeConsumer, target: KnowledgeTarget, query: string) {
    const scope = await this.resolve(actorId, consumer, target);
    return this.searchAuthorizedScope(scope, query);
  }
  /** Server-only port: business workflow has already revalidated actor/resource; never expose scope as HTTP/model arguments. */
  async searchAuthorizedScope({ policy, roleCodes }: { policy: RetrievalPolicy; roleCodes: string[] }, query: string) {
    const { terms } = retrievalQuery(query);
    const parameters: unknown[] = [JSON.stringify(policy.audiences), JSON.stringify(policy.kinds), policy.purpose, JSON.stringify(roleCodes)];
    const scores = terms.map(term => {
      const index = parameters.push(term) - 1;
      return `(CASE WHEN CHARINDEX(@${index},JSON_VALUE(r.snapshotJson,'$.title') COLLATE Latin1_General_100_CI_AI)>0 THEN 6 ELSE 0 END
        + CASE WHEN CHARINDEX(@${index},JSON_VALUE(r.snapshotJson,'$.summary') COLLATE Latin1_General_100_CI_AI)>0 THEN 3 ELSE 0 END
        + CASE WHEN CHARINDEX(@${index},r.snapshotJson COLLATE Latin1_General_100_CI_AI)>0 THEN 1 ELSE 0 END)`;
    }).join('+');
    // Eligibility is part of the SQL relation before scoring/TOP; no global vector cache can bypass it.
    const rows: Array<{ id: string; code: string; version: number; sha256: string; snapshotJson: string; score: number }> = await this.db.query(`
      WITH eligible AS (
        SELECT e.id,e.code,e.version,r.sha256,r.snapshotJson FROM knowledge_entries e
        JOIN knowledge_revisions r ON r.entryId=e.id AND r.version=e.version
        WHERE e.status='published' AND JSON_VALUE(r.snapshotJson,'$.status')='published'
          AND JSON_VALUE(r.snapshotJson,'$.audience') IN (SELECT [value] FROM OPENJSON(@0))
          AND JSON_VALUE(r.snapshotJson,'$.kind') IN (SELECT [value] FROM OPENJSON(@1))
          AND EXISTS(SELECT 1 FROM OPENJSON(r.snapshotJson,'$.purposes') p WHERE p.[value]=@2)
          AND (NOT EXISTS(SELECT 1 FROM OPENJSON(r.snapshotJson,'$.roleCodes'))
            OR EXISTS(SELECT 1 FROM OPENJSON(r.snapshotJson,'$.roleCodes') c JOIN OPENJSON(@3) allowed ON allowed.[value]=c.[value]))
      ), ranked AS (SELECT r.*,(${scores}) score FROM eligible r)
      SELECT TOP (40) * FROM ranked WHERE score>0 ORDER BY score DESC,code ASC`, parameters);
    const candidates: RetrievalCandidate[] = [];
    for (const row of rows) {
      if (createHash('sha256').update(row.snapshotJson, 'utf8').digest('hex') !== row.sha256) {
        throw new InternalServerErrorException({ code: 'KNOWLEDGE_INTEGRITY_ERROR', message: 'Không thể xác minh tri thức.' });
      }
      const snapshot = JSON.parse(row.snapshotJson) as KnowledgeSnapshot, candidate = { ...row, snapshot };
      if (!allowedKnowledge(candidate, policy, roleCodes)) throw new InternalServerErrorException('Scope hoặc phiên bản tri thức không nhất quán.');
      candidates.push(candidate);
    }
    return packKnowledge(candidates, policy, roleCodes);
  }
}
