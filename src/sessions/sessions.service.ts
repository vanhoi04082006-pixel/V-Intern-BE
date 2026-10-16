import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { isUniqueViolation } from '../common/utils/db-errors';
import { OWNER_PARAM, resolveOwnership, sessionScope, type Ownership } from '../rbac/ownership';
import { PermissionsService } from '../rbac/permissions.service';
import { User } from '../users/entities/user.entity';
import { ActorContext } from '../users/users.service';
import { InternshipSession } from './entities/internship-session.entity';
import { SessionInstructor } from './entities/session-instructor.entity';
import { SessionMember } from './entities/session-member.entity';
import { SessionMilestone } from './entities/session-milestone.entity';
import { canTransitionSession, isSessionAssignable } from './session-status.machine';

export interface SessionResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  leadInstructorId: string | null;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionMemberRow {
  userId: string;
  displayName: string;
  email: string;
  joinedAt: Date;
}

export interface SessionInstructorRow {
  instructorId: string;
  displayName: string;
  email: string;
  assignedAt: Date;
}

export function toSessionResponse(s: InternshipSession): SessionResponse {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description ?? null,
    status: s.status,
    leadInstructorId: s.leadInstructorId ?? null,
    startDate: s.startDate,
    endDate: s.endDate,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function toDateOrNull(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(InternshipSession) private readonly sessions: Repository<InternshipSession>,
    @InjectRepository(SessionMember) private readonly members: Repository<SessionMember>,
    @InjectRepository(SessionInstructor) private readonly instructors: Repository<SessionInstructor>,
    @InjectRepository(SessionMilestone) private readonly milestones: Repository<SessionMilestone>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  async list(q: { page: number; pageSize: number; q?: string; status?: string; projectId?: string; leadInstructorId?: string }, o?: Ownership) {
    const qb = this.sessions.createQueryBuilder('s');
    if (o && !o.isAdmin) {
      const scope = sessionScope('s', o);
      if (scope) qb.andWhere(scope.clause, { [OWNER_PARAM]: o.userId });
    }
    if (q.q && q.q.length > 0) {
      const term = `%${q.q}%`;
      qb.andWhere('(s.code LIKE :term OR s.name LIKE :term)', { term });
    }
    if (q.status) qb.andWhere('s.status = :status', { status: q.status });
    if (q.leadInstructorId) qb.andWhere('s.leadInstructorId = :leadInstructorId', { leadInstructorId: q.leadInstructorId });
    if (q.projectId) qb.andWhere('(EXISTS(SELECT 1 FROM assignments a WHERE a.sessionId=s.id AND a.projectId=:projectId) OR EXISTS(SELECT 1 FROM template_runs r WHERE r.sessionId=s.id AND r.projectId=:projectId))', { projectId: q.projectId });
    qb.orderBy('s.startDate', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map(toSessionResponse), total };
  }

  async memberOptions(q: { page: number; pageSize: number; q?: string; sessionId?: string; projectId?: string }, o: Ownership) {
    const scope = sessionScope('s', o);
    const clauses = ['m.userId = u.id'];
    if (scope) clauses.push(scope.clause);
    if (q.sessionId) clauses.push('s.id = :sessionId');
    if (q.projectId) clauses.push('(EXISTS (SELECT 1 FROM template_runs r WHERE r.sessionId=s.id AND r.projectId=:projectId) OR EXISTS (SELECT 1 FROM assignments a WHERE a.sessionId=s.id AND a.projectId=:projectId))');
    const qb = this.users.createQueryBuilder('u')
      .where(`EXISTS (SELECT 1 FROM session_members m JOIN internship_sessions s ON s.id=m.sessionId WHERE ${clauses.join(' AND ')})`, {
        ...scope?.params, sessionId: q.sessionId, projectId: q.projectId,
      });
    if (q.q?.trim()) qb.andWhere('(u.displayName LIKE :term OR u.email LIKE :term)', { term: `%${q.q.trim()}%` });
    qb.orderBy('u.displayName', 'ASC').addOrderBy('u.id', 'ASC').skip((q.page - 1) * q.pageSize).take(q.pageSize);
    const [users, total] = await qb.getManyAndCount();
    return { items: users.map(u => ({ userId: u.id.toLowerCase(), displayName: u.displayName, email: u.email })), total };
  }

  /**
   * M6 management overview (WP-6): two bounded queries per page — project
   * (latest template run), member count, sprint count, task done/total.
   * Same filters and managed scope as list(); no per-row queries (no N+1).
   */
  async listOverview(
    q: { page: number; pageSize: number; q?: string; status?: string; projectId?: string; leadInstructorId?: string; id?: string; sortBy?: string; sortDirection?: string },
    o?: Ownership,
  ) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const clauses = ['1=1'];
    const params: unknown[] = [];
    const param = (v: unknown): string => {
      params.push(v);
      return `@${params.length - 1}`;
    };
    if (o && !o.isAdmin) {
      const p = param(o.userId);
      clauses.push(
        `(s.leadInstructorId = ${p} OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.sessionId = s.id AND si.instructorId = ${p}))`,
      );
    }
    if (q.q?.trim()) {
      const like = `%${q.q.trim()}%`;
      const p = param(like);
      clauses.push(`(s.code LIKE ${p} OR s.name LIKE ${p} OR p.code LIKE ${p} OR p.name LIKE ${p})`);
    }
    if (q.status) clauses.push(`s.status = ${param(q.status)}`);
    if (q.id) clauses.push(`s.id = ${param(q.id)}`);
    if (q.leadInstructorId) clauses.push(`s.leadInstructorId = ${param(q.leadInstructorId)}`);
    if (q.projectId) {
      const project = param(q.projectId);
      clauses.push(`(EXISTS (SELECT 1 FROM template_runs r2 WHERE r2.sessionId = s.id AND r2.projectId = ${project}) OR EXISTS (SELECT 1 FROM assignments a WHERE a.sessionId = s.id AND a.projectId = ${project}))`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const from = `FROM internship_sessions s
      OUTER APPLY (SELECT TOP(1) r.projectId, r.templateVersion FROM template_runs r WHERE r.sessionId = s.id ORDER BY r.createdAt DESC, r.id DESC) tr
      LEFT JOIN projects p ON p.id = tr.projectId`;
    const totalRows: Array<{ n: number }> = await this.dataSource.query(
      `SELECT COUNT(*) AS n ${from} ${where}`,
      params,
    );
    const total = Number(totalRows[0]?.n ?? 0);
    // Only fixed server expressions enter ORDER BY; request values never become SQL.
    const sortColumns: Record<string, string> = {
      startDate: 's.startDate', endDate: 's.endDate', name: 's.name',
      progress: 'COALESCE(CAST(d.taskDone AS float) / NULLIF(d.taskTotal, 0), 0)',
    };
    const sortColumn = q.sortBy && Object.hasOwn(sortColumns, q.sortBy) ? sortColumns[q.sortBy] : sortColumns.startDate;
    const direction = q.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const rows: Array<{
      id: string; code: string; name: string; status: string; startDate: Date; endDate: Date;
      projectId: string | null; projectCode: string | null; projectName: string | null; templateVersion: number | null;
      memberCount: number; sprintCount: number; taskTotal: number; taskDone: number;
      currentSprintId: string | null; currentSprintCode: string; currentSprintName: string;
      overdueTasks: number; pendingReview: number; sessionOverdue: number;
    }> = await this.dataSource.query(
      `SELECT s.id AS id, s.code AS code, s.name AS name, s.status AS status,
        s.startDate AS startDate, s.endDate AS endDate,
        tr.projectId AS projectId, p.code AS projectCode, p.name AS projectName, tr.templateVersion AS templateVersion,
        (SELECT COUNT(*) FROM session_members m WHERE m.sessionId = s.id) AS memberCount,
        (SELECT COUNT(*) FROM sprints sp WHERE sp.sessionId = s.id) AS sprintCount,
        d.taskTotal, d.taskDone, d.overdueTasks, d.pendingReview,
        currentSprint.id AS currentSprintId, currentSprint.code AS currentSprintCode, currentSprint.name AS currentSprintName,
        CASE WHEN s.status IN ('active', 'ending') AND s.endDate < SYSUTCDATETIME() THEN 1 ELSE 0 END AS sessionOverdue
       ${from}
       OUTER APPLY (SELECT COUNT(*) AS taskTotal,
         COUNT(CASE WHEN t.status = 'done' THEN 1 END) AS taskDone,
         COUNT(CASE WHEN t.status <> 'done' AND t.dueDate < SYSUTCDATETIME() THEN 1 END) AS overdueTasks,
         COUNT(CASE WHEN t.status = 'review' THEN 1 END) AS pendingReview
         FROM tasks t JOIN sprints sp2 ON sp2.id = t.sprintId
         WHERE t.deletedAt IS NULL AND sp2.sessionId = s.id) d
       OUTER APPLY (SELECT TOP(1) sp.id, sp.code, sp.name FROM sprints sp
         WHERE sp.sessionId = s.id AND sp.status = 'active' ORDER BY sp.startDate DESC, sp.id) currentSprint
       ${where}
       ORDER BY ${sortColumn} ${direction}, s.id OFFSET ${(page - 1) * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY`,
      params,
    );
    return {
      items: rows.map((r) => ({
        id: String(r.id).toLowerCase(),
        code: r.code,
        name: r.name,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
        project: r.projectId
          ? {
              id: String(r.projectId).toLowerCase(),
              code: r.projectCode,
              name: r.projectName,
              templateVersion: r.templateVersion,
            }
          : null,
        memberCount: Number(r.memberCount),
        sprintCount: Number(r.sprintCount),
        taskTotal: Number(r.taskTotal),
        taskDone: Number(r.taskDone),
        taskPercent: Number(r.taskTotal) === 0 ? 0 : Math.round((Number(r.taskDone) / Number(r.taskTotal)) * 100),
        currentSprint: r.currentSprintId ? { id: r.currentSprintId.toLowerCase(), code: r.currentSprintCode, name: r.currentSprintName } : null,
        alerts: { overdueTasks: Number(r.overdueTasks), pendingReview: Number(r.pendingReview), sessionOverdue: Boolean(r.sessionOverdue) },
      })),
      total,
    };
  }

  async detail(id: string, o: Ownership) {
    const session = await this.getOne(id, o);
    const [overview, members, milestones, snapshots, progress] = await Promise.all([
      this.listOverview({ id, page: 1, pageSize: 1 }, o),
      this.listMembers(id, o),
      this.listMilestones(id, o),
      this.dataSource.query('SELECT TOP(1) snapshotJson FROM template_runs WHERE sessionId = @0 ORDER BY createdAt DESC, id DESC', [id]) as Promise<Array<{ snapshotJson: string }>>,
      this.dataSource.query(`SELECT sp.id, sp.status, COUNT(t.id) AS taskTotal,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS taskDone,
        SUM(CASE WHEN t.status = 'review' THEN 1 ELSE 0 END) AS taskReview
        FROM sprints sp LEFT JOIN tasks t ON t.sprintId = sp.id AND t.deletedAt IS NULL
        WHERE sp.sessionId = @0 GROUP BY sp.id, sp.status`, [id]) as Promise<Array<{ id: string; status: string; taskTotal: number; taskDone: number; taskReview: number }>>,
    ]);
    return {
      ...toSessionResponse(session),
      overview: overview.items[0],
      members,
      milestones,
      projectSnapshot: snapshots.length ? JSON.parse(snapshots[0].snapshotJson) as unknown : null,
      sprintProgress: progress.map((p) => ({ ...p, id: p.id.toLowerCase(), taskTotal: Number(p.taskTotal), taskDone: Number(p.taskDone), taskReview: Number(p.taskReview) })),
    };
  }

  async instructorOptions(q: { page: number; pageSize: number; q?: string }) {
    const qb = this.users.createQueryBuilder('u').select(['u.id', 'u.displayName', 'u.email'])
      .where('u.status = :status', { status: 'active' })
      .andWhere(`(EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.roleId=ur.roleId JOIN permissions p ON p.id=rp.permissionId WHERE ur.userId=u.id AND p.code=:permission) OR EXISTS (SELECT 1 FROM group_members gm JOIN group_roles gr ON gr.groupId=gm.groupId JOIN role_permissions rp ON rp.roleId=gr.roleId JOIN permissions p ON p.id=rp.permissionId WHERE gm.userId=u.id AND p.code=:permission))`, { permission: 'sessions.manage' });
    if (q.q) qb.andWhere('(u.displayName LIKE :term OR u.email LIKE :term)', { term: `%${q.q}%` });
    const [rows, total] = await qb.orderBy('u.displayName', 'ASC').addOrderBy('u.id', 'ASC').skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
    return { items: rows.map(u => ({ userId: u.id, displayName: u.displayName, email: u.email })), total };
  }

  /** Resolve request ownership from the actor; undefined actor = trusted internal call. */
  private async ownership(actorId?: string | null): Promise<Ownership | undefined> {
    if (!actorId) return undefined;
    return resolveOwnership(this.permissionsService, actorId);
  }

  async getOne(id: string, o?: Ownership): Promise<InternshipSession> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'Internship session not found.',
      });
    }
    if (o && !o.isAdmin) {
      const owned =
        session.leadInstructorId === o.userId ||
        (await this.instructors.findOne({ where: { sessionId: id, instructorId: o.userId } })) !== null;
      if (!owned) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'SESSION_SCOPE_FORBIDDEN',
          message: 'You do not manage this internship session.',
        });
      }
    }
    return session;
  }

  async create(input: {
    code: string;
    name: string;
    description?: string;
    status?: string;
    leadInstructorId?: string;
    startDate: string;
    endDate: string;
  }, ctx: ActorContext): Promise<SessionResponse> {
    const existing = await this.sessions.findOne({ where: { code: input.code } });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SESSION_CODE_TAKEN',
        message: 'Session code is already taken.',
      });
    }
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (endDate < startDate) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SESSION_DATE_RANGE_INVALID',
        message: 'endDate must be greater than or equal to startDate.',
      });
    }
    const leadInstructorId = await this.resolveInstructor(input.leadInstructorId);

    let created: InternshipSession;
    try {
      created = await this.sessions.save(
        this.sessions.create({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          status: (input.status ?? 'upcoming') as InternshipSession['status'],
          leadInstructorId,
          startDate,
          endDate,
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'SESSION_CODE_TAKEN',
          message: 'Session code is already taken.',
        });
      }
      throw err;
    }

    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'session.created',
      targetType: 'internship_session',
      targetId: created.id,
      detail: { code: created.code, status: created.status },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    // Ownership bootstrap: an instructor creating a session joins it, so the
    // session they just created stays visible under instructor scoping.
    if (ctx.actorId && (await this.permissionsService.hasRole(ctx.actorId, 'instructor'))) {
      const already = await this.instructors.findOne({ where: { sessionId: created.id, instructorId: ctx.actorId } });
      if (!already) {
        await this.instructors.insert({ sessionId: created.id, instructorId: ctx.actorId });
      }
    }
    await this.activity.record({
      actorId: ctx.actorId ?? null,
      module: 'sessions',
      action: 'session.created',
      targetType: 'internship_session',
      targetId: created.id,
      summary: `Tạo phiên thực tập ${created.code}`,
    });
    return toSessionResponse(created);
  }

  /**
   * PATCH = partial update + explicit state machine (spec 11).
   * Illegal status transitions → 409 INVALID_SESSION_TRANSITION.
   */
  async update(
    id: string,
    input: {
      name?: string;
      description?: string;
      status?: string;
      leadInstructorId?: string;
      startDate?: string;
      endDate?: string;
    },
    ctx: ActorContext,
  ): Promise<SessionResponse> {
    const ownership = await this.ownership(ctx.actorId);
    return this.dataSource.transaction(async em => {
      const session = await em.findOne(InternshipSession, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!session) throw new NotFoundException({ statusCode: 404, code: 'SESSION_NOT_FOUND', message: 'Session not found.' });
      if (ownership && !ownership.isAdmin && session.leadInstructorId?.toLowerCase() !== ownership.userId.toLowerCase()) {
        const managed = await em.findOneBy(SessionInstructor, { sessionId: id, instructorId: ownership.userId });
        if (!managed) throw new ForbiddenException({ statusCode: 403, code: 'SESSION_SCOPE_FORBIDDEN', message: 'You do not manage this session.' });
      }
      const patch: Partial<InternshipSession> = {};

      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.startDate !== undefined) patch.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) patch.endDate = new Date(input.endDate);
      if (input.leadInstructorId !== undefined) {
        patch.leadInstructorId = await this.resolveInstructor(input.leadInstructorId);
      }

      const nextStart = (patch.startDate ?? session.startDate) as Date;
      const nextEnd = (patch.endDate ?? session.endDate) as Date;
      if (nextEnd < nextStart) {
        throw new ConflictException({
          statusCode: 409,
          code: 'SESSION_DATE_RANGE_INVALID',
          message: 'endDate must be greater than or equal to startDate.',
        });
      }

      let transitionedFrom: string | null = null;
      if (input.status !== undefined && input.status !== session.status) {
        if (!canTransitionSession(session.status, input.status as InternshipSession['status'])) {
          throw new ConflictException({
            statusCode: 409,
            code: 'INVALID_SESSION_TRANSITION',
            message: `Illegal session transition ${session.status} -> ${input.status}.`,
            details: { from: session.status, to: input.status },
          });
        }
        transitionedFrom = session.status;
        patch.status = input.status as InternshipSession['status'];
      }

      // M5 Start preconditions (WP-5, ADR-05/06): upcoming → active validates the
      // template team (required slots filled) and member eligibility. Sessions
      // without a template run keep the legacy behavior (no team to validate).
      if (transitionedFrom === 'upcoming' && patch.status === 'active') {
        await this.assertStartReady(id, em);
      }

      if (Object.keys(patch).length > 0) {
        await em.update(InternshipSession, id, patch);
        await em.insert(AuditLog, {
          actorId: ctx.actorId ?? null,
          action: transitionedFrom ? 'session.status_changed' : 'session.updated',
          targetType: 'internship_session',
          targetId: id,
          detail: JSON.stringify(transitionedFrom
            ? { from: transitionedFrom, to: patch.status }
            : {
                ...patch,
                startDate: patch.startDate?.toISOString() ?? null,
                endDate: patch.endDate?.toISOString() ?? null,
              }),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
        if (patch.status === 'active') {
          await em.insert(ActivityEvent, {
            actorId: ctx.actorId ?? null,
            module: 'sessions',
            action: 'session.activated',
            targetType: 'internship_session',
            targetId: id,
            summary: `Phiên thực tập ${session.code} đã kích hoạt`,
          });
        }
      }
      return toSessionResponse(Object.assign(session, patch));
    });
  }

  async listMembers(sessionId: string, o?: Ownership): Promise<SessionMemberRow[]> {
    await this.getOne(sessionId, o);
    const rows = await this.members
      .createQueryBuilder('m')
      .innerJoin(User, 'u', 'u.id = m.userId')
      .where('m.sessionId = :sessionId', { sessionId })
      .select(['m.userId AS userId', 'u.displayName AS displayName', 'u.email AS email', 'm.joinedAt AS joinedAt'])
      .orderBy('m.joinedAt', 'ASC')
      .getRawMany();
    return rows;
  }

  /** Idempotent membership add (duplicates prevented + skipped). */
  async addMembers(sessionId: string, userIds: string[], ctx: ActorContext): Promise<{ added: number; skipped: number }> {
    await this.getOne(sessionId, await this.ownership(ctx.actorId));
    const found = await this.users.find({ where: { id: In(userIds) } });
    const foundIds = new Set(found.map((u) => u.id));
    const unknown = userIds.filter((id) => !foundIds.has(id));
    if (unknown.length > 0) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: `Unknown user id(s): ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}.`,
      });
    }
    const existing = await this.members.find({ where: { sessionId, userId: In(userIds) } });
    const existingIds = new Set(existing.map((m) => m.userId));
    const toAdd = userIds.filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      await this.members.insert(toAdd.map((userId) => ({ sessionId, userId })));
    }
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'session.members_added',
      targetType: 'internship_session',
      targetId: sessionId,
      detail: { added: toAdd.length, skipped: existingIds.size },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { added: toAdd.length, skipped: existingIds.size };
  }

  async removeMember(sessionId: string, userId: string, ctx: ActorContext): Promise<{ removed: number }> {
    await this.getOne(sessionId, await this.ownership(ctx.actorId));
    const result = await this.members.delete({ sessionId, userId });
    const removed = result.affected ?? 0;
    if (removed > 0) {
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'session.member_removed',
        targetType: 'internship_session',
        targetId: sessionId,
        detail: { userId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
    return { removed };
  }

  async listInstructors(sessionId: string, o?: Ownership): Promise<SessionInstructorRow[]> {
    await this.getOne(sessionId, o);
    const rows = await this.instructors
      .createQueryBuilder('i')
      .innerJoin(User, 'u', 'u.id = i.instructorId')
      .where('i.sessionId = :sessionId', { sessionId })
      .select([
        'i.instructorId AS instructorId',
        'u.displayName AS displayName',
        'u.email AS email',
        'i.assignedAt AS assignedAt',
      ])
      .orderBy('i.assignedAt', 'ASC')
      .getRawMany();
    return rows;
  }

  /**
   * Instructor validation is DB-resolved (spec 13): target user must exist,
   * be active, AND hold `sessions.manage` effective permission. The FE role
   * value is never trusted.
   */
  async addInstructors(
    sessionId: string,
    instructorIds: string[],
    ctx: ActorContext,
  ): Promise<{ added: number; skipped: number }> {
    await this.getOne(sessionId, await this.ownership(ctx.actorId));
    const found = await this.users.find({ where: { id: In(instructorIds), status: 'active' } });
    const foundIds = new Set(found.map((u) => u.id));
    const unknown = instructorIds.filter((id) => !foundIds.has(id));
    if (unknown.length > 0) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: `Unknown or inactive user id(s): ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}.`,
      });
    }
    for (const id of instructorIds) {
      const effective = await this.permissionsService.getEffectivePermissionCodes(id);
      if (!effective.has('sessions.manage')) {
        throw new ConflictException({
          statusCode: 403,
          code: 'INSTRUCTOR_PERMISSION_MISSING',
          message: 'Target user does not hold sessions.manage permission.',
          details: { instructorId: id },
        });
      }
    }
    const existing = await this.instructors.find({ where: { sessionId, instructorId: In(instructorIds) } });
    const existingIds = new Set(existing.map((m) => m.instructorId));
    const toAdd = instructorIds.filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      await this.instructors.insert(toAdd.map((instructorId) => ({ sessionId, instructorId })));
    }
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'session.instructors_added',
      targetType: 'internship_session',
      targetId: sessionId,
      detail: { added: toAdd.length, skipped: existingIds.size },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { added: toAdd.length, skipped: existingIds.size };
  }

  async removeInstructor(sessionId: string, instructorId: string, ctx: ActorContext): Promise<{ removed: number }> {
    await this.getOne(sessionId, await this.ownership(ctx.actorId));
    const result = await this.instructors.delete({ sessionId, instructorId });
    const removed = result.affected ?? 0;
    if (removed > 0) {
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'session.instructor_removed',
        targetType: 'internship_session',
        targetId: sessionId,
        detail: { instructorId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
    return { removed };
  }

  async createMilestone(
    sessionId: string,
    input: { title: string; description?: string; dueDate?: string; status?: string; sortOrder?: number },
    ctx: ActorContext,
  ) {
    await this.getOne(sessionId, await this.ownership(ctx.actorId));
    const created = await this.milestones.save(
      this.milestones.create({
        sessionId,
        title: input.title,
        description: input.description ?? null,
        dueDate: toDateOrNull(input.dueDate),
        status: (input.status ?? 'pending') as SessionMilestone['status'],
        sortOrder: input.sortOrder ?? 0,
      }),
    );
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'session.milestone_created',
      targetType: 'session_milestone',
      targetId: created.id,
      detail: { sessionId, title: created.title },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return created;
  }

  async listMilestones(sessionId: string, o?: Ownership) {
    await this.getOne(sessionId, o);
    return this.milestones.find({ where: { sessionId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async updateMilestone(
    sessionId: string,
    milestoneId: string,
    input: { title?: string; description?: string; dueDate?: string; status?: string; sortOrder?: number },
    ctx: ActorContext,
  ) {
    await this.getOne(sessionId, await this.ownership(ctx.actorId));
    const milestone = await this.milestones.findOne({ where: { id: milestoneId, sessionId } });
    if (!milestone) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'MILESTONE_NOT_FOUND',
        message: 'Milestone not found in this session.',
      });
    }
    const patch: Partial<SessionMilestone> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.dueDate !== undefined) patch.dueDate = toDateOrNull(input.dueDate);
    if (input.status !== undefined) patch.status = input.status as SessionMilestone['status'];
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (Object.keys(patch).length > 0) {
      await this.milestones.update(milestone.id, patch);
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'session.milestone_updated',
        targetType: 'session_milestone',
        targetId: milestone.id,
        detail: { ...patch, dueDate: patch.dueDate?.toISOString() ?? null },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
    return this.milestones.findOne({ where: { id: milestoneId } });
  }

  async deleteMilestone(sessionId: string, milestoneId: string, ctx: ActorContext): Promise<{ deleted: number }> {
    await this.getOne(sessionId, await this.ownership(ctx.actorId));
    const milestone = await this.milestones.findOne({ where: { id: milestoneId, sessionId } });
    if (!milestone) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'MILESTONE_NOT_FOUND',
        message: 'Milestone not found in this session.',
      });
    }
    await this.milestones.delete(milestone.id);
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'session.milestone_deleted',
      targetType: 'session_milestone',
      targetId: milestoneId,
      detail: { sessionId, title: milestone.title },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { deleted: 1 };
  }

  /** Used by the assignment service: target session must accept assignments. */
  async getAssignableSessionOrThrow(sessionId: string): Promise<InternshipSession> {
    const session = await this.getOne(sessionId);
    if (!isSessionAssignable(session.status)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SESSION_NOT_ASSIGNABLE',
        message: `Session status '${session.status}' does not accept new assignments.`,
        details: { status: session.status },
      });
    }
    return session;
  }

  /**
   * M5 Start readiness (WP-5, ADR-05): a template session may go active only
   * with every required slot (countMin > 0 in the pinned snapshot) filled and
   * every active assignee still recruitment-passed. Sessions without a
   * template run keep legacy behavior.
   */
  private async assertStartReady(sessionId: string, em: EntityManager): Promise<void> {
    const runs: { projectId: string; snapshotJson: string }[] = await em.query(
      'SELECT TOP(1) projectId, snapshotJson FROM template_runs WHERE sessionId = @0 ORDER BY createdAt DESC',
      [sessionId],
    );
    if (!runs.length) return;
    let required: Array<{ code: string; countMin: number }> = [];
    try {
      const definition = JSON.parse(runs[0].snapshotJson) as {
        roleDetails?: Array<{ code?: unknown; countMin?: unknown }>;
        roles?: string[];
      };
      const roles = definition.roleDetails?.length ? definition.roleDetails : (definition.roles ?? []).map(code => ({ code, countMin: 1 }));
      required = roles
        .filter((r) => typeof r?.code === 'string' && (typeof r?.countMin !== 'number' || r.countMin > 0))
        .map((r) => ({ code: r.code as string, countMin: typeof r.countMin === 'number' ? r.countMin : 1 }));
    } catch {
      throw new ConflictException({ statusCode: 409, code: 'SESSION_SNAPSHOT_INVALID', message: 'The pinned template snapshot is invalid. Repair it before starting.' });
    }
    const projectId = runs[0].projectId;
    const filled: { roleCode: string; filled: number }[] = await em.query(
      `SELECT pm.roleInProject AS roleCode, COUNT(*) AS filled
       FROM project_members pm
       INNER JOIN assignments a ON a.projectId = pm.projectId AND a.internId = pm.userId AND a.status = 'active' AND a.sessionId = @1
       WHERE pm.projectId = @0 AND pm.roleInProject IS NOT NULL
       GROUP BY pm.roleInProject`,
      [projectId, sessionId],
    );
    const filledByRole = new Map(filled.map((r) => [r.roleCode, Number(r.filled)]));
    const missing = required
      .map((r) => ({ roleCode: r.code, need: r.countMin, have: filledByRole.get(r.code) ?? 0 }))
      .filter((m) => m.have < m.need);
    if (missing.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'SESSION_TEAM_INCOMPLETE',
        message: 'Required role slots are not filled.',
        details: { missing },
      });
    }
    const ineligible: { internId: string }[] = await em.query(
      `SELECT a.internId AS internId FROM assignments a
       LEFT JOIN recruitment_profiles p ON p.userId = a.internId
       LEFT JOIN users u ON u.id = a.internId
       LEFT JOIN project_members pm ON pm.projectId=a.projectId AND pm.userId=a.internId
       WHERE a.projectId = @0 AND a.sessionId = @1 AND a.status = 'active'
         AND (p.status IS NULL OR p.status <> 'passed' OR u.status <> 'active' OR pm.roleInProject IS NULL OR p.selectedRole IS NULL OR p.selectedRole <> pm.roleInProject)`,
      [projectId, sessionId],
    );
    if (ineligible.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'INTERN_NOT_RECRUITED',
        message: 'Every assigned intern must be active, passed recruitment and assigned to their recruited role.',
        details: { internIds: ineligible.map((r) => r.internId) },
      });
    }
  }

  /**
   * M5: latest template-run project of a session (null for legacy sessions
   * created outside a template — auto-planning skips those).
   */
  async resolveSessionProject(sessionId: string): Promise<string | null> {
    const rows: { projectId: string }[] = await this.dataSource.query(
      'SELECT TOP(1) projectId FROM template_runs WHERE sessionId = @0 ORDER BY createdAt DESC',
      [sessionId],
    );
    return rows.length ? String(rows[0].projectId).toLowerCase() : null;
  }

  /** Lead instructor must exist, be active, and hold sessions.manage. */
  private async resolveInstructor(userId?: string): Promise<string | null> {    if (!userId) return null;
    const user = await this.users.findOne({ where: { id: userId, status: 'active' } });
    if (!user) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'Lead instructor not found or not active.',
      });
    }
    const effective = await this.permissionsService.getEffectivePermissionCodes(user.id);
    if (!effective.has('sessions.manage')) {
      throw new ConflictException({
        statusCode: 403,
        code: 'INSTRUCTOR_PERMISSION_MISSING',
        message: 'Lead instructor does not hold sessions.manage permission.',
        details: { userId: user.id },
      });
    }
    return user.id;
  }
}
