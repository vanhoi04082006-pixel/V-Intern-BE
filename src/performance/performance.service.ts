import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Evaluation } from '../evaluation/entities/evaluation.entity';
import { Project } from '../projects/entities/project.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatusHistory } from '../tasks/entities/task-status-history.entity';
import { User } from '../users/entities/user.entity';
import {
  calculatePerformanceMetrics,
  PerformanceMetrics,
  PerfEvaluationFact,
  PerfTaskFact,
} from './performance-calculator';

export interface PerformanceQuery {
  sessionId?: string;
  projectId?: string;
  from?: string;
  to?: string;
}

const forbidden = (code: string, message: string) =>
  new ForbiddenException({ statusCode: 403, code, message });
const notFound = (code: string, message: string) =>
  new NotFoundException({ statusCode: 404, code, message });

/**
 * PerformanceService (Phase 5, spec 16-21) — a READ MODEL over DB facts.
 * No metric is invented: tasks (with soft-delete exclusion), first-done
 * status history, finalized evaluations and active sprints feed the pure
 * deterministic calculator. Instructors may only read interns they own
 * (session instructor / project mentor); admins read everything (spec 61).
 */
@Injectable()
export class PerformanceService {
  constructor(
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(InternshipSession) private readonly sessions: Repository<InternshipSession>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(TaskStatusHistory) private readonly histories: Repository<TaskStatusHistory>,
    @InjectRepository(Evaluation) private readonly evaluations: Repository<Evaluation>,
    @InjectRepository(Sprint) private readonly sprints: Repository<Sprint>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(SessionInstructor) private readonly sessionInstructors: Repository<SessionInstructor>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Interns visible to the caller in the requested scope + quick metrics. */
  async listInterns(principal: { userId: string; isAdmin: boolean }, q: PerformanceQuery) {
    const scope = this.parseScope(q);
    let rows = await this.assignments.find({
      where: {
        ...(q.sessionId ? { sessionId: q.sessionId } : {}),
        ...(q.projectId ? { projectId: q.projectId } : {}),
        status: In(['active', 'completed']),
      },
    });
    if (scope.from || scope.to) {
      rows = rows.filter((a) => this.assignmentOverlaps(a, scope));
    }
    if (!principal.isAdmin) {
      const owned = await this.filterAssignmentsByOwnership(rows, principal.userId);
      rows = owned;
    }
    const internIds = [...new Set(rows.map((a) => a.internId))];
    if (internIds.length === 0) return { items: [], total: 0 };
    const users = await this.users.find({ where: internIds.map((id) => ({ id })) });
    const nameById = new Map(users.map((u) => [u.id, u.displayName]));
    const projectIds = [...new Set(rows.map((a) => a.projectId))];
    const sessionIds = [...new Set(rows.map((a) => a.sessionId))];
    const [projects, sessions] = await Promise.all([
      projectIds.length ? this.projects.find({ where: projectIds.map((id) => ({ id })) }) : Promise.resolve([]),
      sessionIds.length ? this.sessions.find({ where: sessionIds.map((id) => ({ id })) }) : Promise.resolve([]),
    ]);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const items = [];
    for (const internId of internIds) {
      const ownRows = rows.filter((a) => a.internId === internId);
      const primary = ownRows.find((a) => a.status === 'active') ?? ownRows.sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())[0];
      const primaryProject = primary ? projectById.get(primary.projectId) : undefined;
      const primarySession = primary ? sessionById.get(primary.sessionId) : undefined;
      const allowedProjectIds = principal.isAdmin ? undefined : new Set(rows.filter(a => a.internId === internId).map(a => a.projectId));
      const metrics = await this.computeForIntern(internId, { ...scope, allowedProjectIds });
      items.push({
        userId: internId,
        displayName: nameById.get(internId) ?? null,
        completedTaskCount: metrics.completedTaskCount,
        totalTaskCount: metrics.totalTaskCount,
        taskCompletionRate: metrics.taskCompletionRate,
        storyPointCompletionRate: metrics.storyPointCompletionRate,
        averageEvaluationScore: metrics.averageEvaluationScore,
        overdueOpenTaskCount: metrics.overdueOpenTaskCount,
        onTimeCompletionRate: metrics.onTimeCompletionRate,
        primaryProjectId: primary?.projectId ?? null,
        primaryProjectName: primaryProject?.name ?? null,
        primarySessionId: primary?.sessionId ?? null,
        primarySessionName: primarySession?.name ?? null,
      });
    }
    return { items, total: items.length };
  }

  /** Full deterministic metrics for ONE intern (ownership enforced, spec 61). */
  async getInternMetrics(principal: { userId: string; isAdmin: boolean }, targetUserId: string, q: PerformanceQuery) {
    const scope = this.parseScope(q);
    let allowedProjectIds: Set<string> | undefined;
    if (!principal.isAdmin) {
      const assignments = await this.assignments.find({
        where: { internId: targetUserId, status: In(['active', 'completed']) },
      });
      if (assignments.length === 0) {
        throw notFound('PERFORMANCE_INTERN_NOT_FOUND', 'No assignment data exists for this intern.');
      }
      const owned = await this.filterAssignmentsByOwnership(assignments, principal.userId);
      if (owned.length === 0) {
        throw forbidden('PERFORMANCE_SCOPE_FORBIDDEN', 'You do not manage this intern.');
      }
      allowedProjectIds = new Set(owned.map(a => a.projectId));
      if (scope.projectId && !allowedProjectIds.has(scope.projectId)) throw forbidden('PERFORMANCE_SCOPE_FORBIDDEN', 'You do not manage this project.');
    }
    const metrics = await this.computeForIntern(targetUserId, { ...scope, allowedProjectIds });
    return {
      userId: targetUserId,
      period: {
        from: scope.from ?? null,
        to: scope.to ?? null,
        boundary: '[from, to) — task.createdAt defines period membership (documented)',
      },
      metrics,
    };
  }

  /** Current intern's own metrics — identity from the principal only. */
  async ownMetrics(userId: string, q: PerformanceQuery) {
    const scope = this.parseScope(q);
    const metrics = await this.computeForIntern(userId, scope);
    return {
      userId,
      period: {
        from: scope.from ?? null,
        to: scope.to ?? null,
        boundary: '[from, to) — task.createdAt defines period membership (documented)',
      },
      metrics,
    };
  }

  // ─────────────────────────── internals ───────────────────────────────

  private parseScope(q: PerformanceQuery): { from: Date | null; to: Date | null; now: Date; sessionId?: string; projectId?: string } {
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    if (from && Number.isNaN(from.getTime())) throw notFound('PERFORMANCE_SCOPE_INVALID', 'from is not a valid date.');
    if (to && Number.isNaN(to.getTime())) throw notFound('PERFORMANCE_SCOPE_INVALID', 'to is not a valid date.');
    if (from && to && from.getTime() >= to.getTime()) {
      throw notFound('PERFORMANCE_SCOPE_INVALID', 'from must be before to.');
    }
    return { from, to, now: new Date(), sessionId: q.sessionId, projectId: q.projectId };
  }

  private assignmentOverlaps(a: Assignment, scope: { from: Date | null; to: Date | null }): boolean {
    const start = a.assignedAt.getTime();
    const end = a.completedAt ? a.completedAt.getTime() : Number.POSITIVE_INFINITY;
    if (scope.to && start >= scope.to.getTime()) return false;
    if (scope.from && end <= scope.from.getTime()) return false;
    return true;
  }

  /** Teacher ownership: session instructor OR project mentor (spec 61). */
  private async filterAssignmentsByOwnership(assignments: Assignment[], actorId: string): Promise<Assignment[]> {
    if (assignments.length === 0) return [];
    const sessionIds = [...new Set(assignments.map((a) => a.sessionId))];
    const projectIds = [...new Set(assignments.map((a) => a.projectId))];
    const instructed = await this.sessionInstructors.find({
      where: sessionIds.map((sessionId) => ({ sessionId, instructorId: actorId })),
    });
    const instructedSessions = new Set(instructed.map((i) => i.sessionId));
    const projects = await this.projects.find({ where: projectIds.map((id) => ({ id })) });
    const mentoredProjects = new Set(projects.filter((p) => p.mentorId === actorId).map((p) => p.id));
    return assignments.filter((a) => instructedSessions.has(a.sessionId) || mentoredProjects.has(a.projectId));
  }

  /** Fetch raw facts and run the PURE deterministic calculator. */
  private async computeForIntern(internId: string, scope: { from: Date | null; to: Date | null; now: Date; sessionId?: string; projectId?: string; allowedProjectIds?: Set<string> }): Promise<PerformanceMetrics> {
    // Projects of this intern's assignments (scope-filtered): the
    // assignment row carries BOTH sessionId and projectId, so scoping is
    // applied directly on the assignment rows (no project.sessionId join
    // ambiguity — projects may pre-date sessions).
    let assignmentRows = await this.assignments.find({
      where: { internId, status: In(['active', 'completed']) },
    });
    if (scope.projectId) assignmentRows = assignmentRows.filter((a) => a.projectId === scope.projectId);
    if (scope.allowedProjectIds) assignmentRows = assignmentRows.filter(a => scope.allowedProjectIds!.has(a.projectId));
    if (scope.sessionId) assignmentRows = assignmentRows.filter((a) => a.sessionId === scope.sessionId);
    const scopedProjectIds = new Set(assignmentRows.map((a) => a.projectId));
    const scopedSessionIds = new Set(assignmentRows.map((a) => a.sessionId));

    // Tasks: assignee = intern, not soft-deleted, project in scope,
    // createdAt ∈ [from, to) (period membership — documented).
    const taskRows = await this.tasks.find({ where: { assigneeId: internId } });
    const filteredTasks = taskRows.filter((t) => {
      if (t.deletedAt !== null) return false;
      if (!scopedProjectIds.has(t.projectId)) return false;
      if (scope.from && t.createdAt.getTime() < scope.from.getTime()) return false;
      if (scope.to && t.createdAt.getTime() >= scope.to.getTime()) return false;
      return true;
    });

    // First 'done' transition per task from the append-only history.
    const taskIds = filteredTasks.map((t) => t.id);
    const doneAtByTask = new Map<string, Date>();
    if (taskIds.length > 0) {
      const historyRows = await this.histories
        .createQueryBuilder('h')
        .where('h.taskId IN (:...taskIds)', { taskIds })
        .andWhere('h.toStatus = :done', { done: 'done' })
        .orderBy('h.createdAt', 'ASC')
        .getMany();
      for (const h of historyRows) {
        if (!doneAtByTask.has(h.taskId)) doneAtByTask.set(h.taskId, h.createdAt);
      }
    }
    const taskFacts: PerfTaskFact[] = filteredTasks.map((t) => ({
      id: t.id,
      status: t.status,
      storyPoints: t.storyPoints,
      dueDate: t.dueDate,
      createdAt: t.createdAt,
      doneAt: doneAtByTask.get(t.id) ?? null,
      sprintId: t.sprintId,
    }));

    // Finalized evaluations for the intern; when the scope is session/
    // project-bound, only cycles with the same context count.
    const evaluationRows = await this.evaluations.find({
      where: { internId, status: 'finalized' },
    });
    const evaluationFacts: PerfEvaluationFact[] = evaluationRows
      .filter((e) => {
        if (scope.allowedProjectIds && e.projectId && !scope.allowedProjectIds.has(e.projectId)) return false;
        if (scope.allowedProjectIds && !e.projectId && e.sessionId && !scopedSessionIds.has(e.sessionId)) return false;
        if (scope.sessionId && e.sessionId !== scope.sessionId) return false;
        if (scope.projectId && e.projectId !== scope.projectId) return false;
        return true;
      })
      .map((e) => ({ overallScore: Number(e.overallScore ?? 0), finalizedAt: e.finalizedAt ?? e.updatedAt }));

    // Active sprints in the scoped projects (for activeSprintProgress).
    const sprintRows = scopedProjectIds.size
      ? await this.sprints.find({ where: [...scopedProjectIds].map((projectId) => ({ projectId })) })
      : [];
    const sprintFacts = sprintRows.map((s) => ({
      id: s.id,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
    }));

    return calculatePerformanceMetrics(taskFacts, evaluationFacts, sprintFacts, {
      from: scope.from,
      to: scope.to,
      now: scope.now,
    });
  }
}
