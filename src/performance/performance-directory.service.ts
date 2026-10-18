import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PerformanceDirectoryQueryDto } from './performance-query.dto';
import { PerformanceService } from './performance.service';

/** Select/rank a bounded page in SQL before loading its batched metric facts. */
@Injectable()
export class PerformanceDirectoryService {
  constructor(private readonly db: DataSource, private readonly performance: PerformanceService) {}
  async list(principal: { userId: string; isAdmin: boolean }, q: PerformanceDirectoryQueryDto) {
    if (q.from && q.to && Date.parse(q.from) >= Date.parse(q.to)) throw new BadRequestException('from must be before to.');
    const params = [principal.userId, principal.isAdmin ? 1 : 0, q.projectId ?? null, q.sessionId ?? null,
      q.from ? new Date(q.from) : null, q.to ? new Date(q.to) : null, q.q?.trim() ? `%${q.q.trim()}%` : null,
      (q.page - 1) * q.pageSize, q.pageSize];
    const scope = `WITH owned AS (
      SELECT a.internId,a.projectId,a.sessionId FROM assignments a
      JOIN projects p ON p.id=a.projectId JOIN internship_sessions se ON se.id=a.sessionId
      JOIN users u ON u.id=a.internId
      WHERE a.status IN ('active','completed') AND (@2 IS NULL OR a.projectId=@2) AND (@3 IS NULL OR a.sessionId=@3)
      AND (@4 IS NULL OR a.completedAt IS NULL OR a.completedAt>@4) AND (@5 IS NULL OR a.assignedAt<@5)
      AND (@6 IS NULL OR u.displayName LIKE @6 OR u.email LIKE @6)
      AND (@1=1 OR p.mentorId=@0 OR se.leadInstructorId=@0 OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=a.sessionId AND si.instructorId=@0))
    ), people AS (SELECT DISTINCT internId FROM owned), taskFacts AS (
      SELECT t.assigneeId,COUNT(*) total,SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) done,
        SUM(CASE WHEN t.status<>'done' AND t.dueDate<SYSUTCDATETIME() THEN 1 ELSE 0 END) overdue
      FROM tasks t LEFT JOIN sprints sp ON sp.id=t.sprintId AND sp.projectId=t.projectId
      WHERE t.deletedAt IS NULL AND (@4 IS NULL OR t.createdAt>=@4) AND (@5 IS NULL OR t.createdAt<@5)
      AND EXISTS(SELECT 1 FROM owned o WHERE o.internId=t.assigneeId AND o.projectId=t.projectId
        AND ((t.sprintId IS NULL AND @3 IS NULL) OR sp.sessionId=o.sessionId OR (sp.sessionId IS NULL AND @3 IS NULL)))
      GROUP BY t.assigneeId
    ), evaluationFacts AS (
      SELECT e.internId,AVG(CAST(e.overallScore AS float)) score FROM evaluations e
      WHERE e.status='finalized' AND e.overallScore IS NOT NULL
      AND (@4 IS NULL OR COALESCE(e.finalizedAt,e.updatedAt)>=@4) AND (@5 IS NULL OR COALESCE(e.finalizedAt,e.updatedAt)<@5)
      AND (@2 IS NULL OR e.projectId=@2) AND (@3 IS NULL OR e.sessionId=@3)
      AND EXISTS(SELECT 1 FROM owned o WHERE o.internId=e.internId AND (e.projectId=o.projectId OR (e.projectId IS NULL AND e.sessionId=o.sessionId)) AND (e.sessionId IS NULL OR e.sessionId=o.sessionId))
      GROUP BY e.internId
    )`;
    const [rows, counts]: [Array<{ internId: string }>, Array<{ total: number }>] = await Promise.all([
      this.db.query(`${scope} SELECT p.internId FROM people p LEFT JOIN taskFacts t ON t.assigneeId=p.internId LEFT JOIN evaluationFacts e ON e.internId=p.internId
        ORDER BY CASE WHEN t.total>0 THEN 100.0*t.done/t.total ELSE -1 END DESC,e.score DESC,COALESCE(t.overdue,0),COALESCE(t.total,0) DESC,p.internId
        OFFSET @7 ROWS FETCH NEXT @8 ROWS ONLY`, params),
      this.db.query(`${scope} SELECT COUNT(*) total FROM people`, params),
    ]);
    const metrics = rows.length ? await this.performance.listInterns(principal, q, rows.map(r => r.internId)) : { items: [] };
    const byId = new Map(metrics.items.map(m => [m.userId.toLowerCase(), m]));
    return { items: rows.flatMap((r, index) => { const member = byId.get(r.internId.toLowerCase()); return member ? [{ ...member, rank: (q.page - 1) * q.pageSize + index + 1 }] : []; }),
      total: Number(counts[0]?.total ?? 0), page: q.page, pageSize: q.pageSize,
      ranking: 'completion-rate, finalized-evaluation, overdue-count, workload, stable-id' };
  }
}
