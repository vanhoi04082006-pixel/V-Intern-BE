import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { isUniqueViolation } from '../common/utils/db-errors';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { Task } from '../tasks/entities/task.entity';
import { ActorContext } from '../users/users.service';
import { Project } from '../projects/entities/project.entity';
import { OWNER_PARAM, resolveOwnership, scopedProjectSessionClause, type Ownership } from '../rbac/ownership';
import { PermissionsService } from '../rbac/permissions.service';
import { Sprint } from './entities/sprint.entity';
import { canTransitionSprint, isSprintTerminal, type SprintStatus } from './sprint-status.machine';

/**
 * Sprint contract (spec 2/3/4/19/22/29/30):
 * - Legal transitions ONLY (state machine): planned→active|cancelled,
 *   active→completed|cancelled; terminals frozen → 409 INVALID_SPRINT_TRANSITION.
 * - ONE active sprint per project: service pre-check (409 SPRINT_ACTIVE_EXISTS)
 *   + DB filtered unique index UX_sprints_project_active as the hard guarantee.
 * - Completion policy: reject 409 SPRINT_HAS_OPEN_TASKS while open tasks exist
 *   unless the caller explicitly passes allowOpenTasks (audited).
 * - Activation is transactional: status change + audit + activity + preference-
 *   aware notifications to the project's active-assignment interns in ONE tx.
 * - Board + completion aggregate REAL rows — no fabricated metrics.
 */
export interface SprintResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  projectId: string;
  sessionId: string | null;
  status: string;
  goal: string | null;
  startDate: Date;
  endDate: Date;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  project?: { id: string; code: string; name: string; status: string };
  session?: { id: string; code: string; name: string; status: string };
}

export interface SprintBoardTask {
  id: string;
  code: string;
  title: string;
  description: string | null;
  storyPoints: number | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  progress: number;
  dueDate: Date | null;
}

export interface SprintBoardColumn {
  status: string;
  count: number;
  tasks: SprintBoardTask[];
}

export interface SprintBoardResponse {
  sprint: {
    id: string;
    code: string;
    name: string;
    status: string;
    projectId: string;
    sessionId: string | null;
    goal: string | null;
    description: string | null;
    startDate: Date;
    endDate: Date;
  };
  columns: SprintBoardColumn[];
  total: number;
  overdueOpenTaskCount: number;
}

export interface SprintCompletionSummary {
  total: number;
  done: number;
  open: number;
  committedStoryPoints: number | null;
  completedStoryPoints: number | null;
}

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const BOARD_ORDER: readonly string[] = ['todo', 'doing', 'review', 'done'];

const notFound = () =>
  new NotFoundException({ statusCode: 404, code: 'SPRINT_NOT_FOUND', message: 'Sprint not found.' });

function toSprintResponse(
  s: Sprint,
  extras?: { project?: SprintResponse['project']; session?: SprintResponse['session'] },
): SprintResponse {
  return {
    // Canonical lowercase UUIDs (mssql UNIQUEIDENTIFIER reads back uppercase).
    id: s.id.toLowerCase(),
    code: s.code,
    name: s.name,
    description: s.description ?? null,
    projectId: s.projectId.toLowerCase(),
    sessionId: s.sessionId ? s.sessionId.toLowerCase() : null,
    status: s.status,
    goal: s.goal ?? null,
    startDate: s.startDate,
    endDate: s.endDate,
    createdById: s.createdById ? s.createdById.toLowerCase() : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    ...(extras ?? {}),
  };
}

function toBoardTask(t: Task): SprintBoardTask {
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    description: t.description ?? null,
    storyPoints: t.storyPoints ?? null,
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeId ?? null,
    progress: t.progress,
    dueDate: t.dueDate ?? null,
  };
}

@Injectable()
export class SprintsService {
  constructor(
    @InjectRepository(Sprint) private readonly sprints: Repository<Sprint>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(InternshipSession) private readonly sessions: Repository<InternshipSession>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
  ) {}

  private async ownership(actorId?: string | null): Promise<Ownership | undefined> {
    if (!actorId) return undefined;
    return resolveOwnership(this.permissions, actorId);
  }

  private async isSessionOwned(sessionId: string, userId: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      'SELECT 1 AS ok FROM internship_sessions s WHERE s.id = @0 AND (s.leadInstructorId = @1 OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.sessionId = s.id AND si.instructorId = @1))',
      [sessionId, userId],
    );
    return rows.length > 0;
  }

  private async isSessionOwnedTx(em: EntityManager, sessionId: string, userId: string): Promise<boolean> {
    const rows = await em.query(
      'SELECT 1 AS ok FROM internship_sessions s WHERE s.id = @0 AND (s.leadInstructorId = @1 OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.sessionId = s.id AND si.instructorId = @1))',
      [sessionId, userId],
    );
    return rows.length > 0;
  }

  /** Read rule: parent project visible AND session (if any) owned. */
  private async assertSprintVisible(sprint: Sprint, o?: Ownership): Promise<void> {
    if (!o || o.isAdmin) return;
    const project = await this.projects.findOne({ where: { id: sprint.projectId } });
    if (!project || (project.mentorId !== o.userId && project.mentorId !== null)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SPRINT_SCOPE_FORBIDDEN',
        message: 'You do not manage this sprint.',
      });
    }
    if (sprint.sessionId && !(await this.isSessionOwned(sprint.sessionId, o.userId))) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SPRINT_SCOPE_FORBIDDEN',
        message: 'You do not manage this sprint.',
      });
    }
  }

  /** Write rule: project claimed by the actor AND session (if any) owned. */
  private async assertSprintManaged(sprint: Sprint, o?: Ownership): Promise<void> {
    if (!o || o.isAdmin) return;
    const project = await this.projects.findOne({ where: { id: sprint.projectId } });
    if (!project || project.mentorId !== o.userId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SPRINT_SCOPE_FORBIDDEN',
        message: 'Only the managing mentor can change this sprint. Claim the project first.',
      });
    }
    if (sprint.sessionId && !(await this.isSessionOwned(sprint.sessionId, o.userId))) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SPRINT_SCOPE_FORBIDDEN',
        message: 'You do not manage this sprint.',
      });
    }
  }

  async list(q: { page: number; pageSize: number; projectId?: string; sessionId?: string; status?: string; assigneeId?: string; dueFrom?: string; dueTo?: string; search?: string }, o?: Ownership) {
    const qb = this.sprints.createQueryBuilder('s');
    if (o && !o.isAdmin) {
      qb.andWhere(scopedProjectSessionClause('s.projectId', 's.sessionId'), { [OWNER_PARAM]: o.userId });
    }
    if (q.projectId) qb.andWhere('s.projectId = :projectId', { projectId: q.projectId });
    if (q.sessionId) qb.andWhere('s.sessionId = :sessionId', { sessionId: q.sessionId });
    if (q.status) qb.andWhere('s.status = :status', { status: q.status });
    if (q.assigneeId) qb.andWhere('EXISTS (SELECT 1 FROM tasks t WHERE t.sprintId=s.id AND t.deletedAt IS NULL AND t.assigneeId=:assigneeId)', { assigneeId: q.assigneeId });
    if (q.dueFrom) qb.andWhere('s.endDate >= :dueFrom', { dueFrom: new Date(q.dueFrom) });
    if (q.dueTo) qb.andWhere('s.endDate <= :dueTo', { dueTo: new Date(q.dueTo) });
    if (q.search?.trim()) qb.andWhere('(s.code LIKE :search OR s.name LIKE :search OR s.goal LIKE :search)', { search: `%${q.search.trim()}%` });
    qb.orderBy('s.createdAt', 'DESC')
      .addOrderBy('s.id', 'ASC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((s) => toSprintResponse(s)), total };
  }

  /** Internal student read: caller must resolve the principal's active assignment. */
  async listForAssignment(projectId: string, sessionId: string, q: { page: number; pageSize: number }) {
    const [items, total] = await this.sprints.createQueryBuilder('s')
      .where('s.projectId=:projectId', { projectId })
      .andWhere('(s.sessionId=:sessionId OR s.sessionId IS NULL)', { sessionId })
      .orderBy("CASE s.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END", 'ASC')
      .addOrderBy('s.startDate', 'ASC').addOrderBy('s.id', 'ASC')
      .skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
    return { items: items.map(s => toSprintResponse(s)), total };
  }

  async getOneDetailed(id: string, o?: Ownership): Promise<SprintResponse> {
    const sprint = await this.sprints.findOne({ where: { id } });
    if (!sprint) throw notFound();
    await this.assertSprintVisible(sprint, o);
    const [project, session] = await Promise.all([
      this.projects.findOne({ where: { id: sprint.projectId } }),
      sprint.sessionId ? this.sessions.findOne({ where: { id: sprint.sessionId } }) : Promise.resolve(null),
    ]);
    return toSprintResponse(sprint, {
      project: project
        ? { id: project.id, code: project.code, name: project.name, status: project.status }
        : undefined,
      session: session
        ? { id: session.id, code: session.code, name: session.name, status: session.status }
        : undefined,
    });
  }

  async create(
    input: {
      code: string;
      name: string;
      description?: string;
      projectId: string;
      sessionId?: string;
      goal?: string;
      startDate: string;
      endDate: string;
    },
    ctx: ActorContext,
  ): Promise<SprintResponse> {
    let createdId = '';
    const creator = await this.ownership(ctx.actorId);
    await this.dataSource.transaction(async (em) => {
      const project = await em.getRepository(Project).findOne({ where: { id: input.projectId } });
      if (!project) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found.',
        });
      }
      if (creator && !creator.isAdmin && project.mentorId !== creator.userId) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'SPRINT_SCOPE_FORBIDDEN',
          message: 'Only the managing mentor can create sprints for this project. Claim it first.',
        });
      }
      if (project.status !== 'active') {
        throw new ConflictException({
          statusCode: 409,
          code: 'PROJECT_NOT_ASSIGNABLE',
          message: `Project status '${project.status}' does not accept new sprints (only active).`,
          details: { status: project.status },
        });
      }
      if (input.sessionId) {
        const session = await em.getRepository(InternshipSession).findOne({ where: { id: input.sessionId } });
        if (!session) {
          throw new NotFoundException({
            statusCode: 404,
            code: 'SESSION_NOT_FOUND',
            message: 'Internship session not found.',
          });
        }
        if (creator && !creator.isAdmin && !(await this.isSessionOwnedTx(em, input.sessionId, creator.userId))) {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'SPRINT_SCOPE_FORBIDDEN',
            message: 'You do not manage this internship session.',
          });
        }
      }
      const codeTaken = await em.getRepository(Sprint).findOne({ where: { code: input.code } });
      if (codeTaken) {
        throw new ConflictException({
          statusCode: 409,
          code: 'SPRINT_CODE_TAKEN',
          message: 'Sprint code already exists.',
          details: { code: input.code },
        });
      }
      const sprint = await em.save(
        em.create(Sprint, {
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          projectId: project.id,
          sessionId: input.sessionId ?? null,
          goal: input.goal ?? null,
          status: 'planned' as SprintStatus,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          createdById: ctx.actorId ?? null,
        }),
      );
      createdId = sprint.id;
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'sprint.created',
        targetType: 'sprint',
        targetId: sprint.id,
        detail: JSON.stringify({ code: sprint.code, projectId: project.id }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return sprint;
    });
    return this.getOneDetailed(createdId);
  }

  async update(
    id: string,
    patch: { name?: string; description?: string; goal?: string; startDate?: string; endDate?: string },
    ctx: ActorContext,
  ): Promise<SprintResponse> {
    await this.dataSource.transaction(async (em) => {
      const sprint = await this.lockById(em, id);
      if (!sprint) throw notFound();
      await this.assertSprintManaged(sprint, await this.ownership(ctx.actorId));
      if (isSprintTerminal(sprint.status)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'INVALID_SPRINT_TRANSITION',
          message: `Sprint in terminal status '${sprint.status}' cannot be edited.`,
          details: { status: sprint.status },
        });
      }
      const nextStart = patch.startDate ? new Date(patch.startDate) : sprint.startDate;
      const nextEnd = patch.endDate ? new Date(patch.endDate) : sprint.endDate;
      if (nextEnd.getTime() < nextStart.getTime()) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_SPRINT_DATES',
          message: 'Sprint endDate must be on or after startDate.',
        });
      }
      if (patch.name !== undefined) sprint.name = patch.name;
      if (patch.description !== undefined) sprint.description = patch.description;
      if (patch.goal !== undefined) sprint.goal = patch.goal;
      if (patch.startDate !== undefined) sprint.startDate = nextStart;
      if (patch.endDate !== undefined) sprint.endDate = nextEnd;
      await em.save(sprint);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'sprint.updated',
        targetType: 'sprint',
        targetId: sprint.id,
        detail: JSON.stringify({ fields: Object.keys(patch) }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return sprint;
    });
    return this.getOneDetailed(id);
  }

  /**
   * Status transition (spec 3/4/29) — ONE transaction: row lock, machine
   * validation, one-active pre-check, open-tasks policy, save, audit,
   * activity + preference-aware notifications on activation.
   */
  async transition(
    id: string,
    to: SprintStatus,
    opts: { allowOpenTasks?: boolean } = {},
    ctx?: ActorContext,
  ): Promise<SprintResponse> {
    const actor: ActorContext = ctx ?? {};
    await this.dataSource.transaction(async (em) => {
      const sprint = await this.lockById(em, id);
      if (!sprint) throw notFound();
      await this.assertSprintManaged(sprint, await this.ownership(ctx?.actorId));
      const from = sprint.status;
      if (!canTransitionSprint(from, to)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'INVALID_SPRINT_TRANSITION',
          message: `Illegal sprint transition '${from}' → '${to}'.`,
          details: {
            from,
            to,
            legal: ['planned->active', 'planned->cancelled', 'active->completed', 'active->cancelled'],
          },
        });
      }
      if (to === 'active') {
        const other = await em.getRepository(Sprint).findOne({
          where: { projectId: sprint.projectId, status: 'active' },
        });
        if (other && other.id !== sprint.id) {
          throw new ConflictException({
            statusCode: 409,
            code: 'SPRINT_ACTIVE_EXISTS',
            message: 'Project already has an active sprint (one active sprint per project).',
            details: { activeSprintId: other.id },
          });
        }
      }
      let openTasks = 0;
      if (to === 'completed') {
        openTasks = await this.countOpenTasks(em, sprint.id);
        if (openTasks > 0 && !opts.allowOpenTasks) {
          throw new ConflictException({
            statusCode: 409,
            code: 'SPRINT_HAS_OPEN_TASKS',
            message: 'Sprint still has open tasks. Pass allowOpenTasks=true to override (audited).',
            details: { openTasks },
          });
        }
      }
      sprint.status = to;
      try {
        await em.save(sprint);
      } catch (err) {
        if (isUniqueViolation(err)) {
          // UX_sprints_project_active raced at the DB level.
          throw new ConflictException({
            statusCode: 409,
            code: 'SPRINT_ACTIVE_EXISTS',
            message: 'Project already has an active sprint (DB-enforced).',
          });
        }
        throw err;
      }
      await em.insert(AuditLog, {
        actorId: actor.actorId ?? null,
        action: 'sprint.status_changed',
        targetType: 'sprint',
        targetId: sprint.id,
        detail: JSON.stringify({ from, to, allowOpenTasks: opts.allowOpenTasks === true ? true : undefined }),
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
      });
      if (to === 'active') {
        await em.insert(ActivityEvent, {
          actorId: actor.actorId ?? null,
          module: 'sprints',
          action: 'sprint.activated',
          targetType: 'sprint',
          targetId: sprint.id,
          summary: `Sprint ${sprint.code} đã hoạt động`,
        });
        const assignments = await em.getRepository(Assignment).find({
          where: { projectId: sprint.projectId, status: 'active' },
        });
        for (const assignment of assignments) {
          if (assignment.internId === actor.actorId) continue;
          await this.notifyInTransaction(em, {
            userId: assignment.internId,
            type: 'task',
            category: 'task',
            title: 'Sprint mới đã bắt đầu',
            body: `Sprint "${sprint.name}" của đồ án bạn đã được kích hoạt.`,
            linkUrl: `/intern/sprints/${sprint.id}`,
          });
        }
      }
      return sprint;
    });
    return this.getOneDetailed(id);
  }

  /**
   * Sprint board (spec 22) — REAL grouping: tasks grouped by their ACTUAL
   * status; counts derive from real rows (never hardcoded). Column task
   * arrays are bounded by page/pageSize (per column) while `count` carries
   * the true column size. Ordered priority (critical→low), then dueDate
   * (nulls last), then createdAt.
   */
  async board(id: string, q: { page: number; pageSize: number; status?: string }, assigneeId?: string, o?: Ownership): Promise<SprintBoardResponse> {
    const sprint = await this.sprints.findOne({ where: { id } });
    if (!sprint) throw notFound();
    await this.assertSprintVisible(sprint, o);
    const qb = this.tasks
      .createQueryBuilder('t')
      .where('t.sprintId = :id AND t.deletedAt IS NULL', { id });
    if (assigneeId) qb.andWhere('t.assigneeId = :assigneeId', { assigneeId });
    if (q.status) qb.andWhere('t.status = :status', { status: q.status });
    const tasks = await qb.getMany();
    tasks.sort((a, b) => {
      const pr = (PRIORITY_RANK[b.priority] ?? -1) - (PRIORITY_RANK[a.priority] ?? -1);
      if (pr !== 0) return pr;
      const ad = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bd = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const start = (q.page - 1) * q.pageSize;
    const columns: SprintBoardColumn[] = BOARD_ORDER.filter((status) => !q.status || status === q.status).map(
      (status) => {
        const inColumn = tasks.filter((t) => t.status === status);
        return { status, count: inColumn.length, tasks: inColumn.slice(start, start + q.pageSize).map(toBoardTask) };
      },
    );
    const now = Date.now();
    return {
      sprint: {
        id: sprint.id.toLowerCase(),
        code: sprint.code,
        name: sprint.name,
        status: sprint.status,
        projectId: sprint.projectId.toLowerCase(),
        sessionId: sprint.sessionId?.toLowerCase() ?? null,
        goal: sprint.goal ?? null,
        description: sprint.description ?? null,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
      },
      columns,
      total: tasks.length,
      overdueOpenTaskCount: tasks.filter(task => task.status !== 'done' && task.dueDate !== null && task.dueDate !== undefined && task.dueDate.getTime() < now).length,
    };
  }

  /**
   * Story-point aggregation straight from the DB (spec 30). NULL when no
   * task in scope declares story points — never fabricated metrics.
   */
  async completion(id: string, o?: Ownership): Promise<SprintCompletionSummary> {
    const sprint = await this.sprints.findOne({ where: { id } });
    if (!sprint) throw notFound();
    await this.assertSprintVisible(sprint, o);
    const total = await this.tasks.count({ where: { sprintId: id, deletedAt: IsNull() } });
    const done = await this.tasks.count({ where: { sprintId: id, deletedAt: IsNull(), status: 'done' } });
    const committedRow = await this.tasks
      .createQueryBuilder('t')
      .select('SUM(t.storyPoints)', 'sum')
      .where('t.sprintId = :id AND t.deletedAt IS NULL', { id })
      .getRawOne<{ sum: string | number | null }>();
    const doneRow = await this.tasks
      .createQueryBuilder('t')
      .select('SUM(t.storyPoints)', 'sum')
      .where("t.sprintId = :id AND t.deletedAt IS NULL AND t.status = 'done'", { id })
      .getRawOne<{ sum: string | number | null }>();
    const toNumber = (v: string | number | null | undefined): number | null =>
      v === null || v === undefined ? null : Number(v);
    return {
      total,
      done,
      open: total - done,
      committedStoryPoints: toNumber(committedRow?.sum),
      completedStoryPoints: toNumber(doneRow?.sum),
    };
  }

  private countOpenTasks(em: EntityManager, sprintId: string): Promise<number> {
    return em
      .getRepository(Task)
      .createQueryBuilder('t')
      .where('t.sprintId = :id AND t.deletedAt IS NULL AND t.status != :done', { id: sprintId, done: 'done' })
      .getCount();
  }

  private async lockById(em: EntityManager, id: string): Promise<Sprint | null> {
    return em.getRepository(Sprint).findOne({
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
