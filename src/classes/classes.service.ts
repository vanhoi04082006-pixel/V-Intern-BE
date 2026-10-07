import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { isUniqueViolation } from '../common/utils/db-errors';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { User } from '../users/entities/user.entity';
import { ActorContext } from '../users/users.service';
import { AcademicClass } from './entities/class.entity';
import { ClassMember } from './entities/class-member.entity';

export interface ClassResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  leadInstructorId: string | null;
  sessionId: string | null;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClassMemberResponse {
  userId: string;
  displayName: string;
  email: string;
  joinedAt: Date;
}

export function toClassResponse(c: AcademicClass): ClassResponse {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description ?? null,
    leadInstructorId: c.leadInstructorId ?? null,
    sessionId: c.sessionId ?? null,
    status: c.status,
    startDate: c.startDate ?? null,
    endDate: c.endDate ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toDateOrNull(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(AcademicClass) private readonly classes: Repository<AcademicClass>,
    @InjectRepository(ClassMember) private readonly members: Repository<ClassMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(InternshipSession) private readonly sessions: Repository<InternshipSession>,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  async list(q: { page: number; pageSize: number; q?: string; status?: string; sessionId?: string }) {
    const qb = this.classes.createQueryBuilder('c');
    if (q.q && q.q.length > 0) {
      const term = `%${q.q}%`;
      qb.andWhere('(c.code LIKE :term OR c.name LIKE :term)', { term });
    }
    if (q.status) qb.andWhere('c.status = :status', { status: q.status });
    if (q.sessionId) qb.andWhere('c.sessionId = :sessionId', { sessionId: q.sessionId });
    qb.orderBy('c.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map(toClassResponse), total };
  }

  async getOne(id: string): Promise<AcademicClass> {
    const cls = await this.classes.findOne({ where: { id } });
    if (!cls) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'CLASS_NOT_FOUND',
        message: 'Class not found.',
      });
    }
    return cls;
  }

  async create(input: {
    code: string;
    name: string;
    description?: string;
    leadInstructorId?: string;
    sessionId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }, ctx: ActorContext): Promise<ClassResponse> {
    const existing = await this.classes.findOne({ where: { code: input.code } });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CLASS_CODE_TAKEN',
        message: 'Class code is already taken.',
      });
    }
    const leadInstructorId = await this.resolveInstructor(input.leadInstructorId);
    if (input.sessionId) await this.ensureSession(input.sessionId);
    if (input.startDate && input.endDate && new Date(input.endDate) < new Date(input.startDate)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CLASS_DATE_RANGE_INVALID',
        message: 'endDate must be greater than or equal to startDate.',
      });
    }

    let created: AcademicClass;
    try {
      created = await this.classes.save(
        this.classes.create({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          leadInstructorId,
          sessionId: input.sessionId ?? null,
          status: (input.status ?? 'upcoming') as AcademicClass['status'],
          startDate: toDateOrNull(input.startDate),
          endDate: toDateOrNull(input.endDate),
        }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'CLASS_CODE_TAKEN',
          message: 'Class code is already taken.',
        });
      }
      throw err;
    }

    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'class.created',
      targetType: 'class',
      targetId: created.id,
      detail: { code: created.code, name: created.name },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    await this.activity.record({
      actorId: ctx.actorId ?? null,
      module: 'classes',
      action: 'class.created',
      targetType: 'class',
      targetId: created.id,
      summary: `Tạo lớp học ${created.code}`,
    });
    return toClassResponse(created);
  }

  async update(
    id: string,
    input: {
      name?: string;
      description?: string;
      leadInstructorId?: string;
      sessionId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
    ctx: ActorContext,
  ): Promise<ClassResponse> {
    await this.getOne(id);
    const patch: Partial<AcademicClass> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status as AcademicClass['status'];
    if (input.startDate !== undefined) patch.startDate = toDateOrNull(input.startDate);
    if (input.endDate !== undefined) patch.endDate = toDateOrNull(input.endDate);
    if (input.leadInstructorId !== undefined) {
      patch.leadInstructorId = await this.resolveInstructor(input.leadInstructorId);
    }
    if (input.sessionId !== undefined) {
      if (input.sessionId) await this.ensureSession(input.sessionId);
      patch.sessionId = input.sessionId;
    }
    if (Object.keys(patch).length > 0) {
      await this.classes.update(id, patch);
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'class.updated',
        targetType: 'class',
        targetId: id,
        detail: { ...patch, startDate: patch.startDate?.toISOString() ?? null, endDate: patch.endDate?.toISOString() ?? null },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
    return toClassResponse(await this.getOne(id));
  }

  /** Idempotent membership add — duplicates are prevented and skipped. */
  async addMembers(classId: string, userIds: string[], ctx: ActorContext): Promise<{ added: number; skipped: number }> {
    await this.getOne(classId);
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
    const existing = await this.members.find({ where: { classId, userId: In(userIds) } });
    const existingIds = new Set(existing.map((m) => m.userId));
    const toAdd = userIds.filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      await this.members.insert(toAdd.map((userId) => ({ classId, userId })));
    }
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'class.members_added',
      targetType: 'class',
      targetId: classId,
      detail: { added: toAdd.length, skipped: existingIds.size },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    if (toAdd.length > 0) {
      await this.activity.record({
        actorId: ctx.actorId ?? null,
        module: 'classes',
        action: 'class.members_added',
        targetType: 'class',
        targetId: classId,
        summary: `Thêm ${toAdd.length} thành viên vào lớp`,
      });
    }
    return { added: toAdd.length, skipped: existingIds.size };
  }

  async removeMember(classId: string, userId: string, ctx: ActorContext): Promise<{ removed: number }> {
    await this.getOne(classId);
    const result = await this.members.delete({ classId, userId });
    const removed = result.affected ?? 0;
    if (removed > 0) {
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'class.member_removed',
        targetType: 'class',
        targetId: classId,
        detail: { userId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    }
    return { removed };
  }

  async listMembers(classId: string): Promise<ClassMemberResponse[]> {
    await this.getOne(classId);
    const rows = await this.members
      .createQueryBuilder('m')
      .innerJoin(User, 'u', 'u.id = m.userId')
      .where('m.classId = :classId', { classId })
      .select(['m.userId AS userId', 'u.displayName AS displayName', 'u.email AS email', 'm.joinedAt AS joinedAt'])
      .orderBy('m.joinedAt', 'ASC')
      .getRawMany();
    return rows.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      email: r.email,
      joinedAt: r.joinedAt,
    }));
  }

  /** Lead instructor must be an existing ACTIVE user (404 otherwise). */
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
    return user.id;
  }

  private async ensureSession(sessionId: string): Promise<InternshipSession> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'Internship session not found.',
      });
    }
    return session;
  }
}
