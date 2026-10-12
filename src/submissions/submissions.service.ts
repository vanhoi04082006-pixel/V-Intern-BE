import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { TasksService } from '../tasks/tasks.service';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatusHistory } from '../tasks/entities/task-status-history.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { RequestPrincipal } from '../common/types/request-principal';
import { ActorContext } from '../users/users.service';
import { PermissionsService } from '../rbac/permissions.service';
import { ReviewSubmissionDto, SubmitTaskDto } from './submission.dto';
import { assertSubmissionOwner, scoreSubmission, validatePullRequestUrl } from './submission-policy';
export interface Submission {
  id: string; taskId: string; internId: string; prUrl: string; summary: string;
  status: 'submitted' | 'approved' | 'rework'; score: number | null; rubricJson: string | null;
  rubricVersion: string; feedback: string | null; reviewerId: string | null;
  submittedAt: Date; reviewedAt: Date | null;
}
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly db: DataSource,
    private readonly tasks: TasksService,
    private readonly permissions: PermissionsService,
  ) {}
  async list(taskId: string, principal: RequestPrincipal): Promise<Submission[]> {
    await this.tasks.getOneDetailed(taskId, principal);
    return this.db.query('SELECT TOP (50) * FROM task_submissions WHERE taskId=@0 ORDER BY submittedAt DESC,id DESC', [taskId]);
  }
  private async lockedTask(em: EntityManager, id: string): Promise<Task> {
    const task = await em.getRepository(Task).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!task || task.deletedAt) throw new NotFoundException('Task not found.');
    return task;
  }
  private async changeTask(em: EntityManager, task: Task, status: Task['status'], ctx: ActorContext, reason: string): Promise<void> {
    if (task.status === status) return;
    const fromStatus = task.status;
    task.status = status;
    if (status === 'done') task.progress = 100;
    await em.save(Task, task);
    await em.save(TaskStatusHistory, em.create(TaskStatusHistory, { taskId: task.id, fromStatus, toStatus: status, changedById: ctx.actorId, reason }));
  }
  private async record(em: EntityManager, ctx: ActorContext, id: string, action: string, detail: object): Promise<void> {
    await em.save(AuditLog, em.create(AuditLog, { actorId: ctx.actorId, action, targetType: 'task_submission', targetId: id, detail: JSON.stringify(detail), ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null }));
    await em.save(ActivityEvent, em.create(ActivityEvent, { actorId: ctx.actorId, module: 'tasks', action, targetType: 'task_submission', targetId: id, summary: action === 'submission.create' ? 'Đã nộp bài để giảng viên review' : 'Giảng viên đã review bài nộp' }));
  }
  async submit(taskId: string, dto: SubmitTaskDto, ctx: ActorContext): Promise<Submission> {
    const actorId = ctx.actorId;
    if (!actorId) throw new ForbiddenException('Authentication required.');
    const prUrl = validatePullRequestUrl(dto.prUrl);
    return this.db.transaction(async em => {
      const task = await this.lockedTask(em, taskId);
      const active = await em.getRepository(Assignment).exists({ where: { internId: actorId, projectId: task.projectId, status: 'active' } });
      assertSubmissionOwner(task, actorId, active);
      if (task.version !== dto.version) throw new ConflictException('Task changed. Reload before submitting.');
      const pending: Submission[] = await em.query("SELECT id FROM task_submissions WHERE taskId=@0 AND status='submitted'", [taskId]);
      if (pending.length) throw new ConflictException('A submission is already waiting for review.');
      const id = randomUUID();
      await em.query("INSERT INTO task_submissions(id,taskId,internId,prUrl,summary,status) VALUES(@0,@1,@2,@3,@4,'submitted')", [id, taskId, ctx.actorId, prUrl, dto.summary]);
      await this.changeTask(em, task, 'review', ctx, 'Đã nộp pull request');
      await this.record(em, ctx, id, 'submission.create', { taskId, prUrl });
      const rows: Submission[] = await em.query('SELECT * FROM task_submissions WHERE id=@0', [id]);
      return rows[0];
    });
  }
  /**
   * P0 BE-004: reviewer must manage the task's scope — the project's managing
   * mentor (claimed) for the project, plus session ownership when the task sits
   * in a session sprint. Mirrors the sprint write rule (assertSprintManaged);
   * admin bypasses. Checked BEFORE state early-returns so foreign reviewers
   * learn nothing about review state.
   */
  private async assertReviewerScope(em: EntityManager, task: Task, actorId: string): Promise<void> {
    if (await this.permissions.hasRole(actorId, 'admin')) return;
    const projects: Array<{ mentorId: string | null }> = await em.query(
      'SELECT mentorId FROM projects WHERE id=@0',
      [task.projectId],
    );
    if (!projects.length || projects[0].mentorId !== actorId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SUBMISSION_SCOPE_FORBIDDEN',
        message: 'Only the managing mentor can review this submission.',
      });
    }
    if (task.sprintId) {
      const sprints: Array<{ sessionId: string | null }> = await em.query(
        'SELECT sessionId FROM sprints WHERE id=@0',
        [task.sprintId],
      );
      const sessionId = sprints[0]?.sessionId ?? null;
      if (sessionId) {
        const owned: Array<{ n: number }> = await em.query(
          `SELECT COUNT(1) AS n FROM internship_sessions s
             LEFT JOIN session_instructors si ON si.sessionId = s.id AND si.instructorId = @1
           WHERE s.id = @0 AND (s.leadInstructorId = @1 OR si.instructorId = @1)`,
          [sessionId, actorId],
        );
        if (!owned[0]?.n) {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'SUBMISSION_SCOPE_FORBIDDEN',
            message: 'You do not manage the session of this submission.',
          });
        }
      }
    }
  }
  async review(id: string, dto: ReviewSubmissionDto, ctx: ActorContext): Promise<Submission> {
    const score = scoreSubmission(dto.rubric);
    return this.db.transaction(async em => {
      const found: Submission[] = await em.query('SELECT * FROM task_submissions WHERE id=@0', [id]);
      if (!found.length) throw new NotFoundException('Submission not found.');
      const task = await this.lockedTask(em, found[0].taskId);
      const rows: Submission[] = await em.query('SELECT * FROM task_submissions WITH(UPDLOCK,ROWLOCK) WHERE id=@0', [id]);
      const item = rows[0];
      if (item.internId === ctx.actorId) throw new ForbiddenException('You cannot review your own submission.');
      if (!ctx.actorId) throw new ForbiddenException('Authentication required.');
      await this.assertReviewerScope(em, task, ctx.actorId);
      if (item.status !== 'submitted') return item;
      if (task.assigneeId !== item.internId || task.status !== 'review' || task.version !== dto.taskVersion) throw new ConflictException('Task changed. Reload before reviewing.');
      const status = score >= 70 ? 'approved' : 'rework';
      await em.query('UPDATE task_submissions SET status=@1,score=@2,rubricJson=@3,feedback=@4,reviewerId=@5,reviewedAt=SYSUTCDATETIME() WHERE id=@0', [id, status, score, JSON.stringify(dto.rubric), dto.feedback, ctx.actorId]);
      await this.changeTask(em, task, status === 'approved' ? 'done' : 'doing', ctx, `${status}: ${score}/100; ${dto.feedback}`.slice(0, 512));
      await this.record(em, ctx, id, 'submission.review', { taskId: task.id, status, score, rubricVersion: 'task-review-v1', rubric: dto.rubric });
      await em.save(Notification, em.create(Notification, {
        userId: item.internId, type: 'task.reviewed',
        title: status === 'approved' ? `Đã duyệt bài: ${task.code}` : `Cần làm lại: ${task.code}`,
        body: `${score}/100 · ${dto.feedback}`, linkUrl: `/intern/work/${task.id}`, readAt: null,
      }));
      const result: Submission[] = await em.query('SELECT * FROM task_submissions WHERE id=@0', [id]);
      return result[0];
    });
  }
}
