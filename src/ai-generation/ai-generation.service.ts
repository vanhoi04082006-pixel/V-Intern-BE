import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { aiErrorCode } from '../ai/ai-errors';
import { AuditService } from '../audit/audit.service';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectRoleSlot } from '../projects/entities/project-role-slot.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Task } from '../tasks/entities/task.entity';
import type { TaskPriority } from '../tasks/task-status.machine';
import { buildTaskCode } from '../tasks/tasks.service';
import { User } from '../users/entities/user.entity';
import { ActorContext } from '../users/users.service';
import { PermissionsService } from '../rbac/permissions.service';
import { resolveOwnership, type Ownership } from '../rbac/ownership';
import { TemplatesService } from '../templates/templates.service';
import { validateSprintPlan, type SprintPlan } from './sprint-plan.schema';
import { AiGenerationBatch } from './entities/ai-generation-batch.entity';

const PROMPT_VERSION = 'sprint-plan-v1';
const SPRINT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface MemberContext {
  userId: string;
  displayName: string;
  roleInProject: string | null;
  overallScore: number | null;
  recommendedRole: string | null;
  strengths: string[];
}

export interface PlanWarning {
  taskTitle: string;
  message: string;
}

function buildSystemPrompt(): string {
  return [
    'You plan internship sprints and tasks for a student software team.',
    'Rules:',
    '1. Output ONLY JSON matching: {"sprints":[{"code?","name","goal?","startDate","endDate","tasks":[{"title","description?","priority?","storyPoints?","dueDate?","suggestedRole?","assigneeId?"}]}]}.',
    '2. Assign each task to the member whose project role and interview strengths fit best.',
    '   NEVER assign backend/database work to a frontend-only member when a backend member exists, and vice versa.',
    '3. Put assigneeId ONLY from the provided member list (exact UUIDs). Use suggestedRole from the slot roles when unsure of the person.',
    '4. Keep every sprint inside the session window and every task dueDate inside its sprint.',
    '5. Priorities: low/medium/high/critical. Story points: integers 0..100.',
    '6. Do not invent people, scores, or decisions. Do not include approvals or evaluations.',
  ].join('\n');
}

@Injectable()
export class AiGenerationService {
  private readonly logger = new Logger(AiGenerationService.name);

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(InternshipSession) private readonly sessions: Repository<InternshipSession>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(ProjectRoleSlot) private readonly slots: Repository<ProjectRoleSlot>,
    @InjectRepository(Sprint) private readonly sprints: Repository<Sprint>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AiGenerationBatch) private readonly batches: Repository<AiGenerationBatch>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ai: AiService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly templates: TemplatesService,
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

  /** Management gate shared by draft + confirm: claimed project + owned session (or admin). */
  private async assertManaged(projectId: string, sessionId: string, o?: Ownership): Promise<{ project: Project; session: InternshipSession }> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException({ statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'Project not found.' });
    }
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException({ statusCode: 404, code: 'SESSION_NOT_FOUND', message: 'Internship session not found.' });
    }
    if (o && !o.isAdmin) {
      if (project.mentorId !== o.userId) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'SPRINT_SCOPE_FORBIDDEN',
          message: 'Only the managing mentor can generate sprints for this project. Claim it first.',
        });
      }
      if (!(await this.isSessionOwned(sessionId, o.userId))) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'SPRINT_SCOPE_FORBIDDEN',
          message: 'You do not manage this internship session.',
        });
      }
    }
    return { project, session };
  }

  private async memberContext(projectId: string, sessionId: string): Promise<MemberContext[]> {
    const rows = await this.assignments.find({ where: { projectId, sessionId, status: 'active' } });
    if (rows.length === 0) return [];
    const users = await this.users.find({ where: rows.map((a) => ({ id: a.internId })) });
    const nameById = new Map(users.map((u) => [u.id, u.displayName]));
    const roles = await this.members.find({ where: { projectId } });
    const roleByUser = new Map(roles.map((m) => [m.userId, m.roleInProject]));
    const interviews = await this.dataSource.query(
      `SELECT p.userId AS userId, r.overallScore AS overallScore, r.recommendedRole AS recommendedRole, r.strengthsJson AS strengthsJson
       FROM recruitment_profiles p
       INNER JOIN recruitment_results r ON r.id = (
         SELECT TOP(1) r2.id FROM recruitment_results r2 WHERE r2.profileId = p.id ORDER BY r2.evaluatedAt DESC
       )
       WHERE p.userId IN (${rows.map((_, i) => `@${i}`).join(', ')})`,
      rows.map((a) => a.internId),
    ) as Array<{ userId: string; overallScore: number; recommendedRole: string | null; strengthsJson: string }>;
    const interviewByUser = new Map(interviews.map((r) => [r.userId, r]));
    return rows.map((a) => {
      const iv = interviewByUser.get(a.internId);
      let strengths: string[] = [];
      try {
        const parsed: unknown = JSON.parse(iv?.strengthsJson ?? '[]');
        if (Array.isArray(parsed)) strengths = parsed.filter((s): s is string => typeof s === 'string').slice(0, 3);
      } catch {
        strengths = [];
      }
      return {
        userId: a.internId,
        displayName: nameById.get(a.internId) ?? 'Thành viên',
        roleInProject: roleByUser.get(a.internId) ?? null,
        overallScore: iv ? Number(iv.overallScore) : null,
        recommendedRole: iv?.recommendedRole ?? null,
        strengths,
      };
    });
  }

  async draft(
    input: { projectId: string; sessionId: string; sprintCount?: number; startDate?: string },
    ctx: ActorContext,
  ) {
    const o = await this.ownership(ctx.actorId);
    const { project, session } = await this.assertManaged(input.projectId, input.sessionId, o);
    const [members, slots, technologies] = await Promise.all([
      this.memberContext(input.projectId, input.sessionId),
      this.slots.find({ where: { projectId: input.projectId }, order: { roleCode: 'ASC' } }),
      this.dataSource.query('SELECT technology FROM project_technologies WHERE projectId = @0 ORDER BY technology', [input.projectId]) as Promise<Array<{ technology: string }>>,
    ]);
    if (members.length === 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'GENERATION_NO_MEMBERS',
        message: 'Assign at least one intern to this project and session before generating.',
      });
    }
    const snapshot = await this.templateSnapshot(project.id);
    const { data, warnings, run } = await this.runGeneration(project, session, members, slots, technologies, snapshot, {
      sprintCount: input.sprintCount,
      startDate: input.startDate,
      actorId: ctx.actorId,
    });
    return { draft: data, warnings, run };
  }

  /** Template snapshot context for the prompt (tolerant: non-template projects proceed without). */
  private async templateSnapshot(projectId: string): Promise<{ version: number; definition: Record<string, unknown> } | null> {
    try {
      const ctx = await this.templates.projectContext(projectId);
      if (!ctx) return null;
      return { version: ctx.templateVersion, definition: ctx.definition as Record<string, unknown> };
    } catch {
      return null;
    }
  }

  private templatePromptInput(snapshot: { version: number; definition: Record<string, unknown> } | null): Record<string, unknown> | null {
    if (!snapshot) return null;
    const d = snapshot.definition;
    const pick = (key: string): unknown => (d[key] === undefined ? null : d[key]);
    return {
      version: snapshot.version,
      objectives: pick('objectives'),
      scope: { in: pick('scopeIn'), out: pick('scopeOut') },
      requirements: { functional: pick('functionalRequirements'), nonFunctional: pick('nonFunctionalRequirements') },
      roles: pick('roleDetails') ?? pick('roles'),
      blueprint: pick('sprints'),
      expectedOutputs: pick('expectedOutputs'),
      acceptance: pick('acceptance'),
    };
  }

  /** Shared provider call: prompt assembly + structured generation + role-fit warnings. */
  private async runGeneration(
    project: Project,
    session: InternshipSession,
    members: MemberContext[],
    slots: ProjectRoleSlot[],
    technologies: Array<{ technology: string }>,
    snapshot: { version: number; definition: Record<string, unknown> } | null,
    opts: { sprintCount?: number; startDate?: string; actorId?: string | null },
  ): Promise<{ data: SprintPlan; warnings: PlanWarning[]; run: { id: string; provider: string; model: string; status: string } }> {
    let data: SprintPlan;
    let run: { id: string; provider: string; model: string; status: string };
    try {
      const result = await this.ai.generateStructuredWithRun<SprintPlan>({
        feature: 'sprint-plan',
        userId: opts.actorId ?? null,
        resourceType: 'project',
        resourceId: project.id,
        promptVersion: PROMPT_VERSION,
        request: {
          task: 'sprint-plan',
          systemPrompt: buildSystemPrompt(),
          input: {
            project: {
              name: project.name,
              description: project.description,
              technologies: technologies.map((t) => t.technology),
              domain: project.domainCategory,
              difficulty: project.difficulty,
            },
            session: { code: session.code, startDate: session.startDate, endDate: session.endDate },
            slots: slots.map((s) => ({ role: s.roleCode, required: s.requiredCount })),
            members,
            template: this.templatePromptInput(snapshot),
            sprintCount: opts.sprintCount ?? Math.min(4, Math.max(1, members.length > 4 ? 4 : 2)),
            startDate: opts.startDate ?? session.startDate,
          },
          schemaName: 'sprint-plan',
          validate: validateSprintPlan,
          modelOptions: { temperature: 0.2, maxOutputTokens: 6000 },
        },
      });
      data = result.data;
      run = { id: result.run.id, provider: result.result.provider, model: result.result.model, status: result.run.status };
    } catch (err) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: aiErrorCode(err),
        message: 'The AI sprint planner is temporarily unavailable. Try again shortly — nothing was created.',
      });
    }
    const warnings = this.roleFitWarnings(data, members);
    return { data, warnings, run };
  }

  /** Server-side role-fit check: assignee must be assigned; role tags should match member roles. */
  roleFitWarnings(plan: SprintPlan, members: MemberContext[]): PlanWarning[] {
    const byId = new Map(members.map((m) => [m.userId, m]));
    const warnings: PlanWarning[] = [];
    for (const sprint of plan.sprints) {
      for (const task of sprint.tasks) {
        if (task.assigneeId && !byId.has(task.assigneeId)) {
          warnings.push({ taskTitle: task.title, message: 'Assignee is not assigned to this project/session.' });
          continue;
        }
        if (task.assigneeId && task.suggestedRole) {
          const memberRole = (byId.get(task.assigneeId)?.roleInProject ?? '').toLowerCase();
          const suggested = task.suggestedRole.toLowerCase();
          if (memberRole && memberRole !== 'intern' && !memberRole.includes(suggested) && !suggested.includes(memberRole)) {
            warnings.push({
              taskTitle: task.title,
              message: `Suggested role '${task.suggestedRole}' differs from member role '${byId.get(task.assigneeId)?.roleInProject}'. Review before confirming.`,
            });
          }
        }
      }
    }
    return warnings;
  }

  async confirm(
    input: { projectId: string; sessionId: string; draft: Record<string, unknown>; requestId: string; planId?: string },
    ctx: ActorContext,
  ) {
    const o = await this.ownership(ctx.actorId);
    const { project, session } = await this.assertManaged(input.projectId, input.sessionId, o);
    let plan: SprintPlan;
    try {
      plan = validateSprintPlan(input.draft);
    } catch (err) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'AI_INVALID_RESPONSE',
        message: `Draft failed validation: ${err instanceof Error ? err.message : 'invalid plan'}`,
      });
    }
    const existing = await this.batches.findOne({ where: { createdById: ctx.actorId ?? '', requestId: input.requestId } });
    if (existing) {
      return { ...(JSON.parse(existing.summaryJson) as Record<string, unknown>), deduped: true };
    }
    const members = await this.memberContext(input.projectId, input.sessionId);
    const memberIds = new Set(members.map((m) => m.userId));
    const summary = await this.dataSource.transaction(async (em) => {
      const sprintIds: string[] = [];
      const taskIds: string[] = [];
      const usedCodes = new Set<string>();
      for (let i = 0; i < plan.sprints.length; i++) {
        const ps = plan.sprints[i];
        let code = ps.code && SPRINT_CODE_PATTERN.test(ps.code) ? ps.code : `${project.code}-AI-${i + 1}`;
        for (let attempt = 0; attempt < 5 && (usedCodes.has(code) || (await em.getRepository(Sprint).findOne({ where: { code } }))); attempt++) {
          code = `${project.code}-AI-${i + 1}-${attempt + 1}`;
        }
        usedCodes.add(code);
        const sprint = await em.save(
          em.create(Sprint, {
            code,
            name: ps.name,
            description: null,
            goal: ps.goal,
            projectId: project.id,
            sessionId: session.id,
            status: 'planned',
            startDate: new Date(ps.startDate),
            endDate: new Date(ps.endDate),
            createdById: ctx.actorId ?? null,
          }),
        );
        sprintIds.push(sprint.id);
        for (const pt of ps.tasks) {
          if (pt.assigneeId && !memberIds.has(pt.assigneeId)) {
            throw new BadRequestException({
              statusCode: 400,
              code: 'GENERATION_ASSIGNEE_INVALID',
              message: `Task '${pt.title}' is assigned to someone outside this project/session.`,
            });
          }
          if (pt.dueDate && (Date.parse(pt.dueDate) < Date.parse(ps.startDate) || Date.parse(pt.dueDate) > Date.parse(ps.endDate))) {
            throw new BadRequestException({
              statusCode: 400,
              code: 'GENERATION_DUE_OUT_OF_RANGE',
              message: `Task '${pt.title}' due date is outside its sprint.`,
            });
          }
          const seqRows = (await em.query('SELECT NEXT VALUE FOR task_code_seq AS v')) as Array<{ v: number | string }>;
          const task = await em.save(
            em.create(Task, {
              code: buildTaskCode(project.code, Number(seqRows[0]?.v ?? 0)),
              title: pt.title,
              description: pt.description,
              projectId: project.id,
              sprintId: sprint.id,
              assigneeId: pt.assigneeId,
              createdById: ctx.actorId ?? null,
              status: 'todo',
              priority: pt.priority as TaskPriority,
              storyPoints: pt.storyPoints,
              progress: 0,
              dueDate: pt.dueDate ? new Date(pt.dueDate) : null,
            }),
          );
          taskIds.push(task.id);
        }
      }
      return { sprintIds, taskIds, sprintCount: sprintIds.length, taskCount: taskIds.length };
    });
    await this.batches.save(
      this.batches.create({
        requestId: input.requestId,
        createdById: ctx.actorId ?? '',
        projectId: project.id,
        sessionId: session.id,
        summaryJson: JSON.stringify(summary),
        // This row records the PUBLISH of a reviewed plan (idempotency anchor),
        // not a draft generation — plan lifecycle rows carry draftJson.
        status: 'confirmed',
      }),
    );
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: 'ai.sprint_plan_confirmed',
      targetType: 'project',
      targetId: project.id,
      detail: { ...summary, requestId: input.requestId },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    if (input.planId) {
      await this.batches.update(
        { id: input.planId, projectId: project.id, sessionId: session.id },
        { status: 'confirmed' },
      );
    }
    return { ...summary, deduped: false };
  }

  /**
   * M5 persisted plan generation (WP-5, ADR-07/08): same provider path as
   * draft(), but the plan row (generating → ready | failed) survives for
   * instructor review across page loads. Idempotent per session + template
   * version: an existing usable plan is returned, never regenerated.
   * Stale `generating` rows (> 30 min, crashed trigger) are failed over.
   */
  async generatePlan(
    input: { projectId: string; sessionId: string; sprintCount?: number; startDate?: string; requestId?: string },
    ctx: ActorContext,
  ) {
    const o = await this.ownership(ctx.actorId);
    const { project, session } = await this.assertManaged(input.projectId, input.sessionId, o);
    const snapshot = await this.templateSnapshot(project.id);
    const templateVersion = snapshot?.version ?? null;
    if (input.requestId) {
      const replay = await this.batches.findOne({
        where: { createdById: ctx.actorId ?? '', requestId: input.requestId },
      });
      if (replay?.draftJson) {
        return this.toPlanResult(replay, true);
      }
    }
    const existing = await this.batches.find({
      where: { sessionId: session.id },
      order: { createdAt: 'DESC' },
    });
    for (const row of existing) {
      if (row.status === 'generating' && Date.now() - new Date(row.createdAt).getTime() > 30 * 60_000) {
        row.status = 'failed';
        row.errorJson = JSON.stringify({ code: 'GENERATION_STALE', message: 'A previous generation never finished; it was marked failed.' });
        await this.batches.save(row);
        continue;
      }
      if ((row.status === 'ready' || row.status === 'confirmed') && (row.templateVersion ?? null) === templateVersion && row.draftJson) {
        return this.toPlanResult(row, true);
      }
    }
    const [members, slots, technologies] = await Promise.all([
      this.memberContext(input.projectId, input.sessionId),
      this.slots.find({ where: { projectId: input.projectId }, order: { roleCode: 'ASC' } }),
      this.dataSource.query('SELECT technology FROM project_technologies WHERE projectId = @0 ORDER BY technology', [input.projectId]) as Promise<Array<{ technology: string }>>,
    ]);
    if (members.length === 0) {
      throw new ConflictException({
        statusCode: 409,
        code: 'GENERATION_NO_MEMBERS',
        message: 'Assign at least one intern to this project and session before generating.',
      });
    }
    const row = await this.batches.save(
      this.batches.create({
        requestId: input.requestId ?? randomUUID(),
        createdById: ctx.actorId ?? '',
        projectId: project.id,
        sessionId: session.id,
        summaryJson: '{}',
        status: 'generating',
        draftJson: null,
        errorJson: null,
        templateVersion,
      }),
    );
    try {
      const { data, warnings, run } = await this.runGeneration(project, session, members, slots, technologies, snapshot, {
        sprintCount: input.sprintCount,
        startDate: input.startDate,
        actorId: ctx.actorId,
      });
      row.status = 'ready';
      row.draftJson = JSON.stringify(data);
      await this.batches.save(row);
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'ai.sprint_plan_generated',
        targetType: 'project',
        targetId: project.id,
        detail: { planId: row.id, sessionId: session.id, templateVersion, sprints: data.sprints.length },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return { planId: row.id, draft: data, warnings, run, status: 'ready' as const, deduped: false };
    } catch (err) {
      row.status = 'failed';
      row.errorJson = JSON.stringify({
        code: err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'AI_UNAVAILABLE',
        message: err instanceof Error ? err.message : 'Generation failed.',
      });
      await this.batches.save(row);
      throw err;
    }
  }

  private async toPlanResult(row: AiGenerationBatch, deduped: boolean) {
    const draft = row.draftJson ? (JSON.parse(row.draftJson) as SprintPlan) : null;
    let warnings: PlanWarning[] = [];
    if (draft) {
      const members = await this.memberContext(row.projectId, row.sessionId);
      warnings = this.roleFitWarnings(draft, members);
    }
    return {
      planId: row.id,
      projectId: row.projectId,
      sessionId: row.sessionId,
      templateVersion: row.templateVersion,
      status: row.status,
      createdAt: row.createdAt,
      draft,
      warnings,
      error: row.errorJson ? (JSON.parse(row.errorJson) as unknown) : null,
      deduped,
    };
  }

  /** Plan history of a session (owned scope enforced). */
  async plans(sessionId: string, actorId?: string | null) {
    const o = await this.ownership(actorId);
    if (o && !o.isAdmin && !(await this.isSessionOwned(sessionId, o.userId))) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SPRINT_SCOPE_FORBIDDEN',
        message: 'You do not manage this internship session.',
      });
    }
    const rows = await this.batches.find({ where: { sessionId }, order: { createdAt: 'DESC' } });
    // Confirm idempotency records (status confirmed, no draft) are bookkeeping
    // for a publish, not plan drafts — they must not appear as new plans.
    const planRows = rows.filter((r) => r.draftJson !== null || r.status !== 'confirmed');
    return planRows.map((row) => {
      let sprintCount = 0;
      let taskCount = 0;
      try {
        const draft = row.draftJson ? (JSON.parse(row.draftJson) as SprintPlan) : null;
        sprintCount = draft?.sprints.length ?? 0;
        taskCount = draft?.sprints.reduce((n, s) => n + s.tasks.length, 0) ?? 0;
      } catch {
        // Corrupt draft JSON degrades to zero counts, never 500s the list.
      }
      return {
        planId: row.id,
        projectId: row.projectId,
        sessionId: row.sessionId,
        templateVersion: row.templateVersion,
        status: row.status,
        createdAt: row.createdAt,
        sprintCount,
        taskCount,
        hasDraft: row.draftJson !== null,
      };
    });
  }

  /** One plan with fresh warnings (team may have changed since generation). */
  async plan(id: string, actorId?: string | null) {
    const row = await this.batches.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException({ statusCode: 404, code: 'PLAN_NOT_FOUND', message: 'AI plan not found.' });
    }
    const o = await this.ownership(actorId);
    await this.assertManaged(row.projectId, row.sessionId, o);
    return this.toPlanResult(row, false);
  }
}
