import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionMember } from '../sessions/entities/session-member.entity';
import { User } from '../users/entities/user.entity';
import { PermissionsService } from '../rbac/permissions.service';
import { AssignmentsService } from './assignments.service';
import { Assignment } from './entities/assignment.entity';

/**
 * Assignment lifecycle unit tests (spec 42): capacity validation, conflict,
 * transaction rollback ordering, concurrency mapping (unique 2601 / deadlock
 * 1205 → 409), workspace unassigned/active — all without a live SQL Server.
 *
 * Lock semantics (UPDLOCK/HOLDLOCK + filtered unique index) are integration
 * concerns covered by the SQL Server e2e suite (honest BLOCKED without it).
 */

type AnyMock = jest.Mock;
interface AnyRepo {
  [key: string]: AnyMock;
}

const CREATED_ROW: Assignment = {
  id: 'a-1',
  internId: 'intern-1',
  projectId: 'p-1',
  sessionId: 's-1',
  status: 'active',
  assignedById: 'instructor-1',
  assignedAt: new Date('2026-01-01T00:00:00Z'),
  completedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function lockQb(result: unknown): { setLock: AnyMock; where: AnyMock; getOne: AnyMock } {
  const qb = {
    setLock: jest.fn(),
    where: jest.fn(),
    getOne: jest.fn<Promise<unknown>, []>(async () => result),
  };
  qb.setLock.mockReturnThis();
  qb.where.mockReturnThis();
  return qb;
}

interface Harness {
  service: AssignmentsService;
  transaction: jest.Mock;
  em: {
    getRepository: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    insert: jest.Mock;
    delete: jest.Mock;
    query: jest.Mock;
  };
  repos: Record<string, AnyRepo>;
  expectInsertWith: (entity: unknown, matcher: Record<string, unknown>) => void;
  expectNoInsertOf: (entity: unknown) => void;
}

function buildHarness(opts?: {
  intern?: User | null;
  session?: InternshipSession | null;
  project?: Project | null;
  existingActive?: Assignment | null;
  activeCount?: number;
  sessionMemberExists?: boolean;
  projectMemberExists?: boolean;
  saveErr?: unknown;
  prefEnabled?: boolean | null;
}): Harness {
  const assignmentRepo: AnyRepo = {
    // Outer repo: getOneDetailed (by id) + workspace (by intern+status).
    findOne: jest.fn(async (args?: { where?: Record<string, unknown> }) => {
      if (args?.where && 'id' in args.where) return CREATED_ROW;
      if (args?.where && 'internId' in args.where) return opts?.existingActive ?? null;
      return opts?.existingActive ?? null;
    }),
  };
  const userRepo: AnyRepo = {
    findOne: jest.fn(async () => ({ id: 'intern-1', displayName: 'Nguyễn Thực Tập', email: 'intern@x.vn' })),
    createQueryBuilder: jest.fn(() => lockQb(opts?.intern ?? null)),
  };
  const projectRepo: AnyRepo = {
    findOne: jest.fn(async () => ({ id: 'p-1', code: 'PRJ-1', name: 'Đồ án 1', status: 'active' })),
    createQueryBuilder: jest.fn(() => lockQb(opts?.project ?? null)),
  };
  const sessionRepo: AnyRepo = {
    findOne: jest.fn(async () => opts?.session ?? null),
  };
  const assignmentTxRepo: AnyRepo = {
    count: jest.fn(async () => opts?.activeCount ?? 0),
    findOne: jest.fn(async () => opts?.existingActive ?? null),
    createQueryBuilder: jest.fn(() => lockQb({ ...CREATED_ROW, status: 'active' })),
  };
  const sessionMemberRepo: AnyRepo = {
    findOne: jest.fn(
      async () =>
        (opts?.sessionMemberExists ? { sessionId: 's-1', userId: 'intern-1' } : null) as SessionMember | null,
    ),
  };
  const projectMemberRepo: AnyRepo = {
    findOne: jest.fn(
      async () =>
        (opts?.projectMemberExists ? { projectId: 'p-1', userId: 'intern-1' } : null) as ProjectMember | null,
    ),
  };
  const prefRepo: AnyRepo = {
    findOne: jest.fn(async () =>
      opts?.prefEnabled === undefined ? null : { userId: 'intern-1', category: 'session', enabled: opts.prefEnabled },
    ),
  };

  const repos: Record<string, AnyRepo> = {
    Assignment: assignmentRepo,
    User: userRepo,
    Project: projectRepo,
    InternshipSession: sessionRepo,
    AssignmentTx: assignmentTxRepo,
    SessionMember: sessionMemberRepo,
    ProjectMember: projectMemberRepo,
    NotificationPreference: prefRepo,
    RecruitmentProfile: {
      // Phase 4 precondition (spec 49): the harness default is a PASSED
      // profile so the classic 12-step lifecycle tests still exercise
      // assignment logic; dedicated tests override to not_started/failed.
      findOne: jest.fn(async () => ({ userId: 'intern-1', status: 'passed', selectedRole: 'frontend' })),
    },
  };

  const em = {
    getRepository: jest.fn((entity: unknown): AnyRepo => {
      const name = (entity as { name?: string }).name ?? '';
      if (name === 'Assignment') return assignmentTxRepo;
      const repo = repos[name];
      if (!repo) throw new Error(`unexpected repository requested: ${name || 'unknown'}`);
      return repo;
    }),
    save: jest.fn(async (x: Assignment) => {
      if (opts?.saveErr) throw opts.saveErr;
      return x;
    }),
    create: jest.fn((x: unknown) => x),
    insert: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({ affected: 1 })),
    query: jest.fn(async () => []),
  };

  const transaction = jest.fn(async (cb: (em2: typeof em) => Promise<unknown>) => cb(em));
  const ds = { transaction } as unknown as DataSource;
  const permissions = { hasRole: jest.fn(async () => true) } as unknown as PermissionsService;

  const service = new AssignmentsService(
    assignmentRepo as unknown as Repository<Assignment>,
    userRepo as unknown as Repository<User>,
    projectRepo as unknown as Repository<Project>,
    sessionRepo as unknown as Repository<InternshipSession>,
    ds,
    permissions,
  );

  return {
    service,
    transaction,
    em,
    repos,
    expectInsertWith(entity: unknown, matcher: Record<string, unknown>) {
      expect(em.insert).toHaveBeenCalledWith(entity, expect.objectContaining(matcher));
    },
    expectNoInsertOf(entity: unknown) {
      expect(em.insert).not.toHaveBeenCalledWith(entity, expect.anything());
    },
  };
}

const ACTIVE_USER = { id: 'intern-1', status: 'active' } as unknown as User;
const ACTIVE_SESSION = {
  id: 's-1',
  code: 'S-2026',
  name: 'Phiên 2026',
  status: 'active',
} as unknown as InternshipSession;
const ACTIVE_PROJECT = {
  id: 'p-1',
  code: 'PRJ-1',
  name: 'Đồ án 1',
  status: 'active',
  capacity: null,
} as unknown as Project;

const CTX = { actorId: 'instructor-1', ip: '127.0.0.1', userAgent: 'jest' };
const INPUT = { internId: 'intern-1', projectId: 'p-1', sessionId: 's-1' };

it('rejects a role that differs from the passed recruitment role before writes', async () => {
  const h = buildHarness({ intern: ACTIVE_USER, session: ACTIVE_SESSION, project: ACTIVE_PROJECT });
  await expect(h.service.create({ ...INPUT, role: 'backend' }, CTX)).rejects.toMatchObject({ response: { code: 'INTERVIEW_ROLE_MISMATCH' } });
  expect(h.em.save).not.toHaveBeenCalled();
});

const conflictOf = (p: Promise<unknown>, code: string) =>
  expect(p).rejects.toMatchObject({ response: { statusCode: 409, code } });
const notFoundOf = (p: Promise<unknown>, code: string) =>
  expect(p).rejects.toMatchObject({ response: { statusCode: 404, code } });

describe('AssignmentsService.create — transactional lifecycle (spec 20)', () => {
  it('runs all 12 steps in ONE transaction: row, memberships, notification, audit, activity', async () => {
    const h = buildHarness({ intern: ACTIVE_USER, session: ACTIVE_SESSION, project: ACTIVE_PROJECT });
    const res = await h.service.create(INPUT, CTX);

    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.em.save).toHaveBeenCalledTimes(1);
    h.expectInsertWith(SessionMember, { sessionId: 's-1', userId: 'intern-1' });
    h.expectInsertWith(ProjectMember, { projectId: 'p-1', userId: 'intern-1', roleInProject: 'intern' });
    h.expectInsertWith(Notification, { userId: 'intern-1', type: 'assignment' });
    h.expectInsertWith(AuditLog, { action: 'assignment.created' });
    h.expectInsertWith(ActivityEvent, { action: 'intern.assigned' });
    expect(res.status).toBe('active');
    expect(res.project?.code).toBe('PRJ-1');
    expect(res.session?.code).toBe('S-2026');
  });

  it('409 ASSIGNMENT_CONFLICT when intern already has an active assignment (pre-check)', async () => {
    const h = buildHarness({
      intern: ACTIVE_USER,
      session: ACTIVE_SESSION,
      project: ACTIVE_PROJECT,
      existingActive: { ...CREATED_ROW, id: 'a-0' },
    });
    await conflictOf(h.service.create(INPUT, CTX), 'ASSIGNMENT_CONFLICT');
    expect(h.em.save).not.toHaveBeenCalled();
    h.expectNoInsertOf(Notification);
  });

  it('409 ASSIGNMENT_CONFLICT when the DB unique index rejects a raced insert (2601)', async () => {
    const dup = new QueryFailedError('duplicate key', [], Object.assign(new Error('duplicate key'), { number: 2601 }));
    const h = buildHarness({
      intern: ACTIVE_USER,
      session: ACTIVE_SESSION,
      project: ACTIVE_PROJECT,
      saveErr: dup,
    });
    await conflictOf(h.service.create(INPUT, CTX), 'ASSIGNMENT_CONFLICT');
  });

  it('409 ASSIGNMENT_CONFLICT when SQL Server reports deadlock (1205) — never a generic 500', async () => {
    const deadlock = new QueryFailedError('deadlock victim', [], Object.assign(new Error('deadlock'), { number: 1205 }));
    const h = buildHarness({
      intern: ACTIVE_USER,
      session: ACTIVE_SESSION,
      project: ACTIVE_PROJECT,
      saveErr: deadlock,
    });
    await conflictOf(h.service.create(INPUT, CTX), 'ASSIGNMENT_CONFLICT');
  });

  it('409 PROJECT_CAPACITY_FULL when capacity reached; capacity NULL = unlimited (spec 22)', async () => {
    const full = buildHarness({
      intern: ACTIVE_USER,
      session: ACTIVE_SESSION,
      project: { ...ACTIVE_PROJECT, capacity: 2 } as unknown as Project,
      activeCount: 2,
    });
    await conflictOf(full.service.create(INPUT, CTX), 'PROJECT_CAPACITY_FULL');

    const unlimited = buildHarness({
      intern: ACTIVE_USER,
      session: ACTIVE_SESSION,
      project: { ...ACTIVE_PROJECT, capacity: null } as unknown as Project,
      activeCount: 9999,
    });
    await expect(unlimited.service.create(INPUT, CTX)).resolves.toMatchObject({ status: 'active' });
  });

  it('409 SESSION_NOT_ASSIGNABLE for ending/completed/cancelled sessions (spec 6 boundary)', async () => {
    for (const status of ['ending', 'completed', 'cancelled'] as const) {
      const h = buildHarness({
        intern: ACTIVE_USER,
        session: { ...ACTIVE_SESSION, status } as unknown as InternshipSession,
        project: ACTIVE_PROJECT,
      });
      await conflictOf(h.service.create(INPUT, CTX), 'SESSION_NOT_ASSIGNABLE');
    }
  });

  it('409 PROJECT_NOT_ASSIGNABLE for draft/archived projects (only active accepts interns)', async () => {
    for (const status of ['draft', 'archived'] as const) {
      const h = buildHarness({
        intern: ACTIVE_USER,
        session: ACTIVE_SESSION,
        project: { ...ACTIVE_PROJECT, status } as unknown as Project,
      });
      await conflictOf(h.service.create(INPUT, CTX), 'PROJECT_NOT_ASSIGNABLE');
    }
  });

  it('404 INTERN_NOT_FOUND when intern missing or inactive', async () => {
    const h = buildHarness({ intern: null, session: ACTIVE_SESSION, project: ACTIVE_PROJECT });
    await notFoundOf(h.service.create(INPUT, CTX), 'INTERN_NOT_FOUND');
  });

  it('rollback ordering: failure in a later step propagates and NO side-effect rows are written', async () => {
    const h = buildHarness({ intern: ACTIVE_USER, session: ACTIVE_SESSION, project: ACTIVE_PROJECT });
    h.em.insert.mockImplementation(async (entity: unknown) => {
      if (entity === SessionMember) throw new Error('forced membership write failure');
      return {};
    });
    await expect(h.service.create(INPUT, CTX)).rejects.toThrow('forced membership write failure');
    expect(h.em.save).toHaveBeenCalledTimes(1); // attempted inside tx
    h.expectNoInsertOf(Notification); // (10) skipped
    h.expectNoInsertOf(AuditLog); // (11) skipped
    h.expectNoInsertOf(ActivityEvent); // (12) skipped
  });

  it('idempotent membership: existing session/project member rows are not duplicated', async () => {
    const h = buildHarness({
      intern: ACTIVE_USER,
      session: ACTIVE_SESSION,
      project: ACTIVE_PROJECT,
      sessionMemberExists: true,
      projectMemberExists: true,
    });
    await h.service.create(INPUT, CTX);
    h.expectNoInsertOf(SessionMember);
    h.expectNoInsertOf(ProjectMember);
  });

  it('respects notification preferences: disabled category → no notification row (audit/activity unaffected)', async () => {
    const h = buildHarness({
      intern: ACTIVE_USER,
      session: ACTIVE_SESSION,
      project: ACTIVE_PROJECT,
      prefEnabled: false,
    });
    await h.service.create(INPUT, CTX);
    h.expectNoInsertOf(Notification);
    h.expectInsertWith(AuditLog, { action: 'assignment.created' });
    h.expectInsertWith(ActivityEvent, { action: 'intern.assigned' });
  });
});

describe('AssignmentsService.complete (spec 23)', () => {
  it('completes an active assignment: status+completedAt, audit, intern notification, activity', async () => {
    const h = buildHarness({ intern: ACTIVE_USER, session: ACTIVE_SESSION, project: ACTIVE_PROJECT });
    // getOneDetailed (outer repo, by id) reflects the persisted completed row.
    h.repos.Assignment.findOne.mockResolvedValue({ ...CREATED_ROW, status: 'completed', completedAt: new Date() });
    const res = await h.service.complete('a-1', CTX);
    expect(res.status).toBe('completed');
    h.expectInsertWith(AuditLog, { action: 'assignment.completed' });
    h.expectInsertWith(Notification, { userId: 'intern-1', type: 'assignment' });
    h.expectInsertWith(ActivityEvent, { action: 'assignment.completed' });
  });

  it('409 INVALID_ASSIGNMENT_TRANSITION when assignment is not active (history preserved)', async () => {
    const h = buildHarness({ session: ACTIVE_SESSION });
    h.repos.AssignmentTx.createQueryBuilder.mockImplementation(() => lockQb({ ...CREATED_ROW, status: 'completed' }));
    await conflictOf(h.service.complete('a-1', CTX), 'INVALID_ASSIGNMENT_TRANSITION');
  });

  it('404 ASSIGNMENT_NOT_FOUND for unknown id', async () => {
    const h = buildHarness({ session: ACTIVE_SESSION });
    h.repos.Assignment.findOne.mockResolvedValue(null);
    h.repos.AssignmentTx.createQueryBuilder.mockImplementation(() => lockQb(null));
    await notFoundOf(h.service.complete('missing', CTX), 'ASSIGNMENT_NOT_FOUND');
  });
});

describe('AssignmentsService.workspace (spec 28/29 — DB is the source of truth)', () => {
  it('unassigned when no active assignment exists', async () => {
    const h = buildHarness();
    const res = await h.service.workspace('intern-1');
    expect(res).toEqual({ status: 'unassigned', assignment: null });
  });

  it('active with project/session summaries when an active assignment exists', async () => {
    const h = buildHarness({ existingActive: CREATED_ROW, session: ACTIVE_SESSION, project: ACTIVE_PROJECT });
    const res = await h.service.workspace('intern-1');
    expect(res.status).toBe('active');
    expect(res.assignment?.id).toBe('a-1');
    expect(res.assignment?.project.code).toBe('PRJ-1');
    expect(res.assignment?.session.code).toBe('S-2026');
    expect(res.assignment).not.toHaveProperty('sprint');
    expect(res.assignment).not.toHaveProperty('tasks');
  });
});

 describe('AssignmentsService.cancel — template lifecycle', () => {
  it('rejects removing a member from a template session after Start without writes', async () => {
    const h = buildHarness({ session: ACTIVE_SESSION });
    h.em.query.mockResolvedValue([{ id: 'template-run' }]);
    await expect(h.service.cancel('a-1', CTX)).rejects.toMatchObject({ response: { code: 'SESSION_NOT_SETUP' } });
    expect(h.em.save).not.toHaveBeenCalled();
    expect(h.em.delete).not.toHaveBeenCalled();
    expect(h.repos.InternshipSession.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });
  it('preserves legacy active-session cancellation when no pinned template exists', async () => {
    const h = buildHarness({ session: ACTIVE_SESSION });
    await h.service.cancel('a-1', CTX);
    expect(h.em.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    expect(h.em.delete).toHaveBeenCalledWith(SessionMember, { sessionId: 's-1', userId: 'intern-1' });
  });
 });
