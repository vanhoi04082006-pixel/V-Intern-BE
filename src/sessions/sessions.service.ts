import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/utils/db-errors';
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
    private readonly permissionsService: PermissionsService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  async list(q: { page: number; pageSize: number; q?: string; status?: string }) {
    const qb = this.sessions.createQueryBuilder('s');
    if (q.q && q.q.length > 0) {
      const term = `%${q.q}%`;
      qb.andWhere('(s.code LIKE :term OR s.name LIKE :term)', { term });
    }
    if (q.status) qb.andWhere('s.status = :status', { status: q.status });
    qb.orderBy('s.startDate', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map(toSessionResponse), total };
  }

  async getOne(id: string): Promise<InternshipSession> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'Internship session not found.',
      });
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
    const session = await this.getOne(id);
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

    if (Object.keys(patch).length > 0) {
      await this.sessions.update(id, patch);
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: transitionedFrom ? 'session.status_changed' : 'session.updated',
        targetType: 'internship_session',
        targetId: id,
        detail: transitionedFrom
          ? { from: transitionedFrom, to: patch.status }
          : {
              ...patch,
              startDate: patch.startDate?.toISOString() ?? null,
              endDate: patch.endDate?.toISOString() ?? null,
            },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      if (patch.status === 'active') {
        await this.activity.record({
          actorId: ctx.actorId ?? null,
          module: 'sessions',
          action: 'session.activated',
          targetType: 'internship_session',
          targetId: id,
          summary: `Phiên thực tập ${session.code} đã kích hoạt`,
        });
      }
    }
    return toSessionResponse(await this.getOne(id));
  }

  async listMembers(sessionId: string): Promise<SessionMemberRow[]> {
    await this.getOne(sessionId);
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
    await this.getOne(sessionId);
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
    await this.getOne(sessionId);
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

  async listInstructors(sessionId: string): Promise<SessionInstructorRow[]> {
    await this.getOne(sessionId);
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
    await this.getOne(sessionId);
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
    await this.getOne(sessionId);
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
    await this.getOne(sessionId);
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

  async listMilestones(sessionId: string) {
    await this.getOne(sessionId);
    return this.milestones.find({ where: { sessionId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async updateMilestone(
    sessionId: string,
    milestoneId: string,
    input: { title?: string; description?: string; dueDate?: string; status?: string; sortOrder?: number },
    ctx: ActorContext,
  ) {
    await this.getOne(sessionId);
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
    await this.getOne(sessionId);
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

  /** Lead instructor must exist, be active, and hold sessions.manage. */
  private async resolveInstructor(userId?: string): Promise<string | null> {
    if (!userId) return null;
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
