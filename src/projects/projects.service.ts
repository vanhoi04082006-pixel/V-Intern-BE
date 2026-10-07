import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
import { isUniqueViolation } from '../common/utils/db-errors';
import { User } from '../users/entities/user.entity';
import { ActorContext } from '../users/users.service';
import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
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
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  async list(q: {
    page: number;
    pageSize: number;
    q?: string;
    status?: string;
    difficulty?: string;
    sort?: 'createdAt' | 'code' | 'name';
    order?: 'ASC' | 'DESC';
  }) {
    const qb = this.projects.createQueryBuilder('p');
    if (q.q && q.q.length > 0) {
      const term = `%${q.q}%`;
      qb.andWhere('(p.code LIKE :term OR p.name LIKE :term)', { term });
    }
    if (q.status) qb.andWhere('p.status = :status', { status: q.status });
    if (q.difficulty) qb.andWhere('p.difficulty = :difficulty', { difficulty: q.difficulty });
    const sortCol = q.sort ?? 'createdAt';
    qb.orderBy(`p.${sortCol}`, q.order ?? 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    const techMap = await this.loadTechnologies(items.map((p) => p.id));
    return { items: items.map((p) => toProjectResponse(p, techMap.get(p.id) ?? [])), total };
  }

  async getOne(id: string): Promise<Project> {
    const project = await this.projects.findOne({ where: { id } });
    if (!project) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found.',
      });
    }
    return project;
  }

  async getOneDetailed(id: string): Promise<ProjectResponse> {
    const project = await this.getOne(id);
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
            mentorId,
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
    const project = await this.getOne(id);
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

  async listMembers(projectId: string): Promise<ProjectMemberRow[]> {
    await this.getOne(projectId);
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
