import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RequestPrincipal } from '../common/types/request-principal';
import { resolveOwnership } from '../rbac/ownership';
import { PermissionsService } from '../rbac/permissions.service';
import { QueryTasksDto } from '../tasks/dto/task.dtos';
import { TasksService } from '../tasks/tasks.service';
import { SessionsService } from './sessions.service';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';

interface DeliveryRow {
  taskId: string; blocked: number; submissionId: string | null; submissionStatus: string;
  prUrl: string; headSha: string | null; submittedAt: Date;
  instructorScore: number | null; instructorFeedback: string | null;
  aiStatus: string | null; aiScore: number | null; aiSummary: string | null;
}

/** Live delivery facts for the existing authorized task page, never an entire session export. */
@Injectable()
export class SessionWorkService {
  constructor(private readonly sessions: SessionsService, private readonly tasks: TasksService,
    private readonly db: DataSource, private readonly permissions: PermissionsService) {}

  async list(sessionId: string, q: QueryTasksDto, principal: RequestPrincipal) {
    await this.sessions.getOne(sessionId, await resolveOwnership(this.permissions, principal.userId));
    const page = await this.tasks.list({ ...q, sessionId }, principal);
    if (!page.items.length) return page;
    const rows: DeliveryRow[] = await this.db.query(`SELECT t.id taskId,
      CASE WHEN t.status <> 'done' AND EXISTS (
        SELECT 1 FROM task_specs spec
        CROSS APPLY OPENJSON(CASE WHEN ISJSON(spec.specJson)=1 THEN spec.specJson ELSE '{}' END,'$.dependencies') WITH(taskId uniqueidentifier '$.taskId') dependency
        LEFT JOIN tasks prior ON prior.id=dependency.taskId AND prior.projectId=t.projectId AND prior.deletedAt IS NULL
        WHERE spec.taskId=t.id AND (prior.id IS NULL OR prior.status<>'done')
      ) THEN 1 ELSE 0 END blocked,
      sub.id submissionId,sub.status submissionStatus,sub.prUrl,sub.headSha,sub.submittedAt,
      sub.score instructorScore,sub.feedback instructorFeedback,
      review.status aiStatus,TRY_CONVERT(float,JSON_VALUE(review.resultJson,'$.score')) aiScore,JSON_VALUE(review.resultJson,'$.summary') aiSummary
      FROM tasks t JOIN sprints sp ON sp.id=t.sprintId AND sp.projectId=t.projectId
      OUTER APPLY(SELECT TOP(1) s.id,s.status,s.prUrl,s.headSha,s.submittedAt,s.score,s.feedback FROM task_submissions s WHERE s.taskId=t.id ORDER BY s.submittedAt DESC,s.id DESC) sub
      OUTER APPLY(SELECT TOP(1) r.status,r.resultJson FROM submission_code_reviews r WHERE r.submissionId=sub.id ORDER BY r.createdAt DESC,r.id DESC) review
      WHERE sp.sessionId=@0 AND t.deletedAt IS NULL AND t.id IN (${page.items.map((_, i) => `@${i + 1}`).join(',')})`, [sessionId, ...page.items.map(t => t.id)]);
    const facts = new Map(rows.map(row => [row.taskId.toLowerCase(), row]));
    return { ...page, items: page.items.map(task => {
      const row = facts.get(task.id.toLowerCase());
      return { ...task, delivery: row ? {
        blocked: Boolean(row.blocked),
        submission: row.submissionId ? {
          id: row.submissionId.toLowerCase(), status: row.submissionStatus, prUrl: row.prUrl,
          headSha: row.headSha, submittedAt: row.submittedAt,
          instructorScore: row.instructorScore, instructorFeedback: row.instructorFeedback,
          aiStatus: row.aiStatus, aiScore: row.aiScore, aiSummary: row.aiSummary,
        } : null,
      } : null };
    }) };
  }

  async timeline(sessionId: string, q: PaginationQueryDto, principal: RequestPrincipal) {
    const owner = await resolveOwnership(this.permissions, principal.userId);
    await this.sessions.getOne(sessionId, owner);
    const params = [sessionId, principal.userId, owner.isAdmin ? 1 : 0, (q.page - 1) * q.pageSize, q.pageSize];
    // Match the task project's visibility as well as the already checked session ownership.
    // Scope by target relation, never actor membership (which would mix other sessions).
    const scope = `WITH visibleSprints AS (
      SELECT sp.id FROM sprints sp JOIN projects p ON p.id=sp.projectId
      WHERE sp.sessionId=@0 AND (@2=1 OR p.mentorId=@1 OR p.mentorId IS NULL)
    ), visibleTasks AS (
      SELECT t.id FROM tasks t JOIN visibleSprints sp ON sp.id=t.sprintId WHERE t.deletedAt IS NULL
    ), events AS (
      SELECT e.* FROM activity_events e WHERE
        (e.targetType='internship_session' AND TRY_CONVERT(uniqueidentifier,e.targetId)=@0)
        OR (e.targetType='sprint' AND EXISTS(SELECT 1 FROM visibleSprints sp WHERE sp.id=TRY_CONVERT(uniqueidentifier,e.targetId)))
        OR (e.targetType='task' AND EXISTS(SELECT 1 FROM visibleTasks t WHERE t.id=TRY_CONVERT(uniqueidentifier,e.targetId)))
        OR (e.targetType='task_submission' AND EXISTS(SELECT 1 FROM task_submissions s JOIN visibleTasks t ON t.id=s.taskId WHERE s.id=TRY_CONVERT(uniqueidentifier,e.targetId)))
        OR (e.targetType='session_milestone' AND EXISTS(SELECT 1 FROM session_milestones m WHERE m.sessionId=@0 AND m.id=TRY_CONVERT(uniqueidentifier,e.targetId)))
    )`;
    const [rows, counts]: [Array<{ id: string; action: string; summary: string | null; createdAt: Date; actorName: string | null; targetType: string }>, Array<{ total: number }>] = await Promise.all([
      this.db.query(`${scope} SELECT e.id,e.action,e.summary,e.createdAt,e.targetType,u.displayName actorName
        FROM events e LEFT JOIN users u ON u.id=e.actorId ORDER BY e.createdAt DESC,e.id DESC OFFSET @3 ROWS FETCH NEXT @4 ROWS ONLY`, params),
      this.db.query(`${scope} SELECT COUNT(*) total FROM events`, params),
    ]);
    return { items: rows.map(row => ({ ...row, id: row.id.toLowerCase() })), total: Number(counts[0]?.total ?? 0) };
  }
}
