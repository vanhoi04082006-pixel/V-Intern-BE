import { assertTaskDependencies } from './task-dependencies';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  IsNull,
  OptimisticLockVersionMismatchError,
  Repository,
} from 'typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { isUniqueViolation } from '../common/utils/db-errors';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Project } from '../projects/entities/project.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { User } from '../users/entities/user.entity';
import { ActorContext } from '../users/users.service';
import { OWNER_PARAM, scopedProjectSessionClause } from '../rbac/ownership';
import { PermissionsService } from '../rbac/permissions.service';
import { Task } from './entities/task.entity';
import { TaskComment } from './entities/task-comment.entity';
import { TaskStatusHistory } from './entities/task-status-history.entity';
import {
  canTransitionTask,
  isInternAllowedTaskTransition,
  TASK_FOCUS_ORDER,
  type TaskPriority,
  type TaskStatus,
} from './task-status.machine';
import { RequestPrincipal } from '../common/types/request-principal';

/**
 * Task contract (spec 5–18, 20–21, 25–28, 30):
 * - Status vocabulary todo/doing/review/done ONLY (spec 6). Transitions run
 *   through the state machine; illegal → 409 INVALID_TASK_TRANSITION.
 * - Interns (spec 7/8): ONLY todo→doing and doing→review on their OWN task,
 *   and only while their assignment is ACTIVE (spec 28 → 403
 *   ASSIGNMENT_NOT_ACTIVE). Ownership violations → 403 TASK_NOT_OWNED.
 *   Rework (review→doing) and approval (review→done) are tasks.manage-only.
 * - Assignment boundary (spec 27): an assignee must hold an ACTIVE
 *   assignment on the task's project (checked in-DB, never inferred from a
 *   role name) → 409 INVALID_ASSIGNEE otherwise.
 * - Task codes (spec 11): SQL Server SEQUENCE task_code_seq + project-code
 *   prefix (e.g. VIN-103). SEQUENCE values are concurrency-safe and never
 *   reuse; rolled-back transactions leave a harmless gap (documented).
 * - Concurrency (spec 25): pessimistic row lock inside the tx + @VersionColumn
 *   optimistic predicate; a losing concurrent writer → 409 TASK_VERSION_CONFLICT.
 * - Atomicity (spec 12/26): the task update is saved EXACTLY ONCE per tx;
 *   status history + notifications + audit + activity are written through the
 *   SAME transactional EntityManager — any failure rolls back ALL writes.
 * - Story-point aggregation (spec 30) is computed from the DB in
 *   SprintsService.completion — no hardcoded metrics anywhere.
 */
export interface TaskResponse {
  id: string;
  code: string;
  title: string;
  description: string | null;
  projectId: string;
  sprintId: string | null;
  assigneeId: string | null;
  createdById: string | null;
  status: string;
  priority: string;
  storyPoints: number | null;
  progress: number;
  dueDate: Date | null;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project?: { id: string; code: string; name: string; status: string };
  sprint?: { id: string; code: string; name: string; status: string };
  assignee?: { id: string; displayName: string; email: string };
}

export interface TaskCommentResponse {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author?: { id: string; displayName: string; email: string };
}

export interface TaskHistoryResponse {
  id: string;
  taskId: string;
  fromStatus: string | null;
  toStatus: string;
  changedById: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface InternTaskWorkspaceData {
  currentSprint: {
    id: string;
    code: string;
    name: string;
    status: string;
    startDate: Date;
    endDate: Date;
  } | null;
  taskSummary: { todo: number; doing: number; review: number; done: number; total: number };
  focusedTask: {
    id: string;
    code: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    progress: number;
  } | null;
}

interface StatusChangeResult {
  changed: boolean;
  from?: TaskStatus;
  to?: TaskStatus;
}

const taskNotFound = () =>
  new NotFoundException({ statusCode: 404, code: 'TASK_NOT_FOUND', message: 'Task not found.' });

const transitionConflict = (from: string, to: string) =>
  new ConflictException({
    statusCode: 409,
    code: 'INVALID_TASK_TRANSITION',
    message: `Illegal task transition '${from}' → '${to}'.`,
    details: {
      from,
      to,
      legal: ['todo->doing', 'doing->review', 'review->done', 'review->doing (rework, tasks.manage)'],
    },
  });

function toTaskResponse(
  t: Task,
  extras?: {
    project?: TaskResponse['project'];
    sprint?: TaskResponse['sprint'];
    assignee?: TaskResponse['assignee'];
  },
): TaskResponse {
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description ?? null,
    projectId: t.projectId,
    sprintId: t.sprintId ?? null,
    assigneeId: t.assigneeId ?? null,
    createdById: t.createdById ?? null,
    status: t.status,
    priority: t.priority,
    storyPoints: t.storyPoints ?? null,
    progress: t.progress,
    dueDate: t.dueDate ?? null,
    version: t.version,
    deletedAt: t.deletedAt ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    ...(extras ?? {}),
  };
}

function toCommentResponse(c: TaskComment, author?: TaskCommentResponse['author']): TaskCommentResponse {
  return {
    id: c.id,
    taskId: c.taskId,
    authorId: c.authorId,
    content: c.content,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    ...(author ? { author } : {}),
  };
}

/** Task code (spec 11): sanitized project-code prefix + SEQUENCE value. */
export function buildTaskCode(projectCode: string, sequence: number): string {
  const prefix = projectCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${prefix.length > 0 ? prefix : 'TASK'}-${sequence}`;
}

/** Focus comparator (spec 23): doing > review > todo, then dueDate (nulls last), then updatedAt. */
export function compareFocus(a: Task, b: Task): number {
  const fa = TASK_FOCUS_ORDER[a.status] ?? 9;
  const fb = TASK_FOCUS_ORDER[b.status] ?? 9;
  if (fa !== fb) return fa - fb;
  const ad = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const bd = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return a.updatedAt.getTime() - b.updatedAt.getTime();
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(TaskComment) private readonly comments: Repository<TaskComment>,
    @InjectRepository(TaskStatusHistory) private readonly historyRepo: Repository<TaskStatusHistory>,
    @InjectRepository(Sprint) private readonly sprints: Repository<Sprint>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
  ) {}

  private async isSessionOwned(sessionId: string, userId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      'SELECT 1 AS ok FROM internship_sessions s WHERE s.id = @0 AND (s.leadInstructorId = @1 OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.sessionId = s.id AND si.instructorId = @1))',
      [sessionId, userId],
    );
    return rows.length > 0;
  }

  // ── list (spec 20/21/32/33) ─────────────────────────────────────────────
  async list(
    q: {
      page: number;
      pageSize: number;
      search?: string;
      projectId?: string;
      sprintId?: string;
      sessionId?: string;
      assigneeId?: string;
      status?: string;
      priority?: string;
      dueFrom?: string;
      dueTo?: string;
      mine?: boolean;
      sortBy?: 'createdAt' | 'dueDate' | 'priority';
      sortOrder?: 'ASC' | 'DESC';
    },
    principal: RequestPrincipal,
  ) {
    const codes = await this.permissions.getEffectivePermissionCodes(principal.userId);
    const broad = codes.has('tasks.view') || codes.has('tasks.manage');
    const admin = await this.permissions.hasRole(principal.userId, 'admin');
    // Interns (tasks.view.own) and permissionless callers are ALWAYS scoped
    // to their own tasks — request params can never widen the scope (spec 33).
    // Broad holders see everything only as admin; instructors with
    // tasks.view/manage see their managed scope (redesign §5).
    const mine = q.mine === true || !broad;
    const qb = this.tasks.createQueryBuilder('t');
    qb.where('t.deletedAt IS NULL');
    if (mine) {
      qb.andWhere('t.assigneeId = :me', { me: principal.userId });
    } else {
      if (!admin) {
        qb.andWhere(scopedProjectSessionClause('t.projectId', '(SELECT s.sessionId FROM sprints s WHERE s.id = t.sprintId)'), { [OWNER_PARAM]: principal.userId });
      }
      if (q.assigneeId) {
        qb.andWhere('t.assigneeId = :assigneeId', { assigneeId: q.assigneeId });
      }
    }
    if (q.search) {
      qb.andWhere('(UPPER(t.code) LIKE :search OR UPPER(t.title) LIKE :search)', {
        search: `%${q.search.trim().toUpperCase()}%`,
      });
    }
    if (q.projectId) qb.andWhere('t.projectId = :projectId', { projectId: q.projectId });
    if (q.sprintId) qb.andWhere('t.sprintId = :sprintId', { sprintId: q.sprintId });
    // M6: cross-session task overview needs a session filter (task.sprintId →
    // sprints.sessionId). Kept server-side and inside the existing scope clause.
    if (q.sessionId) {
      qb.andWhere('t.sprintId IN (SELECT s.id FROM sprints s WHERE s.sessionId = :sessionId)', {
        sessionId: q.sessionId,
      });
    }
    if (q.status) qb.andWhere('t.status = :status', { status: q.status });
    if (q.priority) qb.andWhere('t.priority = :priority', { priority: q.priority });
    if (q.dueFrom) qb.andWhere('t.dueDate >= :dueFrom', { dueFrom: new Date(q.dueFrom) });
    if (q.dueTo) qb.andWhere('t.dueDate <= :dueTo', { dueTo: new Date(q.dueTo) });
    const PRIORITY_CASE =
      "CASE t.priority WHEN 'low' THEN 0 WHEN 'medium' THEN 1 WHEN 'high' THEN 2 ELSE 3 END";
    if (q.sortBy === 'priority') qb.orderBy(PRIORITY_CASE, q.sortOrder ?? 'DESC');
    else qb.orderBy(`t.${q.sortBy ?? 'createdAt'}`, q.sortOrder ?? 'DESC');
    qb.addOrderBy('t.createdAt', 'DESC');
    qb.skip((q.page - 1) * q.pageSize).take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((t) => toTaskResponse(t)), total };
  }

  // ── detail (spec 33: assignee or tasks.view/manage holders) ─────────────
  async getOneDetailed(id: string, principal: RequestPrincipal): Promise<TaskResponse> {
    const task = await this.tasks.findOne({ where: { id } });
    if (!task || task.deletedAt !== null) throw taskNotFound();
    const codes = await this.permissions.getEffectivePermissionCodes(principal.userId);
    const broad = codes.has('tasks.view') || codes.has('tasks.manage');
    if (!broad && task.assigneeId !== principal.userId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'TASK_ACCESS_DENIED',
        message: 'You can only view your own tasks.',
      });
    }
    if (broad) {
      const admin = await this.permissions.hasRole(principal.userId, 'admin');
      if (!admin) {
        const project = await this.projects.findOne({ where: { id: task.projectId } });
        const projectVisible = project !== null && (project.mentorId === principal.userId || project.mentorId === null);
        let sessionOwned = true;
        if (task.sprintId !== null) {
          const sprint = await this.sprints.findOne({ where: { id: task.sprintId } });
          sessionOwned =
            sprint === null ||
            sprint.sessionId === null ||
            (await this.isSessionOwned(sprint.sessionId, principal.userId));
        }
        if (!projectVisible || !sessionOwned) {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'TASK_ACCESS_DENIED',
            message: 'You do not manage this task.',
          });
        }
      }
    }
    return this.loadDetailed(task);
  }

  // ── create (spec 10/11/12/14/17/18) ─────────────────────────────────────
  async create(
    input: {
      title: string;
      description?: string;
      projectId: string;
      sprintId?: string;
      assigneeId?: string;
      priority?: TaskPriority;
      storyPoints?: number;
      dueDate?: string;
    },
    ctx: ActorContext,
  ): Promise<TaskResponse> {
    let createdId = '';
    await this.dataSource.transaction(async (em) => {
      const project = await em
        .getRepository(Project)
        .findOne({ where: { id: input.projectId }, lock: { mode: 'pessimistic_write' } });
      if (!project) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found.',
        });
      }
      if (project.status !== 'active') {
        throw new ConflictException({
          statusCode: 409,
          code: 'PROJECT_NOT_ASSIGNABLE',
          message: `Project status '${project.status}' does not accept new tasks (only active).`,
          details: { status: project.status },
        });
      }
      const creator = ctx.actorId
        ? { userId: ctx.actorId, isAdmin: await this.permissions.hasRole(ctx.actorId, 'admin') }
        : undefined;
      if (creator && !creator.isAdmin && project.mentorId !== creator.userId) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'TASK_ACCESS_DENIED',
          message: 'Only the managing mentor can create tasks for this project. Claim it first.',
        });
      }
      if (input.sprintId) {
        const sprint = await em.getRepository(Sprint).findOne({ where: { id: input.sprintId } });
        if (!sprint) {
          throw new NotFoundException({
            statusCode: 404,
            code: 'SPRINT_NOT_FOUND',
            message: 'Sprint not found.',
          });
        }
        if (sprint.projectId.toLowerCase() !== input.projectId.toLowerCase()) {
          throw new ConflictException({
            statusCode: 409,
            code: 'SPRINT_PROJECT_MISMATCH',
            message: 'Sprint belongs to a different project — cross-project task relations are not allowed.',
            details: { sprintProjectId: sprint.projectId, taskProjectId: input.projectId },
          });
        }
        if (creator && !creator.isAdmin && sprint.sessionId) {
          const owned = await em.query(
            'SELECT 1 AS ok FROM internship_sessions s WHERE s.id = @0 AND (s.leadInstructorId = @1 OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.sessionId = s.id AND si.instructorId = @1))',
            [sprint.sessionId, creator.userId],
          );
          if (owned.length === 0) {
            throw new ForbiddenException({
              statusCode: 403,
              code: 'TASK_ACCESS_DENIED',
              message: 'You do not manage this sprint.',
            });
          }
        }
      }
      if (input.assigneeId) {
        await this.assertValidAssignee(em, input.assigneeId, input.projectId);
      }

      // Task code (spec 11): SEQUENCE + retry on the (rare) unique race.
      let task: Task | null = null;
      for (let attempt = 0; attempt < 3 && !task; attempt += 1) {
        try {
          const seqRows = (await em.query('SELECT NEXT VALUE FOR task_code_seq AS v')) as Array<{
            v: number | string;
          }>;
          const seq = Number(seqRows[0]?.v ?? 0);
          const code = buildTaskCode(project.code, seq);
          task = await em.save(
            em.create(Task, {
              code,
              title: input.title,
              description: input.description ?? null,
              projectId: project.id,
              sprintId: input.sprintId ?? null,
              assigneeId: input.assigneeId ?? null,
              createdById: ctx.actorId ?? null,
              status: 'todo' as TaskStatus,
              priority: input.priority ?? 'medium',
              storyPoints: input.storyPoints ?? null,
              progress: 0,
              dueDate: input.dueDate ? new Date(input.dueDate) : null,
            }),
          );
        } catch (err) {
          if (isUniqueViolation(err)) continue; // concurrent code race → next SEQUENCE value
          throw err;
        }
      }
      if (!task) {
        throw new ConflictException({
          statusCode: 409,
          code: 'TASK_CODE_CONFLICT',
          message: 'Task code generation conflicted after 3 attempts.',
        });
      }
      createdId = task.id;

      // History seed row (spec 12): null → 'todo', atomic with creation.
      await em.insert(TaskStatusHistory, {
        taskId: task.id,
        fromStatus: null,
        toStatus: 'todo' as TaskStatus,
        changedById: ctx.actorId ?? null,
        reason: null,
      });

      if (task.assigneeId && task.assigneeId !== ctx.actorId) {
        await this.notifyAssigned(em, task, ctx.actorId ?? null);
        await em.insert(ActivityEvent, {
          actorId: ctx.actorId ?? null,
          module: 'tasks',
          action: 'task.assigned',
          targetType: 'task',
          targetId: task.id,
          summary: `Task ${task.code} đã được giao`,
        });
      }

      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'task.created',
        targetType: 'task',
        targetId: task.id,
        detail: JSON.stringify({
          code: task.code,
          projectId: project.id,
          sprintId: task.sprintId,
          assigneeId: task.assigneeId,
        }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return task;
    });
    const created = await this.tasks.findOne({ where: { id: createdId } });
    if (!created) throw taskNotFound();
    return this.loadDetailed(created);
  }

  // ── manage update (spec 8/10/14/17/25) ──────────────────────────────────
  async update(
    id: string,
    patch: {
      expectedVersion?: number;
      title?: string;
      description?: string;
      sprintId?: string;
      assigneeId?: string | null;
      priority?: TaskPriority;
      storyPoints?: number;
      dueDate?: string | null;
      status?: TaskStatus;
      reason?: string;
    },
    ctx: ActorContext,
  ): Promise<TaskResponse> {
    let resultId = '';
    await this.dataSource.transaction(async (em) => {
      const task = await this.lockById(em, id);
      if (!task || task.deletedAt !== null) throw taskNotFound();
      if (ctx.actorId && !(await this.permissions.hasRole(ctx.actorId, 'admin'))) {
        const project = await em.getRepository(Project).findOne({ where: { id: task.projectId } });
        if (!project || project.mentorId !== ctx.actorId) {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'TASK_ACCESS_DENIED',
            message: 'Only the managing mentor can change this task. Claim the project first.',
          });
        }
      }
      const fields: string[] = [];
      this.assertExpectedVersion(task, patch.expectedVersion);

      if ((patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId)
        || (patch.status !== undefined && patch.status !== task.status)) {
        await this.assertNoPendingSubmission(em, task.id);
      }

      if (patch.sprintId !== undefined && patch.sprintId !== task.sprintId) {
        const sprint = await em.getRepository(Sprint).findOne({ where: { id: patch.sprintId } });
        if (!sprint) {
          throw new NotFoundException({
            statusCode: 404,
            code: 'SPRINT_NOT_FOUND',
            message: 'Sprint not found.',
          });
        }
        if (sprint.projectId.toLowerCase() !== task.projectId.toLowerCase()) {
          throw new ConflictException({
            statusCode: 409,
            code: 'SPRINT_PROJECT_MISMATCH',
            message: 'Sprint belongs to a different project — cross-project task moves are not allowed.',
            details: { sprintProjectId: sprint.projectId, taskProjectId: task.projectId },
          });
        }
        task.sprintId = patch.sprintId;
        fields.push('sprintId');
      }

      let reassigned = false;
      if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
        if (patch.assigneeId !== null) {
          await this.assertValidAssignee(em, patch.assigneeId, task.projectId);
        }
        task.assigneeId = patch.assigneeId;
        reassigned = true;
        fields.push('assigneeId');
      }

      if (patch.title !== undefined) {
        task.title = patch.title;
        fields.push('title');
      }
      if (patch.description !== undefined) {
        task.description = patch.description;
        fields.push('description');
      }
      if (patch.priority !== undefined) {
        task.priority = patch.priority;
        fields.push('priority');
      }
      if (patch.storyPoints !== undefined) {
        task.storyPoints = patch.storyPoints;
        fields.push('storyPoints');
      }
      if (patch.dueDate !== undefined) {
        task.dueDate = patch.dueDate === null ? null : new Date(patch.dueDate);
        fields.push('dueDate');
      }

      await this.assertCodeWorkflowTransition(em, task, patch.status);
      if (patch.status && patch.status !== task.status && patch.status !== 'todo') await assertTaskDependencies(em, task);
      const statusResult = this.validateAndApplyStatus(task, patch.status, { internSelf: false });

      await this.saveOrConflict(em, task);

      if (statusResult.changed) {
        await this.afterStatusChange(em, task, statusResult, {
          reason: patch.reason ?? null,
          actorId: ctx.actorId ?? null,
        });
      }
      if (fields.length > 0 || statusResult.changed) {
        await em.insert(AuditLog, {
          actorId: ctx.actorId ?? null,
          action: 'task.updated',
          targetType: 'task',
          targetId: task.id,
          detail: JSON.stringify({ fields, ...(statusResult.changed ? { status: statusResult } : {}) }),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
      }
      if (reassigned && task.assigneeId && task.assigneeId !== ctx.actorId) {
        await this.notifyAssigned(em, task, ctx.actorId ?? null);
        await em.insert(ActivityEvent, {
          actorId: ctx.actorId ?? null,
          module: 'tasks',
          action: 'task.assigned',
          targetType: 'task',
          targetId: task.id,
          summary: `Task ${task.code} được giao lại`,
        });
        await em.insert(AuditLog, {
          actorId: ctx.actorId ?? null,
          action: 'task.assignee_changed',
          targetType: 'task',
          targetId: task.id,
          detail: JSON.stringify({ assigneeId: task.assigneeId }),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
      }
      resultId = task.id;
      return task;
    });
    const updated = await this.tasks.findOne({ where: { id: resultId } });
    if (!updated) throw taskNotFound();
    return this.loadDetailed(updated);
  }

  // ── intern own-task update (spec 8/9/28) ────────────────────────────────
  async updateOwn(
    id: string,
    patch: { status?: TaskStatus; progress?: number; reason?: string; expectedVersion?: number },
    principal: RequestPrincipal,
    ctx: ActorContext,
  ): Promise<TaskResponse> {
    let resultId = '';
    await this.dataSource.transaction(async (em) => {
      const task = await this.lockById(em, id);
      if (!task || task.deletedAt !== null) throw taskNotFound();
      // Ownership (spec 8): intern may only mutate the task assigned to them.
      if (task.assigneeId !== principal.userId) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'TASK_NOT_OWNED',
          message: 'You can only update your own assigned task.',
        });
      }
      // Completed assignment (spec 28): the intern loses mutation rights; the
      // task itself is preserved (never deleted) and instructors can still
      // manage it — documented business rule.
      const active = await em.getRepository(Assignment).findOne({
        where: { internId: task.assigneeId, projectId: task.projectId, status: 'active' },
      });
      if (!active) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'ASSIGNMENT_NOT_ACTIVE',
          message: 'Your assignment on this project is no longer active.',
        });
      }

      this.assertExpectedVersion(task, patch.expectedVersion);
      await this.assertCodeWorkflowTransition(em, task, patch.status);
      if (patch.status && patch.status !== task.status && patch.status !== 'todo') await assertTaskDependencies(em, task);
      const statusResult = this.validateAndApplyStatus(task, patch.status, { internSelf: true });
      const doneOverride = statusResult.changed && statusResult.to === 'done';
      if (patch.progress !== undefined && !doneOverride) {
        if (task.status === 'done') {
          throw new ConflictException({
            statusCode: 409,
            code: 'INVALID_TASK_TRANSITION',
            message: 'Completed task is terminal — progress can no longer change.',
          });
        }
        task.progress = patch.progress;
      }

      await this.saveOrConflict(em, task);

      if (statusResult.changed) {
        await this.afterStatusChange(em, task, statusResult, {
          reason: patch.reason ?? null,
          actorId: ctx.actorId ?? null,
        });
      }
      if (statusResult.changed || patch.progress !== undefined) {
        await em.insert(AuditLog, {
          actorId: ctx.actorId ?? null,
          action: statusResult.changed ? 'task.status_changed' : 'task.progress_updated',
          targetType: 'task',
          targetId: task.id,
          detail: JSON.stringify(
            statusResult.changed
              ? { ...statusResult, self: true }
              : { progress: patch.progress, self: true },
          ),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
      }
      resultId = task.id;
      return task;
    });
    const updated = await this.tasks.findOne({ where: { id: resultId } });
    if (!updated) throw taskNotFound();
    return this.loadDetailed(updated);
  }

  // ── soft delete (spec 17) ───────────────────────────────────────────────
  async softDelete(id: string, ctx: ActorContext): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const task = await this.lockById(em, id);
      if (!task || task.deletedAt !== null) throw taskNotFound();
      if (ctx.actorId && !(await this.permissions.hasRole(ctx.actorId, 'admin'))) {
        const project = await em.getRepository(Project).findOne({ where: { id: task.projectId } });
        if (!project || project.mentorId !== ctx.actorId) {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'TASK_ACCESS_DENIED',
            message: 'Only the managing mentor can delete this task. Claim the project first.',
          });
        }
      }
      await this.assertNoPendingSubmission(em, task.id);
      task.deletedAt = new Date();
      await this.saveOrConflict(em, task);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'task.deleted',
        targetType: 'task',
        targetId: task.id,
        detail: JSON.stringify({ code: task.code }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return task;
    });
  }

  // ── comments (spec 13) ──────────────────────────────────────────────────
  async listComments(
    taskId: string,
    q: { page: number; pageSize: number },
    principal: RequestPrincipal,
  ) {
    const task = await this.assertVisibleTask(taskId, principal);
    const qb = this.comments
      .createQueryBuilder('c')
      .where('c.taskId = :taskId', { taskId: task.id })
      .orderBy('c.createdAt', 'ASC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((c) => toCommentResponse(c)), total };
  }

  async addComment(
    taskId: string,
    content: string,
    principal: RequestPrincipal,
  ): Promise<TaskCommentResponse> {
    const task = await this.assertVisibleTask(taskId, principal);
    const comment = await this.comments.save(
      this.comments.create({ taskId: task.id, authorId: principal.userId, content }),
    );
    return toCommentResponse(comment);
  }

  // ── status history (spec 12) ────────────────────────────────────────────
  async listHistory(
    taskId: string,
    q: { page: number; pageSize: number },
    principal: RequestPrincipal,
  ) {
    const task = await this.assertVisibleTask(taskId, principal);
    const qb = this.historyRepo
      .createQueryBuilder('h')
      .where('h.taskId = :taskId', { taskId: task.id })
      .orderBy('h.createdAt', 'ASC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    const mapped: TaskHistoryResponse[] = items.map((h) => ({
      id: h.id,
      taskId: h.taskId,
      fromStatus: h.fromStatus ?? null,
      toStatus: h.toStatus,
      changedById: h.changedById ?? null,
      reason: h.reason ?? null,
      createdAt: h.createdAt,
    }));
    return { items: mapped, total };
  }

  // ── intern workspace extension (spec 23) — REAL Phase 3 data only ───────
  async workspaceExtension(userId: string, projectId: string): Promise<InternTaskWorkspaceData> {
    const activeSprint = await this.sprints.findOne({ where: { projectId, status: 'active' } });
    const ownTasks = await this.tasks.find({
      where: { assigneeId: userId, projectId, deletedAt: IsNull() },
    });
    const taskSummary = { todo: 0, doing: 0, review: 0, done: 0, total: ownTasks.length };
    for (const t of ownTasks) taskSummary[t.status] += 1;
    const open = ownTasks.filter((t) => t.status !== 'done').sort(compareFocus);
    const focused = open[0] ?? null;
    return {
      currentSprint: activeSprint
        ? {
            id: activeSprint.id,
            code: activeSprint.code,
            name: activeSprint.name,
            status: activeSprint.status,
            startDate: activeSprint.startDate,
            endDate: activeSprint.endDate,
          }
        : null,
      taskSummary,
      focusedTask: focused
        ? {
            id: focused.id,
            code: focused.code,
            title: focused.title,
            status: focused.status,
            priority: focused.priority,
            dueDate: focused.dueDate ?? null,
            progress: focused.progress,
          }
        : null,
    };
  }

  // ── private core ────────────────────────────────────────────────────────

  /**
   * Pure status-transition validation + entity mutation (spec 7/25). THROWS
   * on illegal transitions; performs NO writes — the caller saves the task
   * exactly once, then invokes afterStatusChange() for the side effects.
   */
  private validateAndApplyStatus(
    task: Task,
    to: TaskStatus | undefined,
    opts: { internSelf: boolean },
  ): StatusChangeResult {
    if (to === undefined || to === task.status) return { changed: false };
    const from = task.status;
    if (!canTransitionTask(from, to)) throw transitionConflict(from, to);
    if (opts.internSelf && !isInternAllowedTaskTransition(from, to)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'INVALID_TASK_TRANSITION',
        message: 'Interns may only move their task todo→doing or doing→review.',
        details: { from, to },
      });
    }
    task.status = to;
    if (to === 'done') task.progress = 100;
    return { changed: true, from, to };
  }

  /**
   * Post-save side effects (spec 12/14/15/18) — history row + notification +
   * activity, all through the SAME transactional EntityManager.
   */
  private async afterStatusChange(
    em: EntityManager,
    task: Task,
    result: StatusChangeResult,
    opts: { reason: string | null; actorId: string | null },
  ): Promise<void> {
    const from = result.from as TaskStatus;
    const to = result.to as TaskStatus;
    await em.insert(TaskStatusHistory, {
      taskId: task.id,
      fromStatus: from,
      toStatus: to,
      changedById: opts.actorId,
      reason: opts.reason,
    });

    if (to === 'review' && task.createdById && task.createdById !== opts.actorId) {
      await this.notifyInTransaction(em, {
        userId: task.createdById,
        type: 'task',
        category: 'task',
        title: 'Task chờ review',
        body: `Task "${task.title}" (${task.code}) đã được gửi lên review.`,
        linkUrl: `/intern/tasks/${task.id}`,
      });
    }
    if (to === 'done') {
      const targets = [...new Set([task.assigneeId, task.createdById])].filter(
        (id): id is string => Boolean(id) && id !== opts.actorId,
      );
      for (const userId of targets) {
        await this.notifyInTransaction(em, {
          userId,
          type: 'task',
          category: 'task',
          title: 'Task đã hoàn thành',
          body: `Task "${task.title}" (${task.code}) đã được duyệt hoàn thành.`,
          linkUrl: `/intern/tasks/${task.id}`,
        });
      }
    }
    if (from === 'review' && to === 'doing' && task.assigneeId && task.assigneeId !== opts.actorId) {
      await this.notifyInTransaction(em, {
        userId: task.assigneeId,
        type: 'task',
        category: 'task',
        title: 'Task cần làm lại',
        body: `Task "${task.title}" (${task.code}) được yêu cầu làm lại.`,
        linkUrl: `/intern/tasks/${task.id}`,
      });
    }

    if (to === 'review' || to === 'done') {
      await em.insert(ActivityEvent, {
        actorId: opts.actorId,
        module: 'tasks',
        action: to === 'review' ? 'task.review_submitted' : 'task.completed',
        targetType: 'task',
        targetId: task.id,
        summary: to === 'review' ? `Task ${task.code} chờ review` : `Task ${task.code} hoàn thành`,
      });
    }
  }

  /** Single-save point per transaction + optimistic-concurrency guard (spec 25). */
  private async saveOrConflict(em: EntityManager, task: Task): Promise<void> {
    try {
      await em.save(task);
    } catch (err) {
      if (err instanceof OptimisticLockVersionMismatchError) {
        throw new ConflictException({
          statusCode: 409,
          code: 'TASK_VERSION_CONFLICT',
          message: 'Task was modified concurrently — reload and retry.',
        });
      }
      throw err;
    }
  }

  private async assertCodeWorkflowTransition(em: EntityManager, task: Task, target?: TaskStatus): Promise<void> {
    if (!target || target === task.status || !['review', 'done'].includes(target) || !task.sprintId) return;
    const workflow = await em.query('SELECT TOP(1) tr.id FROM template_runs tr JOIN sprints sp ON sp.sessionId=tr.sessionId AND sp.projectId=tr.projectId WHERE sp.id=@0', [task.sprintId]);
    if (workflow.length) throw new ConflictException({ code: 'CODE_SUBMISSION_REQUIRED', message: 'Task của phiên dự án phải được nộp code và giảng viên xác nhận qua mục Bài nộp; không chuyển sang review/done trực tiếp.' });
  }

  private async assertNoPendingSubmission(em: EntityManager, taskId: string): Promise<void> {
    const rows: unknown[] = await em.query(
      "SELECT TOP 1 id FROM task_submissions WHERE taskId = @0 AND status = 'submitted'",
      [taskId],
    );
    if (rows.length) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SUBMISSION_PENDING_REVIEW',
        message: 'Review the pending submission before changing task status, assignee, or deleting it.',
      });
    }
  }

  private assertExpectedVersion(task: Task, expectedVersion?: number): void {
    if (expectedVersion !== undefined && task.version !== expectedVersion) {
      throw new ConflictException({
        statusCode: 409,
        code: 'TASK_VERSION_CONFLICT',
        message: 'Task was modified since you opened it — reload and retry.',
        details: { currentVersion: task.version },
      });
    }
  }

  /**
   * Assignment boundary (spec 27): the assignee must be an ACTIVE user with
   * an ACTIVE assignment on THIS project — never inferred from a role name.
   */
  private async assertValidAssignee(
    em: EntityManager,
    assigneeId: string,
    projectId: string,
  ): Promise<void> {
    const user = await em.getRepository(User).findOne({ where: { id: assigneeId } });
    if (!user || user.status !== 'active') {
      throw new ConflictException({
        statusCode: 409,
        code: 'INVALID_ASSIGNEE',
        message: 'Assignee not found or account is not active.',
        details: { assigneeId },
      });
    }
    const assignment = await em.getRepository(Assignment).findOne({
      where: { internId: assigneeId, projectId, status: 'active' },
    });
    if (!assignment) {
      throw new ConflictException({
        statusCode: 409,
        code: 'INVALID_ASSIGNEE',
        message: 'Assignee has no active assignment on this project.',
        details: { assigneeId, projectId },
      });
    }
  }

  private async notifyAssigned(em: EntityManager, task: Task, actorId: string | null): Promise<void> {
    if (!task.assigneeId || task.assigneeId === actorId) return;
    await this.notifyInTransaction(em, {
      userId: task.assigneeId,
      type: 'task',
      category: 'task',
      title: 'Bạn được giao task mới',
      body: `Task "${task.title}" (${task.code}) đã được giao cho bạn.`,
      linkUrl: `/intern/tasks/${task.id}`,
    });
  }

  private async assertVisibleTask(taskId: string, principal: RequestPrincipal): Promise<Task> {
    const task = await this.tasks.findOne({ where: { id: taskId } });
    if (!task || task.deletedAt !== null) throw taskNotFound();
    const codes = await this.permissions.getEffectivePermissionCodes(principal.userId);
    const broad = codes.has('tasks.view') || codes.has('tasks.manage');
    if (!broad && task.assigneeId !== principal.userId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'TASK_ACCESS_DENIED',
        message: 'You can only access your own tasks.',
      });
    }
    return task;
  }

  private async loadDetailed(task: Task): Promise<TaskResponse> {
    const [project, sprint, assignee] = await Promise.all([
      this.projects.findOne({ where: { id: task.projectId } }),
      task.sprintId ? this.sprints.findOne({ where: { id: task.sprintId } }) : Promise.resolve(null),
      task.assigneeId ? this.users.findOne({ where: { id: task.assigneeId } }) : Promise.resolve(null),
    ]);
    return toTaskResponse(task, {
      project: project
        ? { id: project.id, code: project.code, name: project.name, status: project.status }
        : undefined,
      sprint: sprint
        ? { id: sprint.id, code: sprint.code, name: sprint.name, status: sprint.status }
        : undefined,
      assignee: assignee
        ? { id: assignee.id, displayName: assignee.displayName, email: assignee.email }
        : undefined,
    });
  }

  private async lockById(em: EntityManager, id: string): Promise<Task | null> {
    return em.getRepository(Task).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** Preference-aware notification written through the transactional EM. */
  private async notifyInTransaction(
    em: EntityManager,
    payload: { userId: string; type: string; category: string; title: string; body: string; linkUrl: string },
  ): Promise<void> {
    const pref = await em.getRepository(NotificationPreference).findOne({
      where: { userId: payload.userId, category: payload.category },
    });
    if (pref && !pref.enabled) return;
    await em.insert(Notification, {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      linkUrl: payload.linkUrl,
    });
  }
}
