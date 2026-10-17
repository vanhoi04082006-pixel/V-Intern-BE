import { QueryFailedError } from 'typeorm';
import { SprintsService } from './sprints.service';
import { Sprint } from './entities/sprint.entity';
import { Project } from '../projects/entities/project.entity';
import { PermissionsService } from '../rbac/permissions.service';

/**
 * Sprint service tests (spec 3/4/19/29/30/36): legal + illegal transitions,
 * one-active-sprint invariant (pre-check + DB filtered-unique mapping),
 * open-tasks completion policy with explicit audited override,
 * preference-aware activation notifications, board + completion aggregations.
 * Exception assertions use the NestJS payload convention: { response: {...} }.
 */

type AnyMock = jest.Mock;
interface AnyRepo {
  [key: string]: AnyMock;
}

const PROJECT_ROW = { id: 'project-1', code: 'VIN', name: 'Đồ án VIN', status: 'active' } as unknown as Project;

function sprintRow(overrides?: Partial<Record<string, unknown>>): Sprint {
  return {
    id: 'sprint-1',
    code: 'SP-VIN-01',
    name: 'Sprint 1',
    description: null,
    projectId: 'project-1',
    sessionId: null,
    status: 'planned',
    goal: null,
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: new Date('2026-01-15T00:00:00Z'),
    createdById: 'actor-1',
    createdAt: new Date('2025-12-01T00:00:00Z'),
    updatedAt: new Date('2025-12-01T00:00:00Z'),
    ...overrides,
  } as unknown as Sprint;
}

const uniqueViolation = (number = 2601) =>
  new QueryFailedError('INSERT', [], Object.assign(new Error('duplicate key'), { number }));

const CTX = { actorId: 'actor-1', ip: '127.0.0.1', userAgent: 'jest' };

function buildHarness(opts?: {
  sprint?: Sprint | null;
  project?: Project | null;
  activeSprint?: Sprint | null;
  openTasks?: number;
  activeAssignments?: Array<{ internId: string }>;
  preference?: { userId: string; category: string; enabled: boolean } | null;
  saveError?: Error;
}) {
  const current: Record<string, unknown> = {
    ...(opts?.sprint === undefined ? sprintRow() : (opts.sprint ?? {})),
  };
  const qbFactory = () => {
    const qb: Record<string, AnyMock> = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      select: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn(async () => [[], 0]),
      getMany: jest.fn(async () => []),
      getCount: jest.fn(async () => (opts?.openTasks ?? 0)),
      getRawOne: jest.fn(async () => ({ sum: null })),
    };
    return qb;
  };
  const sprintRepo: AnyRepo = {
    findOne: jest.fn(async (args?: { where?: Record<string, unknown> }) => {
      const where = args?.where;
      if (where?.code) return (opts?.sprint ?? null) as Sprint | null;
      if (opts?.sprint === null) return null;
      if (where && 'status' in where) return (opts?.activeSprint ?? null) as Sprint | null;
      return { ...current } as unknown as Sprint;
    }),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    createQueryBuilder: jest.fn(qbFactory),
  };
  const projectRepo: AnyRepo = {
    findOne: jest.fn(async () => (opts?.project === undefined ? PROJECT_ROW : (opts.project ?? null))),
  };
  const sessionRepo: AnyRepo = { findOne: jest.fn(async () => null) };
  const taskRepo: AnyRepo = {
    count: jest.fn(async () => (opts?.openTasks ?? 0)),
    createQueryBuilder: jest.fn(qbFactory),
  };
  const assignmentsRepo: AnyRepo = { find: jest.fn(async () => opts?.activeAssignments ?? []) };
  const notificationRepo: AnyRepo = { insert: jest.fn(async () => ({})) };
  const preferenceRepo: AnyRepo = { findOne: jest.fn(async () => opts?.preference ?? null) };
  const auditRepo: AnyRepo = { insert: jest.fn(async () => ({})) };
  const activityRepo: AnyRepo = { insert: jest.fn(async () => ({})) };

  const em: Record<string, AnyMock> = {
    getRepository: jest.fn((entity: unknown) => {
      const name = (entity as { name?: string }).name;
      switch (name) {
        case 'Sprint':
          return sprintRepo;
        case 'Project':
          return projectRepo;
        case 'InternshipSession':
          return sessionRepo;
        case 'Task':
          return taskRepo;
        case 'Assignment':
          return assignmentsRepo;
        case 'Notification':
          return notificationRepo;
        case 'NotificationPreference':
          return preferenceRepo;
        case 'AuditLog':
          return auditRepo;
        case 'ActivityEvent':
          return activityRepo;
        default:
          throw new Error(`unexpected entity ${String(name)}`);
      }
    }),
    save: jest.fn(async (x: unknown) => {
      if (opts?.saveError) throw opts.saveError;
      Object.assign(current, x as Record<string, unknown>);
      return x;
    }),
    insert: jest.fn(async (entity: unknown, data: unknown) =>
      (em.getRepository(entity) as AnyRepo).insert(data),
    ),
    create: jest.fn((_entity: unknown, x: unknown) => ({ id: 'sprint-new', ...(x as object) })),
    query: jest.fn(async () => [{ v: 100 }]),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(em)) };
  const permissions = { hasRole: jest.fn(async () => true) } as unknown as PermissionsService;

  const service = new SprintsService(
    sprintRepo as unknown as never,
    projectRepo as unknown as never,
    sessionRepo as unknown as never,
    taskRepo as unknown as never,
    dataSource as unknown as never,
    permissions,
  );
  return {
    service,
    em,
    sprintRepo,
    projectRepo,
    taskRepo,
    assignmentsRepo,
    notificationRepo,
    preferenceRepo,
    auditRepo,
    activityRepo,
    dataSource,
    current,
  };
}

describe('sprints.service — transitions (spec 3)', () => {
  it.each([['active'], ['cancelled']] as const)(
    'applies legal planned → %s (status saved, audited)',
    async (to) => {
      const h = buildHarness({ sprint: sprintRow({ status: 'planned' }) });
      await h.service.transition('sprint-1', to, {}, CTX);
      expect(h.current.status).toBe(to);
      expect(h.auditRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sprint.status_changed', targetType: 'sprint', targetId: 'sprint-1' }),
      );
    },
  );

  it('rejects planned → completed with 409 INVALID_SPRINT_TRANSITION', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'planned' }) });
    await expect(h.service.transition('sprint-1', 'completed', {}, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_SPRINT_TRANSITION' },
    });
    expect(h.em.save).not.toHaveBeenCalled();
  });

  it('rejects completed → active (terminal frozen) with 409', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'completed' }) });
    await expect(h.service.transition('sprint-1', 'active', {}, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_SPRINT_TRANSITION' },
    });
    expect(h.em.save).not.toHaveBeenCalled();
  });

  it('rejects cancelled → anything (terminal frozen) with 409', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'cancelled' }) });
    await expect(h.service.transition('sprint-1', 'active', {}, CTX)).rejects.toMatchObject({
      response: { code: 'INVALID_SPRINT_TRANSITION' },
    });
  });

  it('404 SPRINT_NOT_FOUND for unknown sprint', async () => {
    const h = buildHarness({ sprint: null });
    await expect(h.service.transition('missing', 'active', {}, CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'SPRINT_NOT_FOUND' },
    });
  });
});

describe('sprints.service — one-active invariant (spec 4)', () => {
  it('rejects activation when another sprint of the project is already active (409 SPRINT_ACTIVE_EXISTS)', async () => {
    const h = buildHarness({
      sprint: sprintRow({ status: 'planned' }),
      activeSprint: sprintRow({ id: 'sprint-other', status: 'active' }),
    });
    await expect(h.service.transition('sprint-1', 'active', {}, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'SPRINT_ACTIVE_EXISTS', details: { activeSprintId: 'sprint-other' } },
    });
    expect(h.em.save).not.toHaveBeenCalled();
  });

  it('maps a DB filtered-unique violation to 409 SPRINT_ACTIVE_EXISTS (bypassed pre-check)', async () => {
    const h = buildHarness({
      sprint: sprintRow({ status: 'planned' }),
      activeSprint: null,
      saveError: uniqueViolation(2601),
    });
    await expect(h.service.transition('sprint-1', 'active', {}, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'SPRINT_ACTIVE_EXISTS' },
    });
  });

  it('active → active is not a legal transition (no silent self-heal)', async () => {
    const h = buildHarness({
      sprint: sprintRow({ status: 'active' }),
      activeSprint: sprintRow({ id: 'sprint-1', status: 'active' }),
    });
    await expect(h.service.transition('sprint-1', 'active', {}, CTX)).rejects.toMatchObject({
      response: { code: 'INVALID_SPRINT_TRANSITION' },
    });
  });
});

describe('sprints.service — completion policy (spec 29)', () => {
  it('rejects completing with open tasks (409 SPRINT_HAS_OPEN_TASKS + count in details)', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'active' }), openTasks: 2 });
    await expect(h.service.transition('sprint-1', 'completed', {}, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'SPRINT_HAS_OPEN_TASKS', details: { openTasks: 2 } },
    });
    expect(h.em.save).not.toHaveBeenCalled();
  });

  it('completes with open tasks ONLY on explicit allowOpenTasks=true (audited override)', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'active' }), openTasks: 3 });
    await h.service.transition('sprint-1', 'completed', { allowOpenTasks: true }, CTX);
    expect(h.current.status).toBe('completed');
    expect(h.auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sprint.status_changed',
        detail: expect.stringContaining('"allowOpenTasks":true'),
      }),
    );
  });

  it('completes cleanly when no open tasks remain (no override needed)', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'active' }), openTasks: 0 });
    await h.service.transition('sprint-1', 'completed', {}, CTX);
    expect(h.current.status).toBe('completed');
  });
});

describe('sprints.service — activation side effects (spec 16/18/26)', () => {
  it('activation writes activity + notifies every active-assignment intern (actor excluded)', async () => {
    const h = buildHarness({
      sprint: sprintRow({ status: 'planned' }),
      activeAssignments: [{ internId: 'intern-1' }, { internId: 'intern-2' }, { internId: 'actor-1' }],
    });
    await h.service.transition('sprint-1', 'active', {}, CTX);
    expect(h.activityRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'sprints', action: 'sprint.activated' }),
    );
    expect(h.notificationRepo.insert).toHaveBeenCalledTimes(2);
    expect(h.notificationRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'intern-1', type: 'task' }),
    );
  });

  it('honors notification preferences: disabled user receives NOTHING', async () => {
    const h = buildHarness({
      sprint: sprintRow({ status: 'planned' }),
      activeAssignments: [{ internId: 'intern-1' }],
      preference: { userId: 'intern-1', category: 'task', enabled: false },
    });
    await h.service.transition('sprint-1', 'active', {}, CTX);
    expect(h.notificationRepo.insert).not.toHaveBeenCalled();
  });
});

describe('sprints.service — create (spec 19)', () => {
  const input = {
    code: 'SP-VIN-02',
    name: 'Sprint 2',
    projectId: 'project-1',
    startDate: '2026-02-01T00:00:00Z',
    endDate: '2026-02-15T00:00:00Z',
  };

  it('creates a planned sprint and audits it', async () => {
    const h = buildHarness();
    h.sprintRepo.findOne.mockImplementation(async (args?: { where?: { code?: string } }) =>
      args?.where?.code ? null : ({ ...h.current } as unknown as Sprint),
    );
    const created = await h.service.create(input, CTX);
    expect(created.code).toBe('SP-VIN-02');
    expect(created.status).toBe('planned');
    expect(h.auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sprint.created', targetType: 'sprint' }),
    );
  });

  it('404 PROJECT_NOT_FOUND for unknown project', async () => {
    const h = buildHarness({ project: null });
    await expect(h.service.create(input, CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'PROJECT_NOT_FOUND' },
    });
  });

  it('409 PROJECT_NOT_ASSIGNABLE unless the project is active', async () => {
    const h = buildHarness({ project: { ...PROJECT_ROW, status: 'archived' } as unknown as Project });
    await expect(h.service.create(input, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'PROJECT_NOT_ASSIGNABLE' },
    });
  });

  it('409 SPRINT_CODE_TAKEN on duplicate code', async () => {
    const h = buildHarness();
    h.sprintRepo.findOne.mockImplementation(async (args?: { where?: { code?: string } }) =>
      args?.where?.code ? sprintRow({ id: 'other', code: 'SP-VIN-02' }) : sprintRow(),
    );
    await expect(h.service.create(input, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'SPRINT_CODE_TAKEN' },
    });
  });

  it('404 SESSION_NOT_FOUND for unknown sessionId', async () => {
    const h = buildHarness();
    h.sprintRepo.findOne.mockImplementation(async (args?: { where?: { code?: string } }) =>
      args?.where?.code ? null : ({ ...h.current } as unknown as Sprint),
    );
    await expect(h.service.create({ ...input, sessionId: 'missing-session' }, CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'SESSION_NOT_FOUND' },
    });
  });
});

describe('sprints.service — update (spec 19)', () => {
  it('edits metadata on a non-terminal sprint and audits it', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'active' }) });
    await h.service.update('sprint-1', { name: 'Sprint 1 (đổi tên)', goal: 'Ship core' }, CTX);
    expect(h.current.name).toBe('Sprint 1 (đổi tên)');
    expect(h.current.goal).toBe('Ship core');
    expect(h.auditRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'sprint.updated' }));
  });

  it('refuses to edit a terminal sprint (409 INVALID_SPRINT_TRANSITION)', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'completed' }) });
    await expect(h.service.update('sprint-1', { name: 'x' }, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_SPRINT_TRANSITION' },
    });
  });

  it('400 INVALID_SPRINT_DATES when endDate < startDate', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'planned' }) });
    await expect(h.service.update('sprint-1', { endDate: '2025-01-01T00:00:00Z' }, CTX)).rejects.toMatchObject({
      response: { statusCode: 400, code: 'INVALID_SPRINT_DATES' },
    });
  });
});

describe('sprints.service — board + completion (spec 22/30)', () => {
  it('counts overdue open work beyond the returned column page and exposes Sprint context', async () => {
    const h = buildHarness({ sprint: sprintRow({ goal: 'Ship safely', sessionId: 'SESSION-1' }) });
    h.taskRepo.createQueryBuilder.mockImplementation(() => {
      const qb: Record<string, AnyMock> = { where: jest.fn(() => qb), andWhere: jest.fn(() => qb), getMany: jest.fn(async () => [
        ...Array.from({ length: 101 }, (_, i) => ({ id: `t${i}`, code: `T-${i}`, title: 'Work', status: 'todo', priority: i === 100 ? 'low' : 'high', dueDate: new Date(i === 100 ? '2000-01-01' : '2100-01-01'), createdAt: new Date(i) })),
        { id: 'done', code: 'DONE', title: 'Done', status: 'done', priority: 'low', dueDate: new Date('2000-01-01'), createdAt: new Date() },
      ]) };
      return qb;
    });
    const board = await h.service.board('sprint-1', { page: 1, pageSize: 100 });
    expect(board.columns.find(c => c.status === 'todo')).toMatchObject({ count: 101, tasks: expect.any(Array) });
    expect(board.columns.find(c => c.status === 'todo')?.tasks).toHaveLength(100);
    expect(board).toMatchObject({ overdueOpenTaskCount: 1, sprint: { goal: 'Ship safely', sessionId: 'session-1' } });
  });
  it('uses the same canonical sprint/project UUIDs on a board as sprint detail', async () => {
    const id = 'AABBCCDD-1111-4222-8333-123456789ABC';
    const projectId = 'BBCCDDEE-1111-4222-8333-123456789ABC';
    const h = buildHarness({ sprint: sprintRow({ id, projectId }) });
    const detail = await h.service.getOneDetailed(id);
    const board = await h.service.board(id, { page: 1, pageSize: 10 });
    expect(board.sprint.id).toBe(id.toLowerCase());
    expect(board.sprint.projectId).toBe(projectId.toLowerCase());
    expect(board.sprint.id).toBe(detail.id);
  });
  it('board groups REAL tasks by actual status with true counts (no fake columns)', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'active' }) });
    h.taskRepo.createQueryBuilder.mockImplementation(() => {
      const qb: Record<string, AnyMock> = {
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        addOrderBy: jest.fn(() => qb),
        getMany: jest.fn(async () => [
          { id: 't1', code: 'VIN-100', title: 'A', storyPoints: 5, description: 'Xây dựng validation cho form', status: 'todo', priority: 'high', assigneeId: null, progress: 0, dueDate: null, createdAt: new Date(1) },
          { id: 't2', code: 'VIN-101', title: 'B', status: 'todo', priority: 'low', assigneeId: 'intern-1', progress: 10, dueDate: new Date(2), createdAt: new Date(2) },
          { id: 't3', code: 'VIN-102', title: 'C', status: 'doing', priority: 'medium', assigneeId: 'intern-1', progress: 50, dueDate: null, createdAt: new Date(3) },
        ]),
      };
      return qb;
    });
    const board = await h.service.board('sprint-1', { page: 1, pageSize: 100 });
    expect(board.total).toBe(3);
    const todo = board.columns.find((c) => c.status === 'todo');
    const doing = board.columns.find((c) => c.status === 'doing');
    expect(todo?.count).toBe(2);
    expect(doing?.count).toBe(1);
    // critical→low priority ordering: high (VIN-100) before low (VIN-101)
    expect(todo?.tasks[0].code).toBe('VIN-100');
    expect(todo?.tasks[0]).toMatchObject({ storyPoints: 5, description: 'Xây dựng validation cho form' });
    expect(doing?.tasks[0]).toMatchObject({ storyPoints: null, description: null });
  });

  it('completion aggregates story points from the DB; NULL when no task declares points', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'active' }), openTasks: 5 });
    h.taskRepo.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    const summary = await h.service.completion('sprint-1');
    expect(summary).toEqual({ total: 5, done: 2, open: 3, committedStoryPoints: null, completedStoryPoints: null });
  });

  it('completion returns numeric sums when tasks declare story points', async () => {
    const h = buildHarness({ sprint: sprintRow({ status: 'active' }), openTasks: 0 });
    h.taskRepo.count.mockResolvedValueOnce(4).mockResolvedValueOnce(4);
    h.taskRepo.createQueryBuilder.mockImplementation(() => {
      const qb: Record<string, AnyMock> = {
        select: jest.fn(() => qb),
        where: jest.fn(() => qb),
        getRawOne: jest.fn(async () => ({ sum: '34' })),
      };
      return qb;
    });
    const summary = await h.service.completion('sprint-1');
    expect(summary.committedStoryPoints).toBe(34);
    expect(summary.completedStoryPoints).toBe(34);
  });
});
