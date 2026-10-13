import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { isDeadlockViolation, isUniqueViolation } from '../common/utils/db-errors';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionMember } from '../sessions/entities/session-member.entity';
import { OWNER_PARAM, assignmentScope, resolveOwnership, type Ownership } from '../rbac/ownership';
import { PermissionsService } from '../rbac/permissions.service';
import { isSessionAssignable } from '../sessions/session-status.machine';
import { User } from '../users/entities/user.entity';
import { ActorContext } from '../users/users.service';
import { Assignment } from './entities/assignment.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectRoleSlot } from '../projects/entities/project-role-slot.entity';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';

/**
 * Assignment contract (spec 18–23, 39–40):
 * - ONE transaction covers intern lock/check, session/project validation,
 *   capacity, conflict check, assignment row, membership ensure,
 *   notification, audit, activity. Any failure rolls back ALL writes.
 * - Concurrency: pessimistic_write row locks (intern + project) inside a
 *   TypeORM transaction on SQL Server + the DB-level FILTERED unique index
 *   UX_assignments_intern_active. A losing concurrent writer receives
 *   409 ASSIGNMENT_CONFLICT — never a duplicate row, never a generic 500.
 * - Capacity (spec 22): capacity NULL = unlimited (documented decision);
 *   otherwise active assignments must stay < capacity, checked under the
 *   project row lock so concurrent assignments cannot exceed it.
 */
export interface AssignmentSummary {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface AssignmentResponse {
  id: string;
  internId: string;
  projectId: string;
  sessionId: string;
  status: string;
  assignedById: string | null;
  assignedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  intern?: { id: string; displayName: string; email: string };
  project?: AssignmentSummary;
  session?: AssignmentSummary;
}

export interface InternWorkspaceResponse {
  status: 'unassigned' | 'active';
  assignment: {
    id: string;
    assignedAt: Date;
    project: AssignmentSummary;
    session: AssignmentSummary;
  } | null;
}

function toAssignmentResponse(
  a: Assignment,
  extras?: { intern?: AssignmentResponse['intern']; project?: AssignmentSummary; session?: AssignmentSummary },
): AssignmentResponse {
  return {
    id: a.id,
    internId: a.internId,
    projectId: a.projectId,
    sessionId: a.sessionId,
    status: a.status,
    assignedById: a.assignedById ?? null,
    assignedAt: a.assignedAt,
    completedAt: a.completedAt ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    ...(extras ?? {}),
  };
}

const conflict = (message: string, details?: unknown) =>
  new ConflictException({ statusCode: 409, code: 'ASSIGNMENT_CONFLICT', message, ...(details ? { details } : {}) });

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(InternshipSession) private readonly sessions: Repository<InternshipSession>,
    private readonly dataSource: DataSource,
    private readonly permissions: PermissionsService,
  ) {}

  private async ownership(actorId?: string | null): Promise<Ownership | undefined> {
    if (!actorId) return undefined;
    return resolveOwnership(this.permissions, actorId);
  }

  private async assertSessionManaged(sessionId: string, o?: Ownership): Promise<void> {
    if (!o || o.isAdmin) return;
    const rows = await this.dataSource.query(
      'SELECT 1 AS ok FROM internship_sessions s WHERE s.id = @0 AND (s.leadInstructorId = @1 OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.sessionId = s.id AND si.instructorId = @1))',
      [sessionId, o.userId],
    );
    if (rows.length === 0) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ASSIGNMENT_SCOPE_FORBIDDEN',
        message: 'You do not manage this internship session.',
      });
    }
  }

  private async assertSessionManagedTx(em: EntityManager, sessionId: string, o?: Ownership): Promise<void> {
    if (!o || o.isAdmin) return;
    const rows = await em.query(
      'SELECT 1 AS ok FROM internship_sessions s WHERE s.id = @0 AND (s.leadInstructorId = @1 OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.sessionId = s.id AND si.instructorId = @1))',
      [sessionId, o.userId],
    );
    if (rows.length === 0) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ASSIGNMENT_SCOPE_FORBIDDEN',
        message: 'You do not manage this internship session.',
      });
    }
  }

  async list(q: {
    page: number;
    pageSize: number;
    internId?: string;
    sessionId?: string;
    projectId?: string;
    status?: string;
  }, o?: Ownership) {
    const qb = this.assignments.createQueryBuilder('a');
    if (o && !o.isAdmin) {
      const scope = assignmentScope('a', o);
      if (scope) qb.andWhere(scope.clause, { [OWNER_PARAM]: o.userId });
    }
    if (q.internId) qb.andWhere('a.internId = :internId', { internId: q.internId });
    if (q.sessionId) qb.andWhere('a.sessionId = :sessionId', { sessionId: q.sessionId });
    if (q.projectId) qb.andWhere('a.projectId = :projectId', { projectId: q.projectId });
    if (q.status) qb.andWhere('a.status = :status', { status: q.status });
    qb.orderBy('a.assignedAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((a) => toAssignmentResponse(a)), total };
  }

  async getOneDetailed(id: string, o?: Ownership): Promise<AssignmentResponse> {
    const assignment = await this.assignments.findOne({ where: { id } });
    if (!assignment) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'Assignment not found.',
      });
    }
    if (o && !o.isAdmin && assignment.internId !== o.userId) {
      await this.assertSessionManaged(assignment.sessionId, o);
    }
    const [intern, project, session] = await Promise.all([
      this.users.findOne({ where: { id: assignment.internId } }),
      this.projects.findOne({ where: { id: assignment.projectId } }),
      this.sessions.findOne({ where: { id: assignment.sessionId } }),
    ]);
    return toAssignmentResponse(assignment, {
      intern: intern ? { id: intern.id, displayName: intern.displayName, email: intern.email } : undefined,
      project: project
        ? { id: project.id, code: project.code, name: project.name, status: project.status }
        : undefined,
      session: session
        ? { id: session.id, code: session.code, name: session.name, status: session.status }
        : undefined,
    });
  }

  /**
   * Transactional assignment creation (spec 20 — steps 1..12 in ONE tx).
   * All writes go through the transactional EntityManager — never mixed
   * with repositories bound to the outer connection (spec 39).
   */
  async create(
    input: { internId: string; projectId: string; sessionId: string; role?: string },
    ctx: ActorContext,
  ): Promise<AssignmentResponse> {
    const created = await this.dataSource.transaction(async (em) => {
      // (3) Validate target session and its assignability.
      const session = await em.getRepository(InternshipSession).findOne({ where: { id: input.sessionId }, lock: { mode: 'pessimistic_write' } });
      if (!session) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'SESSION_NOT_FOUND',
          message: 'Internship session not found.',
        });
      }
      if (!isSessionAssignable(session.status)) {
        throw new ConflictException({
          statusCode: 409,
          code: 'SESSION_NOT_ASSIGNABLE',
          message: `Session status '${session.status}' does not accept new assignments.`,
          details: { status: session.status },
        });
      }
      await this.assertSessionManagedTx(em, input.sessionId, await this.ownership(ctx.actorId));

      // (1+2) Lock + validate the intern row — serializes concurrent
      // assignments targeting the same intern.
      const intern = await em
        .getRepository(User)
        .createQueryBuilder('u')
        .setLock('pessimistic_write')
        .where('u.id = :id AND u.status = :status', { id: input.internId, status: 'active' })
        .getOne();
      if (!intern) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'INTERN_NOT_FOUND',
          message: 'Intern not found or account is not active.',
          details: { internId: input.internId },
        });
      }

      // (2b) RECRUITMENT PRECONDITION (Phase 4, spec 49): an intern MUST
      // have a PASSED recruitment profile before any new assignment. This
      // closes the product lifecycle: recruitment → waiting → active.
      const recruitmentProfile = await em
        .getRepository(RecruitmentProfile)
        .findOne({ where: { userId: intern.id } });
      if (!recruitmentProfile || recruitmentProfile.status !== 'passed') {
        throw new ConflictException({
          statusCode: 409,
          code: 'INTERN_NOT_RECRUITED',
          message: 'Intern has not passed recruitment — assignment is not allowed.',
          details: {
            recruitmentStatus: recruitmentProfile?.status ?? 'not_started',
          },
        });
      }

      const role = input.role?.trim() || undefined;
      if (role && role !== 'intern' && recruitmentProfile.selectedRole !== role) {
        throw new ConflictException({ statusCode: 409, code: 'INTERVIEW_ROLE_MISMATCH', message: 'Assigned role must match the passed recruitment role.' });
      }

      // (4+5) Lock + validate the project row and capacity — serializes
      // concurrent assignments targeting the same project.
      const project = await em
        .getRepository(Project)
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: input.projectId })
        .getOne();
      if (!project) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found.',
        });
      }
      if (project.status !== 'active') {
        throw new ConflictException({
          statusCode: 409,
          code: 'PROJECT_NOT_ASSIGNABLE',
          message: `Project status '${project.status}' does not accept new assignments (only active).`,
          details: { status: project.status },
        });
      }
      const templateRuns: { projectId: string }[] = await em.query('SELECT TOP(1) projectId FROM template_runs WHERE sessionId=@0 ORDER BY createdAt DESC', [session.id]);
      if (templateRuns.length && templateRuns[0].projectId.toLowerCase() !== project.id.toLowerCase()) {
        throw new ConflictException({ statusCode: 409, code: 'SESSION_PROJECT_MISMATCH', message: 'Assignment project must match the pinned session project.' });
      }
      if (templateRuns.length && (!role || role === 'intern')) {
        throw new ConflictException({ statusCode: 409, code: 'SESSION_ROLE_REQUIRED', message: 'Select a required project role for this template session.' });
      }
      if (project.capacity !== null) {
        const activeCount = await em.getRepository(Assignment).count({
          where: { projectId: project.id, status: 'active' },
        });
        if (activeCount >= project.capacity) {
          throw new ConflictException({
            statusCode: 409,
            code: 'PROJECT_CAPACITY_FULL',
            message: 'Project capacity is full.',
            details: { capacity: project.capacity, activeAssignments: activeCount },
          });
        }
      }

      // (6) Conflict pre-check under the intern lock; the DB filtered unique
      // index remains the hard guarantee for bypassed/raced paths.
      const existingActive = await em.getRepository(Assignment).findOne({
        where: { internId: intern.id, status: 'active' },
      });
      if (existingActive) {
        throw conflict('Intern already has an active assignment.', { assignmentId: existingActive.id });
      }

      // (6b) Role slot cap (redesign §12/§15): only enforced when the caller
      // names a role AND the project defines that slot. Role-less assignment
      // stays open for backward compatibility.
      if (role) {
        const slot = await em.getRepository(ProjectRoleSlot).findOne({
          where: { projectId: project.id, roleCode: role },
        });
        if (templateRuns.length && !slot) throw new ConflictException({ statusCode: 409, code: 'SESSION_ROLE_INVALID', message: 'Role is not defined by this session project.' });
        if (slot) {
          const filled = await em.query(
            `SELECT COUNT(*) AS filled FROM project_members pm
             INNER JOIN assignments a ON a.projectId = pm.projectId AND a.internId = pm.userId AND a.status = 'active'
             WHERE pm.projectId = @0 AND pm.roleInProject = @1`,
            [project.id, role],
          ) as Array<{ filled: number }>;
          if (Number(filled[0]?.filled ?? 0) >= slot.requiredCount) {
            throw new ConflictException({
              statusCode: 409,
              code: 'ROLE_SLOT_FULL',
              message: `No open '${role}' slot left on this project (${slot.requiredCount} required).`,
              details: { roleCode: role, requiredCount: slot.requiredCount },
            });
          }
        }
      }

      // (7) Create the assignment (unique/deadlock → 409, not 500).
      let assignment: Assignment;
      try {
        assignment = await em.save(
          em.create(Assignment, {
            internId: intern.id,
            projectId: project.id,
            sessionId: session.id,
            status: 'active',
            assignedById: ctx.actorId ?? null,
            assignedAt: new Date(),
          }),
        );
      } catch (err) {
        if (isUniqueViolation(err) || isDeadlockViolation(err)) {
          throw conflict('Concurrent assignment conflict — intern already assigned.');
        }
        throw err;
      }

      // (8) Ensure session membership.
      const sessionMember = await em.getRepository(SessionMember).findOne({
        where: { sessionId: session.id, userId: intern.id },
      });
      if (!sessionMember) {
        await em.insert(SessionMember, { sessionId: session.id, userId: intern.id });
      }

      // (9) Ensure project membership, recording the assigned role.
      const projectMember = await em.getRepository(ProjectMember).findOne({
        where: { projectId: project.id, userId: intern.id },
      });
      if (!projectMember) {
        await em.insert(ProjectMember, {
          projectId: project.id,
          userId: intern.id,
          roleInProject: role ?? 'intern',
        });
      } else if (role && projectMember.roleInProject !== role) {
        await em.update(ProjectMember, { projectId: project.id, userId: intern.id }, { roleInProject: role });
      }

      // (10) Notification — preference-aware, written IN the transaction.
      await this.notifyInTransaction(em, {
        userId: intern.id,
        type: 'assignment',
        category: 'session',
        title: 'Bạn đã được phân công thực tập',
        body: `Bạn được giao vào đồ án "${project.name}" trong phiên "${session.name}".`,
        linkUrl: `/intern/assignments/${assignment.id}`,
      });

      // (11) Audit — IN the transaction (spec 20: rollback ALL on failure).
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'assignment.created',
        targetType: 'assignment',
        targetId: assignment.id,
        detail: JSON.stringify({
          internId: intern.id,
          projectId: project.id,
          sessionId: session.id,
        }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      // (12) Activity — IN the transaction.
      await em.insert(ActivityEvent, {
        actorId: ctx.actorId ?? null,
        module: 'assignments',
        action: 'intern.assigned',
        targetType: 'assignment',
        targetId: assignment.id,
        summary: `Phân công ${intern.displayName} vào đồ án ${project.code}`,
      });

      return assignment;
    });

    return this.getOneDetailed(created.id);
  }

  /**
   * Complete an active assignment (spec 23): only assignments.manage holders
   * reach this service method (guard enforced). History is never deleted.
   */
  async complete(id: string, ctx: ActorContext): Promise<AssignmentResponse> {
    // Session-first lock ordering matches Start and AI Confirm.
    const target = await this.assignments.findOne({ where: { id } });
    if (!target) throw new NotFoundException({ statusCode: 404, code: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment not found.' });
    const completed = await this.dataSource.transaction(async (em) => {
      const session = await em.getRepository(InternshipSession).findOne({ where: { id: target.sessionId }, lock: { mode: 'pessimistic_write' } });
      if (!session) throw new NotFoundException({ statusCode: 404, code: 'SESSION_NOT_FOUND', message: 'Session not found.' });
      const assignment = await em
        .getRepository(Assignment)
        .createQueryBuilder('a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id })
        .getOne();
      if (!assignment) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'ASSIGNMENT_NOT_FOUND',
          message: 'Assignment not found.',
        });
      }
      await this.assertSessionManagedTx(em, assignment.sessionId, await this.ownership(ctx.actorId));
      if (assignment.status !== 'active') {
        throw new ConflictException({
          statusCode: 409,
          code: 'INVALID_ASSIGNMENT_TRANSITION',
          message: `Assignment in status '${assignment.status}' cannot be completed.`,
          details: { status: assignment.status },
        });
      }
      assignment.status = 'completed';
      assignment.completedAt = new Date();
      await em.save(assignment);

      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'assignment.completed',
        targetType: 'assignment',
        targetId: assignment.id,
        detail: JSON.stringify({ completedAt: assignment.completedAt.toISOString() }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      await this.notifyInTransaction(em, {
        userId: assignment.internId,
        type: 'assignment',
        category: 'session',
        title: 'Phân công của bạn đã hoàn thành',
        body: 'Đồ án thực tập của bạn đã được đánh dấu hoàn thành.',
        linkUrl: `/intern/assignments/${assignment.id}`,
      });

      await em.insert(ActivityEvent, {
        actorId: ctx.actorId ?? null,
        module: 'assignments',
        action: 'assignment.completed',
        targetType: 'assignment',
        targetId: assignment.id,
        summary: 'Một phân công thực tập đã hoàn thành',
      });

      return assignment;
    });
    return this.getOneDetailed(completed.id);
  }

  /**
   * M4 cancel (setup flow): removes an intern from an upcoming session.
   * Only active assignments; scope-checked like complete. The session_members
   * row is removed so the roster reflects reality; project_members stays as
   * history. Cancelled assignments free availability (same as never assigned).
   */
  async cancel(id: string, ctx: ActorContext): Promise<AssignmentResponse> {
    // Session-first lock ordering matches Start and AI Confirm.
    const target = await this.assignments.findOne({ where: { id } });
    if (!target) throw new NotFoundException({ statusCode: 404, code: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment not found.' });
    const cancelled = await this.dataSource.transaction(async (em) => {
      const session = await em.getRepository(InternshipSession).findOne({ where: { id: target.sessionId }, lock: { mode: 'pessimistic_write' } });
      if (!session) throw new NotFoundException({ statusCode: 404, code: 'SESSION_NOT_FOUND', message: 'Session not found.' });
      const assignment = await em
        .getRepository(Assignment)
        .createQueryBuilder('a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id })
        .getOne();
      if (!assignment) {
        throw new NotFoundException({
          statusCode: 404,
          code: 'ASSIGNMENT_NOT_FOUND',
          message: 'Assignment not found.',
        });
      }
      await this.assertSessionManagedTx(em, assignment.sessionId, await this.ownership(ctx.actorId));
      if (assignment.status !== 'active') {
        throw new ConflictException({
          statusCode: 409,
          code: 'INVALID_ASSIGNMENT_TRANSITION',
          message: `Assignment in status '${assignment.status}' cannot be cancelled.`,
          details: { status: assignment.status },
        });
      }
      const runs = await em.query('SELECT TOP(1) id FROM template_runs WHERE sessionId=@0', [session.id]);
      if (runs.length && session.status !== 'upcoming') {
        throw new ConflictException({ statusCode: 409, code: 'SESSION_NOT_SETUP', message: 'Template session members can only be removed before Start.' });
      }
      assignment.status = 'cancelled';
      await em.save(assignment);
      await em.delete(SessionMember, { sessionId: assignment.sessionId, userId: assignment.internId });

      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'assignment.cancelled',
        targetType: 'assignment',
        targetId: assignment.id,
        detail: JSON.stringify({ sessionId: assignment.sessionId, projectId: assignment.projectId }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });

      await this.notifyInTransaction(em, {
        userId: assignment.internId,
        type: 'assignment',
        category: 'session',
        title: 'Phân công của bạn đã bị hủy',
        body: 'Bạn đã được gỡ khỏi phiên thực tập.',
        linkUrl: `/intern/assignments/${assignment.id}`,
      });

      await em.insert(ActivityEvent, {
        actorId: ctx.actorId ?? null,
        module: 'assignments',
        action: 'assignment.cancelled',
        targetType: 'assignment',
        targetId: assignment.id,
        summary: 'Một phân công thực tập đã bị hủy',
      });

      return assignment;
    });
    return this.getOneDetailed(cancelled.id);
  }

  /**
   * Intern workspace (spec 28/29) — identity is ALWAYS the authenticated
   * principal; status is ALWAYS database assignment state.
   */
  async workspace(userId: string): Promise<InternWorkspaceResponse> {
    const active = await this.assignments.findOne({
      where: { internId: userId, status: 'active' },
      order: { assignedAt: 'DESC' },
    });
    if (!active) {
      return { status: 'unassigned', assignment: null };
    }
    const [project, session] = await Promise.all([
      this.projects.findOne({ where: { id: active.projectId } }),
      this.sessions.findOne({ where: { id: active.sessionId } }),
    ]);
    return {
      status: 'active',
      assignment: {
        id: active.id,
        assignedAt: active.assignedAt,
        project: project
          ? { id: project.id, code: project.code, name: project.name, status: project.status }
          : { id: active.projectId, code: 'UNKNOWN', name: 'Unknown project', status: 'unknown' },
        session: session
          ? { id: session.id, code: session.code, name: session.name, status: session.status }
          : { id: active.sessionId, code: 'UNKNOWN', name: 'Unknown session', status: 'unknown' },
      },
    };
  }

  /** Active assignment row for a user, if any (Phase 4 lifecycle/§48). */
  async findActiveAssignment(userId: string): Promise<Assignment | null> {
    return this.assignments.findOne({
      where: { internId: userId, status: 'active' },
      order: { assignedAt: 'DESC' },
    });
  }

  /**
   * Preference-aware notification written through the transactional EM
   * (missing preference row = enabled; mirrors NotificationsService rules).
   */
  private async notifyInTransaction(
    em: EntityManager,
    payload: { userId: string; type: string; category: string; title: string; body: string; linkUrl: string },
  ): Promise<void> {
    const pref = await em.getRepository(NotificationPreference).findOne({
      where: { userId: payload.userId, category: payload.category },
    });
    if (pref && !pref.enabled) return;
    await em.insert(Notification, {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      linkUrl: payload.linkUrl,
    });
  }
}
