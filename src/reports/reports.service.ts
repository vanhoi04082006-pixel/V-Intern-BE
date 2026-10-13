import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ActorContext } from '../users/users.service';
import { PermissionsService } from '../rbac/permissions.service';
import { PerformanceQuery, PerformanceService } from '../performance/performance.service';
import { isUniqueViolation } from '../common/utils/db-errors';
import { CreateReportDto, ReportKind, ReportQueryDto } from './report.dto';

export interface ReportMember {
  userId: string; displayName: string | null; totalTaskCount: number; completedTaskCount: number;
  taskCompletionRate: number | null; averageEvaluationScore: number | null; overdueOpenTaskCount: number;
  submissionCount: number; approvedCount: number; reworkCount: number;
}
export interface ReportSnapshot {
  schemaVersion: 1; scope: PerformanceQuery; projectName: string; members: ReportMember[];
}
export interface SavedReport { id: string; title: string; kind: ReportKind; projectId: string; createdById: string; createdAt: Date; snapshotJson: string; }
@Injectable()
export class ReportsService {
  constructor(private readonly db: DataSource, private readonly performance: PerformanceService, private readonly permissions: PermissionsService, private readonly audit: AuditService) {}
  private async principal(userId: string) { return { userId, isAdmin: await this.permissions.hasRole(userId,'admin') }; }
  async list(userId: string, query: ReportQueryDto) {
    const scope = `createdById=@0 AND (@3 IS NULL OR projectId=@3) AND (@4 IS NULL OR JSON_VALUE(snapshotJson,'$.scope.sessionId')=@4)`;
    const params = [userId,query.kind??null,(query.page-1)*8,query.projectId??null,query.sessionId??null];
    const [items,counts] = await Promise.all([
      this.db.query(`SELECT r.id,r.title,r.kind,r.projectId,r.createdAt,p.name projectName FROM report_snapshots r LEFT JOIN projects p ON p.id=r.projectId WHERE r.${scope.replaceAll('projectId=@3', 'r.projectId=@3')} AND (@1 IS NULL OR r.kind=@1) ORDER BY r.createdAt DESC,r.id OFFSET @2 ROWS FETCH NEXT 8 ROWS ONLY`,params),
      this.db.query(`SELECT kind,COUNT(*) count,SUM(CASE WHEN createdAt>=DATEADD(day,-7,SYSUTCDATETIME()) THEN 1 ELSE 0 END) recentCount FROM report_snapshots WHERE ${scope} GROUP BY kind`,params),
    ]);
    return {items,total:counts.filter((c: {kind:string})=>!query.kind||c.kind===query.kind).reduce((n:number,c:{count:number})=>n+c.count,0),counts};
  }
  async get(id: string, userId: string) {
    const [row]: SavedReport[] = await this.db.query('SELECT * FROM report_snapshots WHERE id=@0 AND createdById=@1',[id,userId]);
    if (!row) throw new NotFoundException('Report not found.');
    const snapshot: ReportSnapshot = JSON.parse(row.snapshotJson);
    const fresh = await this.performance.listInterns(await this.principal(userId),snapshot.scope);
    const visible = new Set(fresh.items.map(m=>m.userId.toLowerCase()));
    if (snapshot.members.some(m=>!visible.has(m.userId.toLowerCase()))) throw new ForbiddenException('Report scope is no longer accessible.');
    return {id:row.id,title:row.title,kind:row.kind,projectId:row.projectId,createdById:row.createdById,createdAt:row.createdAt,snapshot};
  }
  async create(input: CreateReportDto, ctx: ActorContext) {
    const userId=ctx.actorId!;
    if (!input.title.trim() || (input.from && input.to && Date.parse(input.from)>=Date.parse(input.to))) throw new BadRequestException('Invalid report title or period.');
    const [existing] = await this.db.query('SELECT id FROM report_snapshots WHERE createdById=@0 AND requestId=@1',[userId,input.requestId]);
    if (existing) return this.get(existing.id,userId);
    const scope: PerformanceQuery = {projectId:input.projectId,...(input.sessionId?{sessionId:input.sessionId}:{}),...(input.from?{from:input.from}:{}),...(input.to?{to:input.to}:{})};
    const principal=await this.principal(userId), list=await this.performance.listInterns(principal,scope);
    if (!list.items.length) throw new BadRequestException('No accessible assigned members in this scope.');
    const [project] = await this.db.query('SELECT name FROM projects WHERE id=@0',[input.projectId]);
    if (!project) throw new NotFoundException('Project not found.');
    const submissions = await this.db.query(`SELECT s.internId,COUNT(*) submissionCount,
      SUM(CASE WHEN s.status='approved' THEN 1 ELSE 0 END) approvedCount,SUM(CASE WHEN s.status='rework' THEN 1 ELSE 0 END) reworkCount
      FROM task_submissions s JOIN tasks t ON t.id=s.taskId LEFT JOIN sprints sp ON sp.id=t.sprintId
      WHERE t.projectId=@0 AND t.deletedAt IS NULL AND (@1 IS NULL OR sp.sessionId=@1)
      AND (@2 IS NULL OR s.submittedAt>=@2) AND (@3 IS NULL OR s.submittedAt<@3) GROUP BY s.internId`,[input.projectId,input.sessionId??null,input.from?new Date(input.from):null,input.to?new Date(input.to):null]);
    const members: ReportMember[]=[];
    for (const row of list.items) {
      const pr=submissions.find((s:{internId:string})=>s.internId.toLowerCase()===row.userId.toLowerCase());
      members.push({...row,submissionCount:pr?.submissionCount??0,approvedCount:pr?.approvedCount??0,reworkCount:pr?.reworkCount??0});
    }
    const snapshot: ReportSnapshot={schemaVersion:1,scope,projectName:project.name,members};
    let id: string;
    try {
      const [saved]=await this.db.query(`INSERT INTO report_snapshots(requestId,createdById,projectId,title,kind,snapshotJson) OUTPUT INSERTED.id VALUES(@0,@1,@2,@3,@4,@5)`,[input.requestId,userId,input.projectId,input.title.trim(),input.kind,JSON.stringify(snapshot)]);
      id=saved.id;
    } catch(e) {
      if (!isUniqueViolation(e)) throw e;
      const [saved]=await this.db.query('SELECT id FROM report_snapshots WHERE createdById=@0 AND requestId=@1',[userId,input.requestId]);
      if (!saved) throw e; return this.get(saved.id,userId);
    }
    await this.audit.record({...ctx,action:'report.created',targetType:'report',targetId:id,detail:{kind:input.kind,projectId:input.projectId,memberCount:members.length}});
    return this.get(id,userId);
  }
}
