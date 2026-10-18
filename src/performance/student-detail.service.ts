import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RecruitmentResult } from '../recruitment/entities/recruitment-result.entity';
import { toResultResponse } from '../recruitment/recruitment.service';
import { PerformanceDirectoryQueryDto } from './performance-query.dto';
import { PerformanceService } from './performance.service';

@Injectable()
export class StudentDetailService {
  constructor(private readonly db: DataSource, private readonly performance: PerformanceService) {}
  async get(principal: { userId: string; isAdmin: boolean }, target: string, q: PerformanceDirectoryQueryDto) {
    // The existing metric boundary rejects foreign projects/sessions and unowned students first.
    const performance = await this.performance.getInternMetrics(principal, target, q);
    const params = [target, principal.userId, principal.isAdmin ? 1 : 0, q.projectId ?? null, q.sessionId ?? null,
      q.from ? new Date(q.from) : null, q.to ? new Date(q.to) : null, (q.page - 1) * q.pageSize, q.pageSize];
    const scope = `WITH owned AS (
      SELECT a.*,p.name projectName,se.name sessionName,pm.roleInProject FROM assignments a
      JOIN projects p ON p.id=a.projectId JOIN internship_sessions se ON se.id=a.sessionId
      LEFT JOIN project_members pm ON pm.projectId=a.projectId AND pm.userId=a.internId
      WHERE a.internId=@0 AND a.status IN ('active','completed') AND (@3 IS NULL OR a.projectId=@3) AND (@4 IS NULL OR a.sessionId=@4)
      AND (@2=1 OR p.mentorId=@1 OR se.leadInstructorId=@1 OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=a.sessionId AND si.instructorId=@1))
    ), scopedTasks AS (
      SELECT t.*,sp.name sprintName,sp.sessionId FROM tasks t LEFT JOIN sprints sp ON sp.id=t.sprintId AND sp.projectId=t.projectId
      WHERE t.assigneeId=@0 AND t.deletedAt IS NULL AND (@5 IS NULL OR t.createdAt>=@5) AND (@6 IS NULL OR t.createdAt<@6)
      AND EXISTS(SELECT 1 FROM owned o WHERE o.projectId=t.projectId AND ((t.sprintId IS NULL AND @4 IS NULL) OR sp.sessionId=o.sessionId OR (sp.sessionId IS NULL AND @4 IS NULL)))
    )`;
    const [profiles, results, assignments, tasks, totals, trends] = await Promise.all([
      this.db.query(`${scope} SELECT u.id,u.displayName,u.email,p.selectedRole FROM users u LEFT JOIN recruitment_profiles p ON p.userId=u.id WHERE u.id=@0 AND EXISTS(SELECT 1 FROM owned)`, params),
      this.db.query(`${scope} SELECT TOP(1) r.* FROM recruitment_results r JOIN recruitment_profiles p ON p.id=r.profileId WHERE p.userId=@0 AND EXISTS(SELECT 1 FROM owned) ORDER BY r.evaluatedAt DESC,r.id`, params),
      this.db.query(`${scope} SELECT TOP(20) id,projectId,projectName,sessionId,sessionName,roleInProject,status,assignedAt,completedAt FROM owned ORDER BY assignedAt DESC,id`, params),
      this.db.query(`${scope} SELECT t.id,t.code,t.title,t.status,t.priority,t.progress,t.dueDate,t.sprintId,t.sprintName,t.sessionId,t.projectId,
        s.id submissionId,s.status submissionStatus,s.score instructorScore,s.feedback instructorFeedback,s.submittedAt,s.reviewedAt,s.headSha,
        cr.status aiReviewStatus,TRY_CONVERT(float,JSON_VALUE(cr.resultJson,'$.score')) aiScore,JSON_VALUE(cr.resultJson,'$.summary') aiSummary
        FROM scopedTasks t OUTER APPLY(SELECT TOP(1) sub.* FROM task_submissions sub WHERE sub.taskId=t.id AND sub.internId=@0 ORDER BY sub.submittedAt DESC,sub.id) s
        OUTER APPLY(SELECT TOP(1) review.status,review.resultJson FROM submission_code_reviews review WHERE review.submissionId=s.id ORDER BY review.createdAt DESC,review.id) cr
        ORDER BY CASE WHEN t.status='done' THEN 1 ELSE 0 END,t.dueDate,t.createdAt DESC,t.id OFFSET @7 ROWS FETCH NEXT @8 ROWS ONLY`, params),
      this.db.query(`${scope} SELECT COUNT(*) total FROM scopedTasks`, params),
      this.db.query(`${scope}, events AS (
        SELECT CONVERT(char(7),t.createdAt,126) month,1 created,0 completed FROM scopedTasks t WHERE t.createdAt>=DATEADD(month,-5,DATEFROMPARTS(YEAR(SYSUTCDATETIME()),MONTH(SYSUTCDATETIME()),1))
        UNION ALL SELECT CONVERT(char(7),h.createdAt,126),0,1 FROM scopedTasks t CROSS APPLY(SELECT TOP(1) createdAt FROM task_status_histories h WHERE h.taskId=t.id AND h.toStatus='done' ORDER BY h.createdAt,h.id) h
        WHERE h.createdAt>=DATEADD(month,-5,DATEFROMPARTS(YEAR(SYSUTCDATETIME()),MONTH(SYSUTCDATETIME()),1))
      ) SELECT month,SUM(created) created,SUM(completed) completed FROM events GROUP BY month ORDER BY month`, params),
    ]);
    if (!profiles[0]) throw new NotFoundException('Student not found.');
    const months = Array.from({ length: 6 }, (_, index) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 5 + index); return d.toISOString().slice(0, 7); });
    return { profile: profiles[0], interview: results[0] ? toResultResponse(results[0] as RecruitmentResult) : null,
      metrics: performance.metrics, assignments, assignmentHistoryLimit: 20,
      tasks: { items: tasks, total: Number(totals[0]?.total ?? 0), page: q.page, pageSize: q.pageSize },
      trend: months.map(month => trends.find((row: { month: string }) => row.month === month) ?? { month, created: 0, completed: 0 }),
      trendDefinition: 'UTC months; tasks created and their first Done transition, within the selected task-created period. Historical completion is counted once.' };
  }
}
