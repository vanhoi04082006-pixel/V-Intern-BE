import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { ProjectTechnology } from '../projects/entities/project-technology.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatusHistory } from '../tasks/entities/task-status-history.entity';
import { TasksService } from '../tasks/tasks.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { RequestPrincipal } from '../common/types/request-principal';
import { ChangeRequestDto, CreateTemplateDto, StartTemplateDto } from './template.dto';
import { sprintDates } from './template-policy';
interface TemplateRow { id: string; name: string; definitionJson: string; version: number; createdAt: Date; }
@Injectable()
export class TemplatesService {
  constructor(private readonly db: DataSource, private readonly tasks: TasksService) {}
  async list() {
    const rows: TemplateRow[] = await this.db.query('SELECT TOP(100) * FROM project_templates ORDER BY createdAt DESC,id');
    return rows.map(r => ({ id: r.id, name: r.name, version: r.version, createdAt: r.createdAt, definition: JSON.parse(r.definitionJson) as CreateTemplateDto }));
  }
  async create(dto: CreateTemplateDto, actor: string) {
    if (dto.sprints.some(s => s.tasks.some(t => !dto.roles.includes(t.role)))) throw new BadRequestException('Task role must belong to template roles.');
    const id = randomUUID();
    await this.db.transaction(async em => {
      await em.query('INSERT INTO project_templates(id,name,definitionJson,createdById) VALUES(@0,@1,@2,@3)', [id,dto.name,JSON.stringify(dto),actor]);
      await this.record(em, actor, 'template.created', id, { name: dto.name });
    });
    return { id, name: dto.name, version: 1, definition: dto };
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
  async start(id: string, dto: StartTemplateDto, actor: string) {
    return this.db.transaction(async em => {
      const rows: TemplateRow[] = await em.query('SELECT * FROM project_templates WITH(HOLDLOCK) WHERE id=@0', [id]);
      if (!rows.length) throw new NotFoundException('Template not found.');
      const definition = JSON.parse(rows[0].definitionJson) as CreateTemplateDto;
      let offset = 0;
      const dates = definition.sprints.map(s => { const d = sprintDates(dto.startDate,dto.endDate,offset,s.durationDays); offset += s.durationDays; return d; });
      const code = `RUN-${randomUUID().slice(0,8).toUpperCase()}`;
      const session = await em.save(InternshipSession, em.create(InternshipSession, { code, name: dto.name, description: definition.description, status: 'active', leadInstructorId: actor, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate) }));
      await em.insert(SessionInstructor, { sessionId: session.id, instructorId: actor });
      const project = await em.save(Project, em.create(Project, { code, name: definition.name, description: definition.description, difficulty: definition.difficulty, status: 'active', mentorId: actor, capacity: null, domainCategory: null, startDate: session.startDate, endDate: session.endDate, archivedAt: null }));
      for (const technology of definition.techStack) await em.insert(ProjectTechnology, { projectId: project.id, technology });
      const runId = randomUUID();
      await em.query('INSERT INTO template_runs(id,templateId,projectId,sessionId,templateVersion,snapshotJson) VALUES(@0,@1,@2,@3,@4,@5)', [runId,id,project.id,session.id,rows[0].version,rows[0].definitionJson]);
      const taskIds: string[] = [], sprintIds: string[] = [];
      for (const [index, plan] of definition.sprints.entries()) {
        const sprint = await em.save(Sprint, em.create(Sprint, { code: `${code}-S${index+1}`, name: plan.name, description: plan.goal, goal: plan.goal, projectId: project.id, sessionId: session.id, status: index === 0 ? 'active' : 'planned', createdById: actor, ...dates[index] }));
        sprintIds.push(sprint.id);
        for (const work of plan.tasks) {
          const task = await this.createTask(em,project,actor,work.title,work.requirements,{ sprintId: sprint.id, storyPoints: work.storyPoints, dueDate: sprint.endDate });
          taskIds.push(task.id);
          await em.query('INSERT INTO task_specs(taskId,specJson) VALUES(@0,@1)', [task.id,JSON.stringify({ requirements: work.requirements, role: work.role, dod: [...definition.dod,...work.dod], rubricVersion: definition.rubricVersion, documentation: definition.documentation })]);
        }
      }
      await this.record(em,actor,'template.started',runId,{ templateId: id, templateVersion: rows[0].version, projectId: project.id, sessionId: session.id, sprintIds, taskIds });
      return { id: runId, projectId: project.id, sessionId: session.id, sprintIds, taskIds };
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
