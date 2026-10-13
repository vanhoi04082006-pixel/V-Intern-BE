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
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { TaskStatusHistory } from '../tasks/entities/task-status-history.entity';
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
    '7. Every task must include a clear description, a dueDate and acceptanceCriteria (an array of concrete completion checks).',
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

  private async lockRequest(em: EntityManager, actorId: string, requestId?: string): Promise<void> {
    if (!requestId) return;
    // The unique idempotency key spans sessions. Acquire it before a session
    // lock so cross-session reuse returns a scoped conflict, never a SQL500.
    const result: Array<{ lockResult: number }> = await em.query(
      `DECLARE @result int;
       EXEC @result = sys.sp_getapplock @Resource=@0, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000;
       SELECT @result AS lockResult`, [`ai-request:${actorId.toLowerCase()}:${requestId.toLowerCase()}`]);
    if (result[0]?.lockResult < 0) {
      throw new ConflictException({ code: 'GENERATION_REQUEST_BUSY', message: 'This request is still being processed. Retry the same request ID.' });
    }
  }

  private async assertLockedOwnership(em: EntityManager, projectId: string, session: InternshipSession, o?: Ownership): Promise<void> {
    if (!o || o.isAdmin) return;
    const project = await em.getRepository(Project).createQueryBuilder('p').setLock('pessimistic_write')
      .where('p.id = :id', { id: projectId }).getOneOrFail();
    const instructors: Array<{ ok: number }> = await em.query(
      'SELECT 1 AS ok FROM session_instructors WITH (HOLDLOCK) WHERE sessionId = @0 AND instructorId = @1', [session.id, o.userId]);
    if (project.mentorId?.toLowerCase() !== o.userId.toLowerCase() ||
        (session.leadInstructorId?.toLowerCase() !== o.userId.toLowerCase() && !instructors.length)) {
      throw new ForbiddenException({ code: 'SPRINT_SCOPE_FORBIDDEN', message: 'You no longer manage this project and session.' });
    }
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
      if (project.mentorId?.toLowerCase() !== o.userId.toLowerCase()) {
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
    const runs: Array<{ projectId: string }> = await this.dataSource.query(
      'SELECT projectId FROM template_runs WHERE sessionId = @0', [session.id],
    );
    if (runs.length && !runs.some((r) => r.projectId.toLowerCase() === project.id.toLowerCase())) {
      throw new ConflictException({ code: 'GENERATION_SESSION_PROJECT_MISMATCH', message: 'Project does not belong to this template session.' });
    }
    return { project, session };
  }

  private async memberContext(projectId: string, sessionId: string, em?: EntityManager): Promise<MemberContext[]> {
    const rows = await (em?.getRepository(Assignment) ?? this.assignments).find({ where: { projectId, sessionId, status: 'active' } });
    if (rows.length === 0) return [];
    const users = await (em?.getRepository(User) ?? this.users).find({ where: rows.map((a) => ({ id: a.internId })) });
    const nameById = new Map(users.map((u) => [u.id, u.displayName]));
    const roles = await (em?.getRepository(ProjectMember) ?? this.members).find({ where: { projectId } });
    const roleByUser = new Map(roles.map((m) => [m.userId, m.roleInProject]));
    const interviews = await (em ?? this.dataSource).query(
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
    const byId = new Map(members.map((m) => [m.userId.toLowerCase(), m]));
    const warnings: PlanWarning[] = [];
    for (const sprint of plan.sprints) {
      for (const task of sprint.tasks) {
        if (task.assigneeId && !byId.has(task.assigneeId.toLowerCase())) {
          warnings.push({ taskTitle: task.title, message: 'Assignee is not assigned to this project/session.' });
          continue;
        }
        if (task.assigneeId && task.suggestedRole) {
          const memberRole = (byId.get(task.assigneeId.toLowerCase())?.roleInProject ?? '').toLowerCase();
          const suggested = task.suggestedRole.toLowerCase();
          if (memberRole && memberRole !== 'intern' && !memberRole.includes(suggested) && !suggested.includes(memberRole)) {
            warnings.push({
              taskTitle: task.title,
              message: `Suggested role '${task.suggestedRole}' differs from member role '${byId.get(task.assigneeId.toLowerCase())?.roleInProject}'. Review before confirming.`,
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
    return this.dataSource.transaction(async (em) => {
      await this.lockRequest(em, ctx.actorId ?? '', input.requestId);
      // Serialize generation/publish for this session, including requests from
      // other tabs or instructors. The idempotency record commits with the work.
      const lockedSession = await em.getRepository(InternshipSession).createQueryBuilder('s')
        .setLock('pessimistic_write').where('s.id = :id', { id: session.id }).getOneOrFail();
      await this.assertLockedOwnership(em, project.id, lockedSession, o);
      const batchRepo = em.getRepository(AiGenerationBatch);
      const existing = await batchRepo.findOne({ where: { createdById: ctx.actorId ?? '', requestId: input.requestId } });
      if (existing) {
        if (existing.projectId.toLowerCase() !== project.id.toLowerCase() ||
            existing.sessionId.toLowerCase() !== session.id.toLowerCase() || existing.draftJson ||
            existing.status !== 'confirmed' || !Array.isArray((JSON.parse(existing.summaryJson) as { sprintIds?: unknown }).sprintIds)) {
          throw new ConflictException({ code: 'GENERATION_REQUEST_CONFLICT', message: 'Request ID already belongs to another operation.' });
        }
        return { ...(JSON.parse(existing.summaryJson) as Record<string, unknown>), deduped: true };
      }
      const stored = input.planId ? await batchRepo.findOne({ where: { id: input.planId } }) : null;
      if (input.planId && (!stored || stored.projectId.toLowerCase() !== project.id.toLowerCase() ||
          stored.sessionId.toLowerCase() !== session.id.toLowerCase() || !stored.draftJson)) {
        throw new NotFoundException({ code: 'PLAN_NOT_FOUND', message: 'Plan not found in this project and session.' });
      }
      if (stored?.status === 'confirmed') {
        const published = JSON.parse(stored.summaryJson) as Record<string, unknown>;
        if (!Array.isArray(published.sprintIds)) {
          // Older publishes did not store their summary on the plan row.
          // Fail closed rather than ever publishing that plan twice.
          throw new ConflictException({ code: 'PLAN_ALREADY_CONFIRMED', message: 'This plan was already published.' });
        }
        return { ...published, deduped: true };
      }
      if (stored && stored.status !== 'ready') {
        throw new ConflictException({ code: 'PLAN_NOT_READY', message: 'Only a ready plan can be published.' });
      }
      if (stored && lockedSession.status !== 'active') {
        throw new ConflictException({ code: 'SESSION_NOT_ACTIVE', message: 'Start this session before publishing its plan.' });
      }
      const publishedPlans = await batchRepo.find({ where: { sessionId: session.id, status: 'confirmed' } });
      if (stored && publishedPlans.some((p) => p.draftJson)) {
        throw new ConflictException({ code: 'PLAN_ALREADY_PUBLISHED', message: 'Another plan has already been published for this session.' });
      }
      const snapshots: Array<{ snapshotJson: string; templateVersion: number }> = await em.query(
        'SELECT snapshotJson, templateVersion FROM template_runs WHERE projectId = @0 AND sessionId = @1', [project.id, session.id],
      );
      if (snapshots.length && !stored) {
        throw new ConflictException({ code: 'PLAN_REQUIRED', message: 'Review the stored AI plan before publishing this template session.' });
      }
      if (stored && snapshots.length && stored.templateVersion !== snapshots[0].templateVersion) {
        throw new ConflictException({ code: 'PLAN_STALE', message: 'The plan no longer matches the pinned template version.' });
      }
      const definition = snapshots.length ? JSON.parse(snapshots[0].snapshotJson) as Record<string, unknown> : null;
      const defaultCriteria = Array.isArray(definition?.dod) ? definition.dod.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
      // Lock the current roster while validating assignees and writing tasks.
      await em.query('SELECT id FROM assignments WITH (UPDLOCK, HOLDLOCK) WHERE projectId = @0 AND sessionId = @1 AND status = \'active\'', [project.id, session.id]);
      const members = await this.memberContext(project.id, session.id, em);
      const memberIds = new Set(members.map((m) => m.userId.toLowerCase()));
      const sprintIds: string[] = [];
      const taskIds: string[] = [];
      const usedCodes = new Set<string>();
      for (let i = 0; i < plan.sprints.length; i++) {
        const ps = plan.sprints[i];
        if (Date.parse(ps.startDate) < lockedSession.startDate.getTime() || Date.parse(ps.endDate) > lockedSession.endDate.getTime()) {
          throw new BadRequestException({ code: 'GENERATION_SPRINT_OUT_OF_RANGE', message: 'Sprint dates must stay inside the session window.' });
        }
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
          if (stored && !pt.description?.trim()) {
            throw new BadRequestException({ code: 'GENERATION_DESCRIPTION_REQUIRED', message: `Add a description for '${pt.title}' before publishing.` });
          }
          if (stored && pt.acceptanceCriteria.length === 0 && defaultCriteria.length === 0) {
            throw new BadRequestException({ code: 'GENERATION_ACCEPTANCE_CRITERIA_REQUIRED', message: `Add acceptance criteria for '${pt.title}' before publishing.` });
          }
          if (stored && !pt.assigneeId) {
            throw new BadRequestException({ code: 'GENERATION_ASSIGNEE_REQUIRED', message: `Choose a team member for '${pt.title}' before publishing.` });
          }
          if (pt.assigneeId && !memberIds.has(pt.assigneeId.toLowerCase())) {
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
              dueDate: new Date(pt.dueDate ?? ps.endDate),
            }),
          );
          taskIds.push(task.id);
          await em.query('INSERT INTO task_specs(taskId, specJson) VALUES (@0, @1)', [task.id, JSON.stringify({
            requirements: pt.description ?? pt.title,
            role: pt.suggestedRole ?? members.find((m) => m.userId.toLowerCase() === pt.assigneeId?.toLowerCase())?.roleInProject ?? 'intern',
            dod: pt.acceptanceCriteria.length ? pt.acceptanceCriteria : defaultCriteria,
            rubricVersion: typeof definition?.rubricVersion === 'string' ? definition.rubricVersion : 'task-review-v1',
            documentation: typeof definition?.documentation === 'string' ? definition.documentation : '',
          })]);
          await em.insert(TaskStatusHistory, { taskId: task.id, fromStatus: null, toStatus: 'todo', changedById: ctx.actorId ?? null, reason: 'Published from reviewed AI plan' });
        }
      }
      const summary = { sprintIds, taskIds, sprintCount: sprintIds.length, taskCount: taskIds.length };
      await batchRepo.save(batchRepo.create({
        requestId: input.requestId,
        createdById: ctx.actorId ?? '',
        projectId: project.id,
        sessionId: session.id,
        summaryJson: JSON.stringify(summary),
        // This row records the PUBLISH of a reviewed plan (idempotency anchor),
        // not a draft generation — plan lifecycle rows carry draftJson.
        status: 'confirmed',
      }));
      await em.insert(AuditLog, {
      actorId: ctx.actorId ?? null,
      action: 'ai.sprint_plan_confirmed',
      targetType: 'project',
      targetId: project.id,
      detail: JSON.stringify({ ...summary, requestId: input.requestId, planId: input.planId ?? null }),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    if (stored) {
      await batchRepo.update(
        { id: input.planId, projectId: project.id, sessionId: session.id },
        { status: 'confirmed', draftJson: JSON.stringify(plan), summaryJson: JSON.stringify(summary) },
      );
    }
    return { ...summary, deduped: false };
    });
  }

  /**
   * M5 persisted plan generation (WP-5, ADR-07/08): same provider path as
   * draft(), but the plan row (generating → ready | failed) survives for
   * instructor review across page loads. Idempotent per session + template
   * version: an existing usable plan is returned, never regenerated.
   * Stale `generating` rows (> 30 min, crashed trigger) are failed over.
   */
  async generatePlan(
    input: { projectId: string; sessionId: string; sprintCount?: number; startDate?: string; requestId?: string; regenerate?: boolean },
    ctx: ActorContext,
  ) {
    const o = await this.ownership(ctx.actorId);
    const { project, session } = await this.assertManaged(input.projectId, input.sessionId, o);
    const snapshot = await this.templateSnapshot(project.id);
    const templateVersion = snapshot?.version ?? null;
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
    const reservation = await this.dataSource.transaction(async (em) => {
      await this.lockRequest(em, ctx.actorId ?? '', input.requestId);
      const current = await em.getRepository(InternshipSession).createQueryBuilder('s')
        .setLock('pessimistic_write').where('s.id = :id', { id: session.id }).getOneOrFail();
      await this.assertLockedOwnership(em, project.id, current, o);
      if (current.status !== 'active') {
        throw new ConflictException({ code: 'SESSION_NOT_ACTIVE', message: 'Start the session before generating a persisted plan.' });
      }
      const repo = em.getRepository(AiGenerationBatch);
      if (input.requestId) {
        const replay = await repo.findOne({ where: { createdById: ctx.actorId ?? '', requestId: input.requestId } });
        if (replay) {
          if (replay.projectId.toLowerCase() !== project.id.toLowerCase() || replay.sessionId.toLowerCase() !== session.id.toLowerCase() ||
              (replay.status === 'confirmed' && !replay.draftJson)) {
            throw new ConflictException({ code: 'GENERATION_REQUEST_CONFLICT', message: 'Request ID belongs to another session.' });
          }
          return { row: replay, deduped: true };
        }
      }
      const existing = await repo.find({ where: { sessionId: session.id }, order: { createdAt: 'DESC', id: 'DESC' } });
      // Publishing any reviewed plan closes generation for this session, even
      // if a newer regenerate request was already in flight.
      const confirmed = existing.find(prior => prior.status === 'confirmed' && prior.draftJson);
      if (confirmed) return { row: confirmed, deduped: true };
      for (const prior of existing) {
        if (prior.status === 'generating') {
          if (Date.now() - prior.createdAt.getTime() <= 30 * 60_000) return { row: prior, deduped: true };
          await repo.update(prior.id, { status: 'failed', errorJson: JSON.stringify({ code: 'GENERATION_STALE', message: 'Previous generation did not finish.' }) });
        }
        if (prior.draftJson && (prior.status === 'confirmed' || (prior.status === 'ready' && !input.regenerate))) {
          return { row: prior, deduped: true };
        }
      }
      const row = await repo.save(repo.create({
        requestId: input.requestId ?? randomUUID(),
        createdById: ctx.actorId ?? '',
        projectId: project.id,
        sessionId: session.id,
        summaryJson: '{}',
        status: 'generating',
        draftJson: null,
        errorJson: null,
        templateVersion,
      }));
      return { row, deduped: false };
    });
    const { row } = reservation;
    if (reservation.deduped) return this.toPlanResult(row, true);
    // Generation runs detached: a real provider call may take minutes, and the
    // instructor UI must show "generating" immediately plus poll for the draft
    // (never block an HTTP request on the AI call — same contract as the
    // automatic trigger on Start Session).
    void this.runDetachedGeneration(row, project, session, members, slots, technologies, snapshot, input, ctx)
      .catch((err: unknown) => this.logger.error(`Could not persist AI generation result for ${row.id}: ${err instanceof Error ? err.message : 'database error'}`));
    return {
      planId: row.id,
      projectId: project.id,
      sessionId: session.id,
      templateVersion,
      status: 'generating' as const,
      deduped: false,
      draft: null,
      warnings: [],
      error: null,
      createdAt: row.createdAt,
    };
  }

  /** Detached generation: persists the draft or a failure, never throws out. */
  private async runDetachedGeneration(
    row: AiGenerationBatch,
    project: Project,
    session: InternshipSession,
    members: MemberContext[],
    slots: ProjectRoleSlot[],
    technologies: Array<{ technology: string }>,
    snapshot: { version: number; definition: Record<string, unknown> } | null,
    input: { sprintCount?: number; startDate?: string },
    ctx: ActorContext,
  ): Promise<void> {
    let data: SprintPlan | undefined;
    let failure: { code: string; message: string } | undefined;
    try {
      const result = await this.runGeneration(project, session, members, slots, technologies, snapshot, {
        sprintCount: input.sprintCount,
        startDate: input.startDate,
        actorId: ctx.actorId,
      });
      data = result.data;
    } catch (err) {
      const response = err instanceof ServiceUnavailableException ? err.getResponse() : null;
      const code = response && typeof response === 'object' && 'code' in response ? String(response.code) : aiErrorCode(err);
      failure = { code, message: 'The AI sprint planner could not finish. Retry without creating duplicate delivery work.' };
      this.logger.warn(`AI plan generation failed for session ${session.id}: ${code}`);
    }
    // A timeout/stale recovery or a session change may have overtaken this
    // detached call. Re-read under the same session lock as reservation/publish;
    // never save the old entity over a newer lifecycle state.
    const ready = await this.dataSource.transaction(async (em) => {
      const current = await em.getRepository(InternshipSession).createQueryBuilder('s')
        .setLock('pessimistic_write').where('s.id = :id', { id: session.id }).getOneOrFail();
      const repo = em.getRepository(AiGenerationBatch);
      const persisted = await repo.findOne({ where: { id: row.id } });
      if (!persisted || persisted.status !== 'generating') return false;
      if (!failure) {
        const published = await repo.find({ where: { sessionId: session.id, status: 'confirmed' } });
        const currentMembers = await this.memberContext(project.id, session.id, em);
        const roster = (values: MemberContext[]) => values.map(m => `${m.userId.toLowerCase()}:${m.roleInProject ?? ''}`).sort().join('|');
        const runs: Array<{ templateVersion: number }> = await em.query(
          'SELECT templateVersion FROM template_runs WHERE projectId = @0 AND sessionId = @1', [project.id, session.id]);
        if (published.some(plan => plan.draftJson) || current.status !== 'active' || current.startDate.getTime() !== session.startDate.getTime() ||
            current.endDate.getTime() !== session.endDate.getTime() || roster(currentMembers) !== roster(members) ||
            (runs[0]?.templateVersion ?? null) !== row.templateVersion) {
          failure = { code: 'GENERATION_CONTEXT_CHANGED', message: 'Session dates, state, template or team changed during generation. Review the session before retrying.' };
        }
      }
      await repo.update(row.id, failure
        ? { status: 'failed', errorJson: JSON.stringify(failure), draftJson: null }
        : { status: 'ready', draftJson: JSON.stringify(data), errorJson: null });
      return !failure;
    });
    if (!ready || !data) return;
    try {
      await this.audit.record({
        actorId: ctx.actorId ?? null,
        action: 'ai.sprint_plan_generated',
        targetType: 'project',
        targetId: project.id,
        detail: { planId: row.id, sessionId: session.id, templateVersion: row.templateVersion, sprints: data.sprints.length },
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    } catch {
      // An audit outage must not turn a successfully stored draft into a
      // provider failure or cause the instructor to regenerate it.
      this.logger.error(`Could not record AI plan generation audit for ${row.id}`);
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
