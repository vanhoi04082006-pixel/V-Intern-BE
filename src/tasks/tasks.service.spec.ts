import { TasksService, buildTaskCode, compareFocus } from './tasks.service';
import { Task } from './entities/task.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { PermissionsService } from '../rbac/permissions.service';
import { QueryFailedError } from 'typeorm';

/**
 * Task service tests (spec 7/8/9/11/12/13/14/17/21/25/27/28/33/36):
 * ownership, legal/illegal transitions, transactional history, rollback,
 * optimistic concurrency, SEQUENCE code generation, preference-aware
 * notifications, comments access, workspace focus ordering.
 * Exception assertions use the NestJS payload convention: { response: {...} }.
 */

type AnyMock = jest.Mock;
interface AnyRepo {
  [key: string]: AnyMock;
}

const PRINCIPAL = { userId: 'intern-1', email: 'intern1@vintern.local' };
const STRANGER = { userId: 'stranger-1', email: 'stranger@vintern.local' };
const CTX = { actorId: 'actor-1', ip: '127.0.0.1', userAgent: 'jest' };

const PROJECT_ROW = { id: 'project-1', code: 'VIN', name: 'Đồ án VIN', status: 'active' } as unknown as Project;
const SPRINT_ROW = {
  id: 'sprint-1',
  code: 'SP-VIN-01',
  name: 'Sprint 1',
  status: 'active',
  projectId: 'project-1',
  startDate: new Date(1),
  endDate: new Date(2),
} as unknown as Sprint;

function taskRow(overrides?: Partial<Record<string, unknown>>): Task {
  return {
    id: 'task-1',
    code: 'VIN-100',
    title: 'Task 1',
    description: null,
    projectId: 'project-1',
    sprintId: 'sprint-1',
    assigneeId: 'intern-1',
    createdById: 'actor-1',
    status: 'todo',
    priority: 'medium',
    storyPoints: 3,
    progress: 0,
    dueDate: null,
    version: 1,
    deletedAt: null,
    createdAt: new Date(1),
    updatedAt: new Date(1),
    ...overrides,
  } as unknown as Task;
}

const uniqueViolation = (number = 2627) =>
  new QueryFailedError('INSERT', [], Object.assign(new Error('duplicate key'), { number }));

function buildHarness(opts?: {
  codes?: string[];
  task?: Task;
  project?: Project | null;
  sprint?: Sprint | null;
  activeAssignment?: Assignment | null;
  assigneeUser?: User | null;
}) {
  const current: Record<string, unknown> = {
    ...(opts?.task ?? taskRow()),
  };
  const qbFactory = (rows: unknown[] = [], total = rows.length) => () => {
    const qb: Record<string, AnyMock> = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn(async () => [rows, total]),
      getMany: jest.fn(async () => rows),
      getCount: jest.fn(async () => total),
    };
    return qb;
  };
  const tasksRepo: AnyRepo = {
    findOne: jest.fn(async () => ({ ...current } as unknown as Task)),
    find: jest.fn(async () => [taskRow()]),
    createQueryBuilder: jest.fn(qbFactory([taskRow()], 1)),
  };
  const commentsRepo: AnyRepo = {
    create: jest.fn((x: unknown) => ({ id: 'comment-new', ...(x as object) })),
    save: jest.fn(async (x: unknown) => x),
    createQueryBuilder: jest.fn(
      qbFactory(
        [
          { id: 'c-1', taskId: 'task-1', authorId: 'intern-1', content: 'hello', createdAt: new Date(1), updatedAt: new Date(1) },
        ],
        1,
      ),
    ),
  };
  const historyRepo: AnyRepo = {
    insert: jest.fn(async () => ({})),
    createQueryBuilder: jest.fn(
      qbFactory(
        [
          { id: 'h-1', taskId: 'task-1', fromStatus: null, toStatus: 'todo', changedById: 'actor-1', reason: null, createdAt: new Date(1) },
        ],
        1,
      ),
    ),
  };
  const sprintsRepo: AnyRepo = {
    findOne: jest.fn(async () => (opts?.sprint === undefined ? SPRINT_ROW : (opts.sprint ?? null))),
  };
  const projectsRepo: AnyRepo = {
    findOne: jest.fn(async () => (opts?.project === undefined ? PROJECT_ROW : (opts.project ?? null))),
  };
  const usersRepo: AnyRepo = {
    findOne: jest.fn(async () =>
      opts?.assigneeUser === undefined
        ? ({ id: 'intern-1', displayName: 'Intern 1', email: 'intern1@vintern.local', status: 'active' } as unknown as User)
        : (opts.assigneeUser ?? null),
    ),
  };
  const assignmentsRepo: AnyRepo = {
    findOne: jest.fn(async () =>
      opts?.activeAssignment === undefined
        ? ({ id: 'a-1', internId: 'intern-1', projectId: 'project-1', status: 'active' } as unknown as Assignment)
        : (opts.activeAssignment ?? null),
    ),
    find: jest.fn(async () => []),
  };
  const notificationRepo: AnyRepo = { insert: jest.fn(async () => ({})) };
  const preferenceRepo: AnyRepo = { findOne: jest.fn(async () => null) };
  const auditRepo: AnyRepo = { insert: jest.fn(async () => ({})) };
  const activityRepo: AnyRepo = { insert: jest.fn(async () => ({})) };

  const permissions = {
    getEffectivePermissionCodes: jest.fn(async () => new Set(opts?.codes ?? [])),
  } as unknown as PermissionsService;

  const em: Record<string, AnyMock> = {
    getRepository: jest.fn((entity: unknown) => {
      const name = (entity as { name?: string }).name;
      switch (name) {
        case 'Task':
          return tasksRepo;
        case 'TaskComment':
          return commentsRepo;
        case 'TaskStatusHistory':
          return historyRepo;
        case 'Sprint':
          return sprintsRepo;
        case 'Project':
          return projectsRepo;
        case 'User':
          return usersRepo;
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
      Object.assign(current, x as Record<string, unknown>);
      return x;
    }),
    insert: jest.fn(async (entity: unknown, data: unknown) =>
      (em.getRepository(entity) as AnyRepo).insert(data),
    ),
    create: jest.fn((_entity: unknown, x: unknown) => ({ id: 'task-new', ...(x as object) })),
    query: jest.fn(async () => [{ v: 100 }]),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) => cb(em)) };

  const service = new TasksService(
    tasksRepo as unknown as never,
    commentsRepo as unknown as never,
    historyRepo as unknown as never,
    sprintsRepo as unknown as never,
    projectsRepo as unknown as never,
    usersRepo as unknown as never,
    assignmentsRepo as unknown as never,
    dataSource as unknown as never,
    permissions,
  );
  return {
    service,
    em,
    dataSource,
    current,
    tasksRepo,
    commentsRepo,
    historyRepo,
    sprintsRepo,
    projectsRepo,
    usersRepo,
    assignmentsRepo,
    notificationRepo,
    preferenceRepo,
    auditRepo,
    activityRepo,
    permissions,
  };
}

describe('task code + focus helpers (spec 11/23)', () => {
  it('rejects stale manager edits without writing task, history or audit', async () => {
    const h = buildHarness({ task: taskRow({ version: 2 }) });
    await expect(h.service.update('task-1', { title: 'stale', expectedVersion: 1 } as never, CTX))
      .rejects.toMatchObject({ response: { code: 'TASK_VERSION_CONFLICT' } });
    expect(h.em.save).not.toHaveBeenCalled();
    expect(h.em.insert).not.toHaveBeenCalled();
    expect(h.current.title).toBe('Task 1');
  });

  it('rejects stale intern progress after ownership checks, without writes', async () => {
    const h = buildHarness({ task: taskRow({ version: 2 }) });
    await expect(h.service.updateOwn('task-1', { progress: 99, expectedVersion: 1 } as never, PRINCIPAL, CTX))
      .rejects.toMatchObject({ response: { code: 'TASK_VERSION_CONFLICT' } });
    expect(h.em.save).not.toHaveBeenCalled();
    expect(h.em.insert).not.toHaveBeenCalled();
  });
  it('buildTaskCode sanitizes the project-code prefix and appends the SEQUENCE value', () => {
    expect(buildTaskCode('vin', 103)).toBe('VIN-103');
    expect(buildTaskCode('V-123-x', 7)).toBe('V123X-7');
    expect(buildTaskCode('', 1)).toBe('TASK-1');
  });

  it('compareFocus: doing < review < todo; dueDate asc with nulls last; updatedAt tiebreak', () => {
    const doing = taskRow({ status: 'doing' });
    const review = taskRow({ status: 'review' });
    const todo = taskRow({ status: 'todo' });
    expect(compareFocus(doing, review)).toBeLessThan(0);
    expect(compareFocus(review, todo)).toBeLessThan(0);

    const dueSooner = taskRow({ status: 'doing', dueDate: new Date('2026-01-02T00:00:00Z') });
    const dueLater = taskRow({ status: 'doing', dueDate: new Date('2026-01-09T00:00:00Z') });
    const noDue = taskRow({ status: 'doing', dueDate: null });
    expect(compareFocus(dueSooner, dueLater)).toBeLessThan(0);
    expect(compareFocus(dueLater, noDue)).toBeLessThan(0);

    const older = taskRow({ status: 'doing', updatedAt: new Date(1) });
    const newer = taskRow({ status: 'doing', updatedAt: new Date(2) });
    expect(compareFocus(older, newer)).toBeLessThan(0);
  });
});

describe('tasks.service — list scoping (spec 21/33)', () => {
  it('broad caller (tasks.view) is NOT force-scoped; explicit assigneeId filter passes through', async () => {
    const h = buildHarness({ codes: ['tasks.view'] });
    await h.service.list({ page: 1, pageSize: 20, assigneeId: 'intern-2' } as never, PRINCIPAL);
    const qb = h.tasksRepo.createQueryBuilder.mock.results[0].value as Record<string, AnyMock>;
    const assigneeFilters = qb.andWhere.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('t.assigneeId'),
    );
    expect(assigneeFilters).toHaveLength(1);
    expect(assigneeFilters[0][0]).toBe('t.assigneeId = :assigneeId');
  });

  it('intern (tasks.view.own) is ALWAYS scoped to own tasks — params cannot widen the scope', async () => {
    const h = buildHarness({ codes: ['tasks.view.own'] });
    await h.service.list({ page: 1, pageSize: 20, assigneeId: 'intern-2' } as never, PRINCIPAL);
    const qb = h.tasksRepo.createQueryBuilder.mock.results[0].value as Record<string, AnyMock>;
    expect(qb.andWhere).toHaveBeenCalledWith('t.assigneeId = :me', { me: PRINCIPAL.userId });
  });

  it('mine=true scopes a broad caller to self as well', async () => {
    const h = buildHarness({ codes: ['tasks.manage'] });
    await h.service.list({ page: 1, pageSize: 20, mine: true } as never, PRINCIPAL);
    const qb = h.tasksRepo.createQueryBuilder.mock.results[0].value as Record<string, AnyMock>;
    expect(qb.andWhere).toHaveBeenCalledWith('t.assigneeId = :me', { me: PRINCIPAL.userId });
  });
});

describe('tasks.service — detail access (spec 33)', () => {
  it('assignee can view own task without broad permissions (includes summaries)', async () => {
    const h = buildHarness({ codes: [] });
    const detail = await h.service.getOneDetailed('task-1', PRINCIPAL);
    expect(detail.code).toBe('VIN-100');
    expect(detail.project?.code).toBe('VIN');
    expect(detail.assignee?.id).toBe('intern-1');
  });

  it('stranger without any task permission is rejected (403 TASK_ACCESS_DENIED)', async () => {
    const h = buildHarness({ codes: [], task: taskRow({ assigneeId: 'intern-2' }) });
    await expect(h.service.getOneDetailed('task-1', STRANGER)).rejects.toMatchObject({
      response: { statusCode: 403, code: 'TASK_ACCESS_DENIED' },
    });
  });

  it('deleted task is invisible to everyone (404 TASK_NOT_FOUND)', async () => {
    const h = buildHarness({ codes: ['tasks.manage'], task: taskRow({ deletedAt: new Date() }) });
    await expect(h.service.getOneDetailed('task-1', PRINCIPAL)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'TASK_NOT_FOUND' },
    });
  });
});

describe('tasks.service — create (spec 10/11/12/14/27)', () => {
  const input = {
    title: 'Module đăng nhập',
    projectId: 'project-1',
    sprintId: 'sprint-1',
    assigneeId: 'intern-1',
    storyPoints: 3,
  };

  it('creates with SEQUENCE code, history seed, notification, activity and audit in ONE tx', async () => {
    const h = buildHarness();
    const created = await h.service.create(input, CTX);
    expect(created.code).toBe('VIN-100');
    expect(created.status).toBe('todo');
    expect(h.historyRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-new', fromStatus: null, toStatus: 'todo' }),
    );
    expect(h.notificationRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'intern-1', type: 'task' }),
    );
    expect(h.activityRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'tasks', action: 'task.assigned' }),
    );
    expect(h.auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.created', targetType: 'task' }),
    );
  });

  it('409 SPRINT_PROJECT_MISMATCH on cross-project sprint relation', async () => {
    const h = buildHarness({ sprint: { ...SPRINT_ROW, projectId: 'project-OTHER' } as unknown as Sprint });
    await expect(h.service.create(input, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'SPRINT_PROJECT_MISMATCH' },
    });
  });

  it('409 INVALID_ASSIGNEE when the assignee has no active assignment on THIS project', async () => {
    const h = buildHarness({ activeAssignment: null });
    await expect(h.service.create(input, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_ASSIGNEE' },
    });
  });

  it('409 INVALID_ASSIGNEE when the assignee account is not active', async () => {
    const h = buildHarness({ assigneeUser: { id: 'intern-1', status: 'locked' } as unknown as User });
    await expect(h.service.create(input, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_ASSIGNEE' },
    });
  });

  it('409 PROJECT_NOT_ASSIGNABLE unless the project is active', async () => {
    const h = buildHarness({ project: { ...PROJECT_ROW, status: 'archived' } as unknown as Project });
    await expect(h.service.create(input, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'PROJECT_NOT_ASSIGNABLE' },
    });
  });

  it('404 PROJECT_NOT_FOUND for unknown project', async () => {
    const h = buildHarness({ project: null });
    await expect(h.service.create(input, CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'PROJECT_NOT_FOUND' },
    });
  });

  it('code race retries with a NEW SEQUENCE value (spec 11: never count()+1)', async () => {
    const h = buildHarness();
    let calls = 0;
    h.em.save.mockImplementation(async (x: unknown) => {
      calls += 1;
      if (calls === 1) throw uniqueViolation(2627);
      Object.assign(h.current, x as Record<string, unknown>);
      return x;
    });
    const created = await h.service.create(input, CTX);
    expect(h.em.query).toHaveBeenCalledTimes(2);
    expect(created.code).toBe('VIN-100');
  });
});

describe('tasks.service — manage transitions (spec 7/14/25)', () => {
  it('rework review→doing is allowed for manage callers (history + rework notification)', async () => {
    const h = buildHarness({ task: taskRow({ status: 'review', progress: 80 }) });
    const result = await h.service.update('task-1', { status: 'doing', reason: 'Cần làm lại phần API' }, CTX);
    expect(result.status).toBe('doing');
    expect(h.historyRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', fromStatus: 'review', toStatus: 'doing', reason: 'Cần làm lại phần API' }),
    );
    expect(h.notificationRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'intern-1', title: 'Task cần làm lại' }),
    );
  });

  it('illegal transition doing→done is rejected (409 INVALID_TASK_TRANSITION, no writes)', async () => {
    const h = buildHarness({ task: taskRow({ status: 'doing' }) });
    await expect(h.service.update('task-1', { status: 'done' }, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_TASK_TRANSITION' },
    });
    expect(h.em.save).not.toHaveBeenCalled();
    expect(h.historyRepo.insert).not.toHaveBeenCalled();
  });

  it('review→done forces progress to 100 and notifies assignee (actor excluded)', async () => {
    const h = buildHarness({ task: taskRow({ status: 'review', progress: 60 }) });
    const result = await h.service.update('task-1', { status: 'done' }, CTX);
    expect(result.progress).toBe(100);
    expect(h.notificationRepo.insert).toHaveBeenCalledTimes(1); // assignee only (actor === creator)
    expect(h.activityRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'tasks', action: 'task.completed' }),
    );
  });

  it('409 TASK_VERSION_CONFLICT on optimistic-lock loss (spec 25)', async () => {
    const h = buildHarness({ task: taskRow({ status: 'todo' }) });
    const { OptimisticLockVersionMismatchError } = jest.requireActual('typeorm') as {
      OptimisticLockVersionMismatchError: new (...args: unknown[]) => Error;
    };
    h.em.save.mockRejectedValueOnce(new OptimisticLockVersionMismatchError('tasks', 1, 2));
    await expect(h.service.update('task-1', { title: 'x' }, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'TASK_VERSION_CONFLICT' },
    });
  });

  it('reassignment validates the new assignee and notifies + audits (spec 14/17)', async () => {
    const h = buildHarness();
    await h.service.update('task-1', { assigneeId: 'intern-2' }, CTX);
    expect(h.current.assigneeId).toBe('intern-2');
    expect(h.auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.assignee_changed' }),
    );
    expect(h.notificationRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'intern-2' }),
    );
  });
});

describe('tasks.service — intern own-task rules (spec 8/9/28)', () => {
  it('intern CANNOT update someone else’s task (403 TASK_NOT_OWNED)', async () => {
    const h = buildHarness({ task: taskRow({ assigneeId: 'intern-2' }) });
    await expect(h.service.updateOwn('task-1', { status: 'doing' }, PRINCIPAL, CTX)).rejects.toMatchObject({
      response: { statusCode: 403, code: 'TASK_NOT_OWNED' },
    });
  });

  it('completed assignment → 403 ASSIGNMENT_NOT_ACTIVE (task preserved, never deleted)', async () => {
    const h = buildHarness({ activeAssignment: null });
    await expect(h.service.updateOwn('task-1', { status: 'doing' }, PRINCIPAL, CTX)).rejects.toMatchObject({
      response: { statusCode: 403, code: 'ASSIGNMENT_NOT_ACTIVE' },
    });
    expect(h.current.deletedAt ?? null).toBeNull();
  });

  it('intern may NOT approve (review→done) — 409 INVALID_TASK_TRANSITION', async () => {
    const h = buildHarness({ task: taskRow({ status: 'review' }) });
    await expect(h.service.updateOwn('task-1', { status: 'done' }, PRINCIPAL, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_TASK_TRANSITION' },
    });
  });

  it('intern may NOT request rework (review→doing) — 409 INVALID_TASK_TRANSITION', async () => {
    const h = buildHarness({ task: taskRow({ status: 'review' }) });
    await expect(h.service.updateOwn('task-1', { status: 'doing' }, PRINCIPAL, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_TASK_TRANSITION' },
    });
  });

  it('intern legal start (todo→doing) writes history + audit, NO notification spam', async () => {
    const h = buildHarness();
    const result = await h.service.updateOwn('task-1', { status: 'doing' }, PRINCIPAL, CTX);
    expect(result.status).toBe('doing');
    expect(h.historyRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'todo', toStatus: 'doing', changedById: 'actor-1' }),
    );
    expect(h.notificationRepo.insert).not.toHaveBeenCalled();
    expect(h.auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.status_changed' }),
    );
  });

  it('progress-only update: NO history row, NO notification, audited as progress update', async () => {
    const h = buildHarness({ task: taskRow({ status: 'doing' }) });
    const result = await h.service.updateOwn('task-1', { progress: 40 }, PRINCIPAL, CTX);
    expect(result.progress).toBe(40);
    expect(h.historyRepo.insert).not.toHaveBeenCalled();
    expect(h.notificationRepo.insert).not.toHaveBeenCalled();
    expect(h.auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.progress_updated' }),
    );
  });

  it('done task is terminal: progress can no longer change (409)', async () => {
    const h = buildHarness({ task: taskRow({ status: 'done', progress: 100 }) });
    await expect(h.service.updateOwn('task-1', { progress: 50 }, PRINCIPAL, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_TASK_TRANSITION' },
    });
  });
});

describe('tasks.service — transactional history (spec 12/26/36)', () => {
  it('status change + history row go through the SAME transactional EntityManager', async () => {
    const h = buildHarness();
    await h.service.updateOwn('task-1', { status: 'doing' }, PRINCIPAL, CTX);
    expect(h.dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(h.historyRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('a failing history insert propagates → the transaction errors (rollback is the tx boundary)', async () => {
    const h = buildHarness();
    h.historyRepo.insert.mockRejectedValueOnce(new Error('history insert failed'));
    await expect(h.service.updateOwn('task-1', { status: 'doing' }, PRINCIPAL, CTX)).rejects.toThrow(
      'history insert failed',
    );
  });
});

describe('tasks.service — soft delete (spec 17)', () => {
  it('sets deletedAt + audits; history and task rows are preserved', async () => {
    const h = buildHarness();
    await h.service.softDelete('task-1', CTX);
    expect(h.current.deletedAt).toBeInstanceOf(Date);
    expect(h.auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.deleted', targetId: 'task-1' }),
    );
  });

  it('double delete → 404 TASK_NOT_FOUND', async () => {
    const h = buildHarness({ task: taskRow({ deletedAt: new Date() }) });
    await expect(h.service.softDelete('task-1', CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'TASK_NOT_FOUND' },
    });
  });
});

describe('tasks.service — comments (spec 13)', () => {
  it('assignee can comment on own task', async () => {
    const h = buildHarness();
    const comment = await h.service.addComment('task-1', 'Đã xong phần API', PRINCIPAL);
    expect(comment.taskId).toBe('task-1');
    expect(comment.authorId).toBe('intern-1');
    expect(h.commentsRepo.save).toHaveBeenCalled();
  });

  it('stranger cannot comment or read comments of an inaccessible task (403)', async () => {
    const h = buildHarness({ task: taskRow({ assigneeId: 'intern-2' }) });
    await expect(h.service.addComment('task-1', 'spam', STRANGER)).rejects.toMatchObject({
      response: { statusCode: 403, code: 'TASK_ACCESS_DENIED' },
    });
    await expect(h.service.listComments('task-1', { page: 1, pageSize: 20 }, STRANGER)).rejects.toMatchObject({
      response: { statusCode: 403, code: 'TASK_ACCESS_DENIED' },
    });
  });

  it('listComments paginates oldest-first', async () => {
    const h = buildHarness();
    const page = await h.service.listComments('task-1', { page: 1, pageSize: 20 }, PRINCIPAL);
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe('c-1');
  });
});

describe('tasks.service — history endpoint (spec 12)', () => {
  it('returns append-only history oldest first', async () => {
    const h = buildHarness();
    const page = await h.service.listHistory('task-1', { page: 1, pageSize: 20 }, PRINCIPAL);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ fromStatus: null, toStatus: 'todo' });
  });
});

describe('tasks.service — intern workspace extension (spec 23)', () => {
  it('returns active sprint + real counts + focused task (doing before review before todo)', async () => {
    const h = buildHarness();
    h.tasksRepo.find.mockResolvedValue([
      taskRow({ id: 't-todo', code: 'VIN-100', status: 'todo', dueDate: new Date('2026-01-05T00:00:00Z') }),
      taskRow({ id: 't-review', code: 'VIN-101', status: 'review', dueDate: null }),
      taskRow({ id: 't-doing', code: 'VIN-102', status: 'doing', dueDate: null }),
    ]);
    const ext = await h.service.workspaceExtension('intern-1', 'project-1');
    expect(ext.currentSprint?.code).toBe('SP-VIN-01');
    expect(ext.taskSummary).toEqual({ todo: 1, doing: 1, review: 1, done: 0, total: 3 });
    expect(ext.focusedTask?.id).toBe('t-doing');
  });

  it('no active sprint → currentSprint null; no tasks → zero counts (stable contract)', async () => {
    const h = buildHarness({ sprint: null });
    h.tasksRepo.find.mockResolvedValue([]);
    const ext = await h.service.workspaceExtension('intern-1', 'project-1');
    expect(ext.currentSprint).toBeNull();
    expect(ext.taskSummary).toEqual({ todo: 0, doing: 0, review: 0, done: 0, total: 0 });
    expect(ext.focusedTask).toBeNull();
  });
});
