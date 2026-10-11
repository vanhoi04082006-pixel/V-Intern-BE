import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/utils/db-errors';
import { OWNER_PARAM, projectScope, resolveOwnership, type Ownership } from '../rbac/ownership';
import { PermissionsService } from '../rbac/permissions.service';
import { User } from '../users/entities/user.entity';
import { ActorContext } from '../users/users.service';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { ProjectRoleSlot } from './entities/project-role-slot.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { SessionMember } from '../sessions/entities/session-member.entity';
import { ProjectTechnology } from './entities/project-technology.entity';

export interface ProjectResponse {
  id: string;
  code: string;
  name: string;
  description: string;
  domainCategory: string | null;
  difficulty: string;
  status: string;
  mentorId: string | null;
  capacity: number | null;
  startDate: Date | null;
  endDate: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  technologies: string[];
}

export interface ProjectMemberRow {
  userId: string;
  displayName: string;
  email: string;
  roleInProject: string | null;
  joinedAt: Date;
}

export function toProjectResponse(p: Project, technologies: string[] = []): ProjectResponse {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    domainCategory: p.domainCategory ?? null,
    difficulty: p.difficulty,
    status: p.status,
    mentorId: p.mentorId ?? null,
    capacity: p.capacity ?? null,
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    archivedAt: p.archivedAt ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    technologies,
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(ProjectTechnology) private readonly technologies: Repository<ProjectTechnology>,
    @InjectRepository(ProjectRoleSlot) private readonly slots: Repository<ProjectRoleSlot>,
    @InjectRepository(InternshipSession) private readonly sessions: Repository<InternshipSession>,
    @InjectRepository(SessionInstructor) private readonly sessionInstructors: Repository<SessionInstructor>,
    @InjectRepository(SessionMember) private readonly sessionMembers: Repository<SessionMember>,
    @InjectRepository(User)     private readonly users: Repository<User>,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  /** Resolve request ownership from the actor; undefined actor = trusted internal call. */
  private async ownership(actorId?: string | null): Promise<Ownership | undefined> {
    if (!actorId) return undefined;
    return resolveOwnership(this.permissions, actorId);
  }

  async list(q: {
    page: number;
    pageSize: number;
    q?: string;
    status?: string;
    difficulty?: string;
    domainCategory?: string;
    technology?: string;
    sort?: 'createdAt' | 'code' | 'name';
    order?: 'ASC' | 'DESC';
  }, o?: Ownership) {
    const qb = this.projects.createQueryBuilder('p');
    if (o && !o.isAdmin) {
      const scope = projectScope('p', o);
      if (scope) qb.andWhere(scope.clause, { [OWNER_PARAM]: o.userId });
    }
    if (q.q && q.q.length > 0) {
      const term = `%${q.q}%`;
      qb.andWhere('(p.code LIKE :term OR p.name LIKE :term)', { term });
    }
    if (q.status) qb.andWhere('p.status = :status', { status: q.status });
    if (q.difficulty) qb.andWhere('p.difficulty = :difficulty', { difficulty: q.difficulty });
    if (q.domainCategory) qb.andWhere('p.domainCategory = :domainCategory', { domainCategory: q.domainCategory });
    if (q.technology) qb.andWhere('EXISTS(SELECT 1 FROM project_technologies pt WHERE pt.projectId=p.id AND pt.technology=:technology)', { technology: q.technology });
    const sortCol = q.sort ?? 'createdAt';
    qb.orderBy(`p.${sortCol}`, q.order ?? 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    const techMap = await this.loadTechnologies(items.map((p) => p.id));
    return { items: items.map((p) => toProjectResponse(p, techMap.get(p.id) ?? [])), total };
  }

  async getOne(id: string, o?: Ownership): Promise<Project> {
    const project = await this.projects.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found.',
      });
    }
    if (o && !o.isAdmin && project.mentorId !== o.userId && project.mentorId !== null) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PROJECT_SCOPE_FORBIDDEN',
        message: 'You do not manage this project.',
      });
    }
    return project;
  }

  async filterOptions() {
    const [domains,technologies] = await Promise.all([
      this.projects.query("SELECT DISTINCT domainCategory value FROM projects WHERE domainCategory IS NOT NULL AND domainCategory<>'' ORDER BY domainCategory"),
      this.projects.query('SELECT DISTINCT technology value FROM project_technologies ORDER BY technology'),
    ]);
    return {domains:domains.map((r:{value:string})=>r.value),technologies:technologies.map((r:{value:string})=>r.value)};
  }

  async getOneDetailed(id: string, o?: Ownership): Promise<ProjectResponse> {
    const project = await this.getOne(id, o);
    const techMap = await this.loadTechnologies([project.id]);
    return toProjectResponse(project, techMap.get(project.id) ?? []);
  }

  async create(input: {
    code: string;
    name: string;
    description: string;
    domainCategory?: string;
    difficulty?: string;
    status?: string;
    mentorId?: string;
    capacity?: number;
    startDate?: string;
    endDate?: string;
    technologies?: string[];
  }, ctx: ActorContext): Promise<ProjectResponse> {
    const existing = await this.projects.findOne({ where: { code: input.code } });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PROJECT_CODE_TAKEN',
        message: 'Project code is already taken.',
      });
    }
    if (input.startDate && input.endDate && new Date(input.endDate) < new Date(input.startDate)) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PROJECT_DATE_RANGE_INVALID',
        message: 'endDate must be greater than or equal to startDate.',
      });
    }
    const mentorId = await this.resolveMentor(input.mentorId);
    // Ownership bootstrap: an instructor creating a project without an
    // explicit mentor becomes its mentor, so the project they just created
    // stays visible under instructor scoping.
    const effectiveMentorId =
      mentorId ?? (ctx.actorId && (await this.permissions.hasRole(ctx.actorId, 'instructor')) ? ctx.actorId : null);

    const created = await this.projects.manager.transaction(async (em) => {
      let saved: Project;
      try {
        saved = await em.save(
          em.create(Project, {
            code: input.code,
            name: input.name,
            description: input.description,
            domainCategory: input.domainCategory ?? null,
            difficulty: (input.difficulty ?? 'beginner') as Project['difficulty'],
            status: (input.status ?? 'draft') as Project['status'],
            mentorId: effectiveMentorId,
            capacity: input.capacity ?? null,
            startDate: input.startDate ? new Date(input.startDate) : null,
            endDate: input.endDate ? new Date(input.endDate) : null,
          }),
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException({
            statusCode: 409,
            code: 'PROJECT_CODE_TAKEN',
            message: 'Project code is already taken.',
          });
        }
        throw err;
      }
      if (input.technologies && input.technologies.length > 0) {
        const unique = [...new Set(input.technologies.map((t) => t.trim()).filter((t) => t.length > 0))];
        if (unique.length > 0) {
          await em.insert(
            ProjectTechnology,
            unique.map((technology) => ({ projectId: saved.id, technology })),
          );
        }
      }
      return saved;
    });

    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'project.created',
      targetType: 'project',
      targetId: created.id,
      detail: { code: created.code, name: created.name },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    await this.activity.record({
      actorId: ctx.actorId ?? null,
      module: 'projects',
      action: 'project.created',
      targetType: 'project',
      targetId: created.id,
      summary: `Tạo đồ án ${created.code}`,
    });
    return this.getOneDetailed(created.id);
  }

  /**
   * archived is a TERMINAL status (documented business rule): once archived
   * (archivedAt set) a project cannot leave that state → 409.
   */
  async update(
    id: string,
    input: {
      name?: string;
      description?: string;
      domainCategory?: string;
      difficulty?: string;
      status?: string;
      mentorId?: string;
      capacity?: number;
      startDate?: string;
      endDate?: string;
      technologies?: string[];
    },
    ctx: ActorContext,
  ): Promise<ProjectResponse> {
    const o = await this.ownership(ctx.actorId);
    const project = await this.getOne(id, o);
    if (o && !o.isAdmin && project.mentorId !== o.userId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PROJECT_SCOPE_FORBIDDEN',
        message: 'Only the managing mentor can edit this project. Claim it first.',
      });
    }
    if (project.status === 'archived') {
      throw new ConflictException({
        statusCode: 409,
        code: 'PROJECT_ARCHIVED',
        message: 'Archived projects are read-only.',
      });
    }

    const patch: Partial<Project> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.domainCategory !== undefined) patch.domainCategory = input.domainCategory;
    if (input.difficulty !== undefined) patch.difficulty = input.difficulty as Project['difficulty'];
    if (input.capacity !== undefined) patch.capacity = input.capacity;
    if (input.startDate !== undefined) patch.startDate = input.startDate ? new Date(input.startDate) : null;
    if (input.endDate !== undefined) patch.endDate = input.endDate ? new Date(input.endDate) : null;
    if (input.mentorId !== undefined) patch.mentorId = await this.resolveMentor(input.mentorId);
    if (input.status !== undefined) {
      patch.status = input.status as Project['status'];
      if (input.status === 'archived') patch.archivedAt = new Date();
    }

    const nextStart = patch.startDate ?? project.startDate;
    const nextEnd = patch.endDate ?? project.endDate;
    if (nextStart && nextEnd && nextEnd < nextStart) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PROJECT_DATE_RANGE_INVALID',
        message: 'endDate must be greater than or equal to startDate.',
      });
    }

    await this.projects.manager.transaction(async (em) => {
      if (Object.keys(patch).length > 0) {
        await em.update(Project, id, patch);
      }
      if (input.technologies !== undefined) {
        // REPLACE strategy for technologies (documented contract).
        await em.delete(ProjectTechnology, { projectId: id });
        const unique = [...new Set(input.technologies.map((t) => t.trim()).filter((t) => t.length > 0))];
        if (unique.length > 0) {
          await em.insert(
            ProjectTechnology,
            unique.map((technology) => ({ projectId: id, technology })),
          );
        }
      }
    });

    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'project.updated',
      targetType: 'project',
      targetId: id,
      detail: {
        ...patch,
        startDate: patch.startDate?.toISOString() ?? null,
        endDate: patch.endDate?.toISOString() ?? null,
        archivedAt: patch.archivedAt?.toISOString() ?? null,
        technologiesReplaced: input.technologies !== undefined,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return this.getOneDetailed(id);
  }

  /**
   * Claim an unmentored library project: sets mentorId to the actor.
   * Already-claimed projects (by anyone, including self) → 409, never
   * silently stolen. Admins manage via PATCH instead.
   */
  async claim(id: string, ctx: ActorContext): Promise<ProjectResponse> {
    const o = await this.ownership(ctx.actorId);
    if (!o || (!o.isAdmin && !(await this.permissions.hasRole(o.userId, 'instructor')))) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PROJECT_CLAIM_FORBIDDEN',
        message: 'Only instructors can claim library projects.',
      });
    }
    const project = await this.getOne(id, o);
    if (project.mentorId !== null) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PROJECT_ALREADY_CLAIMED',
        message: 'Project already has a managing mentor.',
      });
    }
    await this.projects.update(id, { mentorId: o.userId });
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'project.claimed',
      targetType: 'project',
      targetId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return this.getOneDetailed(id, o);
  }

  async listMembers(projectId: string, o?: Ownership): Promise<ProjectMemberRow[]> {
    await this.getOne(projectId, o);
    const rows = await this.members
      .createQueryBuilder('m')
      .innerJoin(User, 'u', 'u.id = m.userId')
      .where('m.projectId = :projectId', { projectId })
      .select([
        'm.userId AS userId',
        'u.displayName AS displayName',
        'u.email AS email',
        'm.roleInProject AS roleInProject',
        'm.joinedAt AS joinedAt',
      ])
      .orderBy('m.joinedAt', 'ASC')
      .getRawMany();
    return rows;
  }

  /**
   * Sessions running on this project (redesign §8/§30): linked through
   * assignments (any status → full history) and sprints, then reduced to
   * the sessions the caller manages. A project is reusable across cohorts
   * without cloning (§32).
   */
  async projectSessions(projectId: string, o?: Ownership): Promise<Array<{ id: string; code: string; name: string; status: string; startDate: Date; endDate: Date; memberCount: number }>> {
    await this.getOne(projectId, o);
    const linked = await this.projects.query(
      `SELECT DISTINCT s.id FROM internship_sessions s
       WHERE s.id IN (SELECT a.sessionId FROM assignments a WHERE a.projectId = @0)
          OR s.id IN (SELECT sp.sessionId FROM sprints sp WHERE sp.projectId = @0 AND sp.sessionId IS NOT NULL)`,
      [projectId],
    ) as Array<{ id: string }>;
    const out: Array<{ id: string; code: string; name: string; status: string; startDate: Date; endDate: Date; memberCount: number }> = [];
    for (const row of linked) {
      const session = await this.sessions.findOne({ where: { id: row.id } });
      if (!session) continue;
      if (o && !o.isAdmin) {
        const owned =
          session.leadInstructorId === o.userId ||
          (await this.sessionInstructors.findOne({ where: { sessionId: session.id, instructorId: o.userId } })) !== null;
        if (!owned) continue;
      }
      const memberCount = await this.sessionMembers.count({ where: { sessionId: session.id } });
      out.push({ id: session.id, code: session.code, name: session.name, status: session.status, startDate: session.startDate, endDate: session.endDate, memberCount });
    }
    return out.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  }

  /** Role slots with live filled counts (active assignments carrying the role). */
  async getSlots(projectId: string, o?: Ownership): Promise<Array<{ roleCode: string; requiredCount: number; filledCount: number }>> {
    await this.getOne(projectId, o);
    const slots = await this.slots.find({ where: { projectId }, order: { roleCode: 'ASC' } });
    const filled = await this.slots.query(
      `SELECT pm.roleInProject AS roleCode, COUNT(*) AS filled
       FROM project_members pm
       INNER JOIN assignments a ON a.projectId = pm.projectId AND a.internId = pm.userId AND a.status = 'active'
       WHERE pm.projectId = @0 AND pm.roleInProject IS NOT NULL
       GROUP BY pm.roleInProject`,
      [projectId],
    ) as Array<{ roleCode: string; filled: number }>;
    const filledByRole = new Map(filled.map((r) => [r.roleCode, Number(r.filled)]));
    return slots.map((s) => ({ roleCode: s.roleCode, requiredCount: s.requiredCount, filledCount: filledByRole.get(s.roleCode) ?? 0 }));
  }

  /**
   * Replace all role slots (projects.manage + managing mentor).
   * Empty array clears the plan. Duplicate role codes → 400.
   */
  async setSlots(projectId: string, input: { slots: Array<{ roleCode: string; requiredCount: number }> }, ctx: ActorContext) {
    const o = await this.ownership(ctx.actorId);
    const project = await this.getOne(projectId, o);
    if (o && !o.isAdmin && project.mentorId !== o.userId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PROJECT_SCOPE_FORBIDDEN',
        message: 'Only the managing mentor can edit role slots. Claim the project first.',
      });
    }
    const codes = input.slots.map((s) => s.roleCode.trim());
    if (codes.some((c) => c.length === 0) || new Set(codes).size !== codes.length) {
      throw new ConflictException({
        statusCode: 409,
        code: 'ROLE_SLOT_INVALID',
        message: 'Role codes must be unique and non-blank.',
      });
    }
    await this.slots.manager.transaction(async (em) => {
      await em.delete(ProjectRoleSlot, { projectId });
      if (codes.length > 0) {
        await em.insert(
          ProjectRoleSlot,
          codes.map((roleCode, i) => ({ projectId, roleCode, requiredCount: input.slots[i].requiredCount })),
        );
      }
    });
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'project.slots_updated',
      targetType: 'project',
      targetId: projectId,
      detail: { slots: codes.length },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return this.getSlots(projectId, o);
  }

  /** Mentor must exist and be active (404 otherwise). */
  private async resolveMentor(userId?: string): Promise<string | null> {
    if (!userId) return null;
    const user = await this.users.findOne({ where: { id: userId, status: 'active' } });
    if (!user) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'Mentor not found or not active.',
      });
    }
    return user.id;
  }

  private async loadTechnologies(projectIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (projectIds.length === 0) return map;
    const rows = await this.technologies
      .createQueryBuilder('t')
      .where('t.projectId IN (:...projectIds)', { projectIds })
      .orderBy('t.technology', 'ASC')
      .getMany();
    for (const row of rows) {
      const list = map.get(row.projectId) ?? [];
      list.push(row.technology);
      map.set(row.projectId, list);
    }
    return map;
  }
}
