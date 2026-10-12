import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { ProjectTechnology } from '../projects/entities/project-technology.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatusHistory } from '../tasks/entities/task-status-history.entity';
import { TasksService } from '../tasks/tasks.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { RequestPrincipal } from '../common/types/request-principal';
import { toPaginated } from '../common/pagination/paginated';
import { isUniqueViolation } from '../common/utils/db-errors';
import { ChangeRequestDto, CreateTemplateDto, QueryTemplatesDto, StartTemplateDto, UpdateTemplateDto } from './template.dto';
interface TemplateRow { id: string; code: string; name: string; category: string | null; difficulty: string; status: string; version: number; definitionJson: string; createdAt: Date; archivedAt: Date | null; }
@Injectable()
export class TemplatesService {
  constructor(private readonly db: DataSource, private readonly tasks: TasksService) {}

  private parseDefinition(row: TemplateRow): CreateTemplateDto {
    return JSON.parse(row.definitionJson) as CreateTemplateDto;
  }

  private toSummary(row: TemplateRow) {
    const definition = this.parseDefinition(row);
    const details = definition.roleDetails ?? [];
    return {
      // Raw mssql returns UNIQUEIDENTIFIER uppercase; normalize to lowercase
      // so ids match entity-sourced responses everywhere in the API.
      id: row.id.toLowerCase(),
      code: row.code,
      name: row.name,
      category: row.category,
      difficulty: row.difficulty,
      status: row.status,
      version: row.version,
      techStack: definition.techStack ?? [],
      roles: definition.roles ?? [],
      teamSize: details.length > 0
        ? details.reduce((n, r) => n + (r.countMax ?? r.countMin ?? 1), 0)
        : (definition.roles ?? []).length,
      sprintCount: (definition.sprints ?? []).length,
      createdAt: row.createdAt,
    };
  }

  private validateDefinition(definition: CreateTemplateDto): void {
    if (definition.roleDetails) {
      const codes = new Set(definition.roles ?? []);
      const bad = definition.roleDetails.filter((r) => !codes.has(r.code));
      if (bad.length > 0) {
        throw new BadRequestException(`Role details must belong to template roles: ${bad.map((r) => r.code).join(', ')}.`);
      }
      for (const r of definition.roleDetails) {
        const min = r.countMin ?? 1;
        const max = r.countMax ?? min;
        if (min > max) throw new BadRequestException(`Role '${r.code}': countMin must not exceed countMax.`);
      }
    }
  }

  async list(q: QueryTemplatesDto) {
    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const status = q.status ?? 'active';
    const sortCol = q.sort === 'name' ? 'name' : q.sort === 'code' ? 'code' : 'createdAt';
    const clauses = [`status = @${0}`];
    const params: unknown[] = [status];
    if (q.search?.trim()) {
      params.push(`%${q.search.trim()}%`);
      clauses.push(`(code LIKE @${params.length - 1} OR name LIKE @${params.length - 1})`);
    }
    if (q.category?.trim()) {
      params.push(q.category.trim());
      clauses.push(`category = @${params.length - 1}`);
    }
    if (q.difficulty) {
      params.push(q.difficulty);
      clauses.push(`difficulty = @${params.length - 1}`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const totalRows: { n: number }[] = await this.db.query(
      `SELECT COUNT(*) AS n FROM project_templates ${where}`, params,
    );
    const total = Number(totalRows[0]?.n ?? 0);
    const rows: TemplateRow[] = await this.db.query(
      `SELECT * FROM project_templates ${where} ORDER BY ${sortCol} DESC, id OFFSET ${(page - 1) * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY`,
      params,
    );
    return toPaginated(rows.map((r) => this.toSummary(r)), page, pageSize, total);
  }

  async get(id: string) {
    const rows: TemplateRow[] = await this.db.query('SELECT * FROM project_templates WHERE id=@0', [id]);
    if (!rows.length) throw new NotFoundException('Template not found.');
    const row = rows[0];
    const runs: { id: string; projectId: string; sessionId: string; templateVersion: number; createdAt: Date }[] =
      await this.db.query('SELECT TOP(20) id, projectId, sessionId, templateVersion, createdAt FROM template_runs WHERE templateId=@0 ORDER BY createdAt DESC', [id]);
    const norm = (v: string) => v.toLowerCase();
    return {
      ...this.toSummary(row),
      archivedAt: row.archivedAt,
      definition: this.parseDefinition(row),
      runs: runs.map((r) => ({ ...r, id: norm(r.id), projectId: norm(r.projectId), sessionId: norm(r.sessionId) })),
    };
  }

  async create(dto: CreateTemplateDto, actor: string) {
    if (dto.sprints.some(s => s.tasks.some(t => !dto.roles.includes(t.role)))) throw new BadRequestException('Task role must belong to template roles.');
    this.validateDefinition(dto);
    const id = randomUUID();
    const code = dto.code?.trim() || `TPL-${randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      await this.db.transaction(async em => {
        await em.query('INSERT INTO project_templates(id,code,name,category,difficulty,definitionJson,createdById) VALUES(@0,@1,@2,@3,@4,@5,@6)',
          [id, code, dto.name, dto.category?.trim() || null, dto.difficulty, JSON.stringify(dto), actor]);
        await this.record(em, actor, 'template.created', id, { name: dto.name, code });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({ statusCode: 409, code: 'TEMPLATE_CODE_TAKEN', message: 'Template code is already taken.' });
      }
      throw err;
    }
    return { id, code, name: dto.name, version: 1, status: 'active', definition: dto };
  }

  async update(id: string, dto: UpdateTemplateDto, actor: string) {
    return this.db.transaction(async em => {
      const rows: TemplateRow[] = await em.query('SELECT * FROM project_templates WITH(HOLDLOCK) WHERE id=@0', [id]);
      if (!rows.length) throw new NotFoundException('Template not found.');
      const current = rows[0];
      const sets: string[] = [];
      const params: unknown[] = [];
      if (dto.name !== undefined) { params.push(dto.name); sets.push(`name=@${params.length - 1}`); }
      if (dto.category !== undefined) { params.push(dto.category?.trim() || null); sets.push(`category=@${params.length - 1}`); }
      if (dto.difficulty !== undefined) { params.push(dto.difficulty); sets.push(`difficulty=@${params.length - 1}`); }
      let version = current.version;
      if (dto.definition !== undefined) {
        if (dto.definition.sprints.some(s => s.tasks.some(t => !dto.definition!.roles.includes(t.role)))) {
          throw new BadRequestException('Task role must belong to template roles.');
        }
        this.validateDefinition(dto.definition);
        params.push(JSON.stringify(dto.definition));
        sets.push(`definitionJson=@${params.length - 1}`);
        version = current.version + 1;
        sets.push(`version=${version}`);
      }
      if (dto.status !== undefined) {
        params.push(dto.status);
        sets.push(`status=@${params.length - 1}`);
        sets.push(dto.status === 'archived' ? `archivedAt=SYSUTCDATETIME()` : `archivedAt=NULL`);
      }
      if (sets.length > 0) {
        params.push(id);
        await em.query(`UPDATE project_templates SET ${sets.join(', ')} WHERE id=@${params.length - 1}`, params);
      }
      await this.record(em, actor, 'template.updated', id, { version });
      const updated: TemplateRow[] = await em.query('SELECT * FROM project_templates WHERE id=@0', [id]);
      return this.toSummary(updated[0]);
    });
  }
  private async record(em: EntityManager, actorId: string, action: string, targetId: string, detail: object) {
    await em.insert(AuditLog, { actorId, action, targetType: 'project_template', targetId, detail: JSON.stringify(detail), ip: null, userAgent: null });
    await em.insert(ActivityEvent, { actorId, module: 'projects', action, targetType: 'project_template', targetId, summary: action });
  }
  private async createTask(em: EntityManager, project: Project, actor: string, title: string, description: string, extras: Partial<Task> = {}) {
    const seq: { v: number }[] = await em.query('SELECT NEXT VALUE FOR task_code_seq AS v');
    const task = await em.save(Task, em.create(Task, { projectId: project.id, code: `${project.code}-${seq[0].v}`, title, description, createdById: actor,
      assigneeId: null, sprintId: null, status: 'todo', priority: 'medium', progress: 0, storyPoints: null, dueDate: null, deletedAt: null, ...extras }));
    await em.insert(TaskStatusHistory, { taskId: task.id, fromStatus: null, toStatus: 'todo', changedById: actor, reason: 'Tạo từ kế hoạch dự án' });
    return task;
  }
  /**
   * M2 Project-first Start (WP-3): creates an UPCOMING session + ACTIVE project
   * from a template version, copies role slots, pins an immutable snapshot.
   * Sprints/tasks are NOT created here — AI planning (M5) generates them at
   * Start Session from the snapshot. Idempotent per (requester, requestId).
   */
  async start(id: string, dto: StartTemplateDto, actor: string) {
    if (new Date(dto.endDate) <= new Date(dto.startDate)) {
      throw new ConflictException({
        statusCode: 409, code: 'TEMPLATE_DATE_RANGE_INVALID', message: 'Session endDate must be after startDate.',
      });
    }
    return this.db.transaction(async em => {
      if (dto.requestId) {
        const prior: { id: string; projectId: string; sessionId: string; templateVersion: number }[] = await em.query(
          'SELECT id, projectId, sessionId, templateVersion FROM template_runs WHERE requesterId=@0 AND requestId=@1', [actor, dto.requestId]);
        if (prior.length) {
          return { id: prior[0].id.toLowerCase(), projectId: prior[0].projectId.toLowerCase(), sessionId: prior[0].sessionId.toLowerCase(), templateVersion: prior[0].templateVersion, deduped: true };
        }
      }
      const rows: TemplateRow[] = await em.query('SELECT * FROM project_templates WITH(HOLDLOCK) WHERE id=@0', [id]);
      if (!rows.length) throw new NotFoundException('Template not found.');
      const template = rows[0];
      if (template.status === 'archived') {
        throw new ConflictException({ statusCode: 409, code: 'TEMPLATE_ARCHIVED', message: 'Archived templates cannot start new sessions.' });
      }
      const definition = this.parseDefinition(template);
      const existing: { n: number }[] = await em.query('SELECT COUNT(*) AS n FROM template_runs WHERE templateId=@0', [id]);
      const seq = Number(existing[0]?.n ?? 0) + 1;
      const base = template.code || 'TPL';
      let sessionCode = `${base}-S${seq}`;
      let projectCode = `${base}-P${seq}`;
      const session = await em.save(InternshipSession, em.create(InternshipSession, {
        code: sessionCode, name: dto.name, description: definition.description, status: 'upcoming',
        leadInstructorId: actor, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate),
      })).catch(async (err: unknown) => {
        if (!isUniqueViolation(err)) throw err;
        sessionCode = `RUN-${randomUUID().slice(0, 8).toUpperCase()}`;
        projectCode = `RUN-${randomUUID().slice(0, 8).toUpperCase()}`;
        return em.save(InternshipSession, em.create(InternshipSession, {
          code: sessionCode, name: dto.name, description: definition.description, status: 'upcoming',
          leadInstructorId: actor, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate),
        }));
      });
      await em.insert(SessionInstructor, { sessionId: session.id, instructorId: actor });
      const project = await em.save(Project, em.create(Project, {
        code: projectCode, name: definition.name, description: definition.description,
        difficulty: definition.difficulty, status: 'active', mentorId: actor, capacity: null,
        domainCategory: template.category, startDate: session.startDate, endDate: session.endDate, archivedAt: null,
      }));
      for (const technology of definition.techStack) await em.insert(ProjectTechnology, { projectId: project.id, technology });
      // M24: copy template role slots to the project (cap = countMax).
      for (const role of definition.roleDetails ?? []) {
        await em.query('INSERT INTO project_role_slots(projectId, roleCode, requiredCount) VALUES(@0,@1,@2)',
          [project.id, role.code, role.countMax ?? role.countMin ?? 1]);
      }
      const runId = randomUUID();
      try {
        await em.query('INSERT INTO template_runs(id,templateId,projectId,sessionId,templateVersion,snapshotJson,requesterId,requestId) VALUES(@0,@1,@2,@3,@4,@5,@6,@7)',
          [runId, id, project.id, session.id, template.version, template.definitionJson, actor, dto.requestId ?? null]);
      } catch (err) {
        // Concurrent replay racing past the pre-check: return the winner.
        if (dto.requestId && isUniqueViolation(err)) {
          const winner: { id: string; projectId: string; sessionId: string; templateVersion: number }[] = await em.query(
            'SELECT id, projectId, sessionId, templateVersion FROM template_runs WHERE requesterId=@0 AND requestId=@1', [actor, dto.requestId]);
          if (winner.length) {
            return { id: winner[0].id.toLowerCase(), projectId: winner[0].projectId.toLowerCase(), sessionId: winner[0].sessionId.toLowerCase(), templateVersion: winner[0].templateVersion, deduped: true };
          }
        }
        throw err;
      }
      await this.record(em, actor, 'template.started', runId, { templateId: id, templateVersion: template.version, projectId: project.id, sessionId: session.id });
      return { id: runId, projectId: String(project.id).toLowerCase(), sessionId: String(session.id).toLowerCase(), templateVersion: template.version, deduped: false };
    });
  }
  async taskSpec(id: string, principal: RequestPrincipal) {
    await this.tasks.getOneDetailed(id,principal);
    const rows: { specJson: string }[] = await this.db.query('SELECT specJson FROM task_specs WHERE taskId=@0',[id]);
    return rows.length ? JSON.parse(rows[0].specJson) as object : null;
  }
  async projectContext(projectId: string) {
    const rows: { snapshotJson: string; templateVersion: number }[] = await this.db.query('SELECT snapshotJson,templateVersion FROM template_runs WHERE projectId=@0',[projectId]);
    return rows.length ? { definition: JSON.parse(rows[0].snapshotJson) as object, templateVersion: rows[0].templateVersion } : null;
  }
  async changes(projectId: string) { return this.db.query('SELECT TOP(100) * FROM project_change_requests WHERE projectId=@0 ORDER BY createdAt DESC',[projectId]); }
  async propose(projectId: string, dto: ChangeRequestDto, actor: string) {
    return this.db.transaction(async em => {
      const project = await em.findOneBy(Project,{ id: projectId });
      if (!project || project.status !== 'active') throw new ConflictException('Project must be active.');
      const id = randomUUID();
      await em.query('INSERT INTO project_change_requests(id,projectId,title,description,reason,dueDate,createdById) VALUES(@0,@1,@2,@3,@4,@5,@6)',[id,projectId,dto.title,dto.description,dto.reason,dto.dueDate ? new Date(dto.dueDate) : null,actor]);
      await this.record(em,actor,'change.proposed',id,{ projectId, reason: dto.reason });
      return { id };
    });
  }
  async apply(id: string, actor: string) {
    return this.db.transaction(async em => {
      const rows: { projectId: string; title: string; description: string; dueDate: Date | null; status: string; taskId: string | null }[] = await em.query('SELECT * FROM project_change_requests WITH(UPDLOCK,HOLDLOCK) WHERE id=@0',[id]);
      if (!rows.length) throw new NotFoundException('Change request not found.');
      const change = rows[0]; if (change.status === 'applied') return { taskId: change.taskId };
      const project = await em.findOne(Project,{ where: { id: change.projectId },lock: { mode: 'pessimistic_write' } });
      if (!project || project.status !== 'active') throw new ConflictException('Project must be active.');
      const task = await this.createTask(em,project,actor,change.title,change.description,{ dueDate: change.dueDate });
      await em.query("UPDATE project_change_requests SET status='applied',taskId=@1,appliedAt=SYSUTCDATETIME() WHERE id=@0",[id,task.id]);
      await this.record(em,actor,'change.applied',id,{ projectId: project.id,taskId: task.id });
      return { taskId: task.id };
    });
  }
}
