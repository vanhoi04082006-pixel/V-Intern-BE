import { DataSource, Repository } from 'typeorm';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { PermissionsService } from '../rbac/permissions.service';
import { User } from '../users/entities/user.entity';
import { InternshipSession } from './entities/internship-session.entity';
import { SessionInstructor } from './entities/session-instructor.entity';
import { SessionMember } from './entities/session-member.entity';
import { SessionMilestone } from './entities/session-milestone.entity';
import { SessionsService } from './sessions.service';

/**
 * Session service tests (spec 11/14/42): backend-enforced state machine,
 * milestone validation, DB-resolved instructor permission validation.
 */

type AnyMock = jest.Mock;
interface AnyRepo {
  [key: string]: AnyMock;
}

const SESSION_ROW = {
  id: 's-1',
  code: 'S-2026',
  name: 'Phiên 2026',
  status: 'upcoming',
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: new Date('2026-06-30T00:00:00Z'),
} as unknown as InternshipSession;

function buildHarness(opts?: {
  sessionRow?: InternshipSession | null;
  milestones?: Array<Partial<SessionMilestone> & { id: string; sessionId?: string }>;
  instructorHasPermission?: boolean;
  activeUsers?: Array<{ id: string; status: string }>;
}) {
  // Mutable current row so update() behaves like the real repository.
  const current: Record<string, unknown> = { ...(opts?.sessionRow ?? SESSION_ROW) };
  const sessionsRepo: AnyRepo = {
    findOne: jest.fn(async (args?: { where?: { id?: string; code?: string } }) => {
      // create() code-uniqueness check sees only an explicitly seeded row.
      if (args?.where?.code) return (opts?.sessionRow ?? null) as InternshipSession | null;
      if (opts?.sessionRow === null) return null;
      // id lookups always reflect the mutable current row (post-update state).
      return { ...current } as unknown as InternshipSession;
    }),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    update: jest.fn(async (_id: string, patch: Record<string, unknown>) => {
      Object.assign(current, patch);
    }),
  };
  const membersRepo: AnyRepo = {
    find: jest.fn(async () => []),
    insert: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
  const instructorsRepo: AnyRepo = {
    find: jest.fn(async () => []),
    insert: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
  const milestonesRepo: AnyRepo = {
    findOne: jest.fn(
      async (args?: { where?: { id?: string; sessionId?: string } }) =>
        (opts?.milestones ?? []).find(
          (m) => m.id === args?.where?.id && m.sessionId === args?.where?.sessionId,
        ) ?? null,
    ),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    update: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({})),
  };
  const usersRepo: AnyRepo = {
    find: jest.fn(async () => opts?.activeUsers ?? []),
    findOne: jest.fn(async (args?: { where?: { id?: string; status?: string } }) =>
      (opts?.activeUsers ?? []).find((u) => u.id === args?.where?.id) ?? null,
    ),
  };
  const query = jest.fn(async () => []);
  const em = { findOne: jest.fn(async (_entity, args) => sessionsRepo.findOne(args)), findOneBy: jest.fn(async () => null), update: jest.fn(async (_entity, id, patch) => sessionsRepo.update(id, patch)), query, insert: jest.fn(async () => ({})) };
  const dataSource = { query, transaction: jest.fn(async cb => cb(em)) } as unknown as DataSource;
  const permissionsService = {
    getEffectivePermissionCodes: jest.fn(async () =>
      new Set(opts?.instructorHasPermission === false ? [] : ['sessions.manage']),
    ),
    hasRole: jest.fn(async () => true),
  } as unknown as PermissionsService;
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;
  const activity = { record: jest.fn(async () => undefined) } as unknown as ActivityService;

  const service = new SessionsService(
    sessionsRepo as unknown as Repository<InternshipSession>,
    membersRepo as unknown as Repository<SessionMember>,
    instructorsRepo as unknown as Repository<SessionInstructor>,
    milestonesRepo as unknown as Repository<SessionMilestone>,
    usersRepo as unknown as Repository<User>,
    dataSource,
    permissionsService,
    audit,
    activity,
  );
  return { service, sessionsRepo, milestonesRepo, usersRepo, permissionsService, instructorsRepo, audit, dataSource, em };
}

const CTX = { actorId: 'admin-1', ip: '127.0.0.1', userAgent: 'jest' };

describe('SessionsService.listOverview — delivery signals and sorting', () => {
  it('returns active Sprint and scoped alerts using two bounded queries', async () => {
    const h = buildHarness();
    const query = h.em.query as jest.Mock;
    query.mockResolvedValueOnce([{ n: 1 }]).mockResolvedValueOnce([{
      ...SESSION_ROW, id: 'S-1', memberCount: 2, sprintCount: 1, taskTotal: 4, taskDone: 1,
      currentSprintId: 'SP-1', currentSprintCode: 'SPRINT-1', currentSprintName: 'Build',
      overdueTasks: 2, pendingReview: 1, sessionOverdue: 0,
    }]);
    const result = await h.service.listOverview({ page: 2, pageSize: 10, q: 'Build' }, { userId: 'teacher-1', isAdmin: false });
    expect(result.items[0]).toMatchObject({
      taskPercent: 25, currentSprint: { id: 'sp-1', code: 'SPRINT-1', name: 'Build' },
      alerts: { overdueTasks: 2, pendingReview: 1, sessionOverdue: false },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY');
    expect(query.mock.calls[1][1]).toEqual(['teacher-1', '%Build%']);
    expect(query.mock.calls[1][0]).toContain('session_instructors');
  });

  it.each([
    ['name', 'asc', 's.name ASC'],
    ['progress', 'desc', 'COALESCE(CAST(d.taskDone AS float) / NULLIF(d.taskTotal, 0), 0) DESC'],
    ['endDate', 'asc', 's.endDate ASC'],
    ['__proto__', 'DESC; DROP TABLE tasks', 's.startDate DESC'],
  ])('uses a fixed SQL order expression for %s / %s', async (sortBy, sortDirection, order) => {
    const h = buildHarness();
    await h.service.listOverview({ page: 1, pageSize: 10, sortBy, sortDirection } as Parameters<SessionsService['listOverview']>[0]);
    const sql = (h.em.query as jest.Mock).mock.calls[1][0] as string;
    expect(sql).toContain(`ORDER BY ${order}, s.id`);
    expect(sql).not.toContain('DROP TABLE');
  });
});

describe('SessionsService.update — backend state machine (spec 11/42)', () => {
  it('allows legal transitions and records a status-changed audit with from/to', async () => {
    const h = buildHarness({ sessionRow: { ...SESSION_ROW, status: 'active' } as unknown as InternshipSession });
    const res = await h.service.update('s-1', { status: 'ending' }, CTX);
    expect(h.sessionsRepo.update).toHaveBeenCalledWith(
      's-1',
      expect.objectContaining({ status: 'ending' }),
    );
    expect(h.em.insert).toHaveBeenCalledWith(AuditLog,
      expect.objectContaining({
        action: 'session.status_changed',
        detail: JSON.stringify({ from: 'active', to: 'ending' }),
      }),
    );
    expect(res.status).toBe('ending');
  });

  it('409 INVALID_SESSION_TRANSITION for illegal jumps (e.g. completed -> active)', async () => {
    const h = buildHarness({ sessionRow: { ...SESSION_ROW, status: 'completed' } as unknown as InternshipSession });
    await expect(h.service.update('s-1', { status: 'active' }, CTX)).rejects.toMatchObject({
      response: { statusCode: 409, code: 'INVALID_SESSION_TRANSITION', details: { from: 'completed', to: 'active' } },
    });
    expect(h.sessionsRepo.update).not.toHaveBeenCalled();
  });

  it('409 SESSION_DATE_RANGE_INVALID when patched endDate < startDate', async () => {
    const h = buildHarness();
    await expect(
      h.service.update('s-1', { endDate: '2025-01-01T00:00:00.000Z' }, CTX),
    ).rejects.toMatchObject({ response: { statusCode: 409, code: 'SESSION_DATE_RANGE_INVALID' } });
  });

  it('404 SESSION_NOT_FOUND for unknown id', async () => {
    const h = buildHarness({ sessionRow: null });
    await expect(h.service.update('missing', { name: 'x' }, CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'SESSION_NOT_FOUND' },
    });
  });
});

describe('SessionsService.update — M5 Start readiness (WP-5)', () => {
  it('serializes competing transitions and rejects a stale Start after cancellation', async () => {
    const h = buildHarness();
    let tail: Promise<unknown> = Promise.resolve();
    (h.dataSource.transaction as jest.Mock).mockImplementation(cb => {
      const next = tail.then(() => cb(h.em)); tail = next.catch(() => undefined); return next;
    });
    const results = await Promise.allSettled([
      h.service.update('s-1', { status: 'cancelled' }, CTX),
      h.service.update('s-1', { status: 'active' }, CTX),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { response: { code: 'INVALID_SESSION_TRANSITION' } } });
    expect(h.sessionsRepo.update).toHaveBeenCalledTimes(1);
    expect(h.em.findOne).toHaveBeenCalledWith(InternshipSession, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });
  it('fails closed on an invalid pinned snapshot and never activates', async () => {
    const h = buildHarness();
    (h.dataSource.query as jest.Mock).mockResolvedValue([{ projectId: 'p1', snapshotJson: 'null' }]);
    await expect(h.service.update('s-1', { status: 'active' }, CTX)).rejects.toMatchObject({
      response: { code: 'SESSION_SNAPSHOT_INVALID' },
    });
    expect(h.sessionsRepo.update).not.toHaveBeenCalled();
  });
  const SNAPSHOT = JSON.stringify({
    roleDetails: [
      { code: 'frontend', countMin: 1 },
      { code: 'backend', countMin: 1 },
    ],
  });
  function startHarness(filled: Array<{ roleCode: string; filled: number }>, ineligible: Array<{ internId: string }>) {
    const h = buildHarness();
    (h.dataSource.query as unknown as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes('FROM template_runs')) {
        return [{ projectId: 'p-1', snapshotJson: SNAPSHOT }];
      }
      if (sql.includes('FROM project_members')) {
        return filled;
      }
      if (sql.includes('FROM assignments')) {
        return ineligible;
      }
      return [];
    });
    return h;
  }
  it('409 SESSION_TEAM_INCOMPLETE when required slots are unfilled', async () => {
    const { service } = startHarness([{ roleCode: 'frontend', filled: 1 }], []);
    await expect(service.update('s-1', { status: 'active' }, CTX)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SESSION_TEAM_INCOMPLETE' }),
    });
  });
  it('409 INTERN_NOT_RECRUITED when an assignee lost eligibility', async () => {
    const { service } = startHarness(
      [
        { roleCode: 'frontend', filled: 1 },
        { roleCode: 'backend', filled: 1 },
      ],
      [{ internId: 'u-9' }],
    );
    await expect(service.update('s-1', { status: 'active' }, CTX)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INTERN_NOT_RECRUITED' }),
    });
  });
  it('activates when every required slot is filled by eligible members', async () => {
    const { service } = startHarness(
      [
        { roleCode: 'frontend', filled: 1 },
        { roleCode: 'backend', filled: 1 },
      ],
      [],
    );
    const updated = await service.update('s-1', { status: 'active' }, CTX);
    expect(updated.status).toBe('active');
  });
  it('starts legacy sessions without a template run freely', async () => {
    const { service } = buildHarness();
    const updated = await service.update('s-1', { status: 'active' }, CTX);
    expect(updated.status).toBe('active');
  });
});

describe('SessionsService milestones — validation (spec 14/42)', () => {
  it('404 SESSION_NOT_FOUND when creating a milestone on a missing session', async () => {
    const h = buildHarness({ sessionRow: null });
    await expect(
      h.service.createMilestone('missing', { title: 'Giai đoạn 1' }, CTX),
    ).rejects.toMatchObject({ response: { statusCode: 404, code: 'SESSION_NOT_FOUND' } });
  });

  it('creates a milestone with defaults (status pending, sortOrder 0)', async () => {
    const h = buildHarness();
    await h.service.createMilestone('s-1', { title: 'Giai đoạn 1' }, CTX);
    expect(h.milestonesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's-1', title: 'Giai đoạn 1', status: 'pending', sortOrder: 0 }),
    );
  });

  it('404 MILESTONE_NOT_FOUND when updating/deleting a milestone from another session', async () => {
    const h = buildHarness({ milestones: [{ id: 'm-other' }] });
    await expect(h.service.updateMilestone('s-1', 'm-other', { title: 'x' }, CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'MILESTONE_NOT_FOUND' },
    });
    await expect(h.service.deleteMilestone('s-1', 'm-other', CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'MILESTONE_NOT_FOUND' },
    });
  });

  it('updates a milestone that belongs to the session (audited)', async () => {
    const h = buildHarness({ milestones: [{ id: 'm-1', sessionId: 's-1' }] });
    h.milestonesRepo.findOne.mockImplementation(async (args?: { where?: { id?: string; sessionId?: string } }) =>
      args?.where?.id === 'm-1' ? { id: 'm-1', sessionId: 's-1', title: 'Giai đoạn 1' } : null,
    );
    await h.service.updateMilestone('s-1', 'm-1', { status: 'completed' }, CTX);
    expect(h.milestonesRepo.update).toHaveBeenCalledWith('m-1', expect.objectContaining({ status: 'completed' }));
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'session.milestone_updated' }),
    );
  });
});

describe('SessionsService.addInstructors — DB-resolved permission validation (spec 13/42)', () => {
  it('403 INSTRUCTOR_PERMISSION_MISSING when the target user lacks sessions.manage', async () => {
    const h = buildHarness({
      instructorHasPermission: false,
      activeUsers: [{ id: 'u-9', status: 'active' }],
    });
    await expect(h.service.addInstructors('s-1', ['u-9'], CTX)).rejects.toMatchObject({
      response: { statusCode: 403, code: 'INSTRUCTOR_PERMISSION_MISSING' },
    });
    expect(h.instructorsRepo.insert).not.toHaveBeenCalled();
  });

  it('adds instructors that hold sessions.manage (idempotent)', async () => {
    const h = buildHarness({
      instructorHasPermission: true,
      activeUsers: [{ id: 'u-9', status: 'active' }],
    });
    const res = await h.service.addInstructors('s-1', ['u-9'], CTX);
    expect(res).toEqual({ added: 1, skipped: 0 });
    expect(h.instructorsRepo.insert).toHaveBeenCalledWith([{ sessionId: 's-1', instructorId: 'u-9' }]);
  });

  it('404 USER_NOT_FOUND for unknown/inactive instructor ids', async () => {
    const h = buildHarness({ activeUsers: [] });
    await expect(h.service.addInstructors('s-1', ['ghost'], CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'USER_NOT_FOUND' },
    });
  });

  it('lead instructor resolution validates permission too (create with leadInstructorId)', async () => {
    const h = buildHarness({ instructorHasPermission: false, activeUsers: [{ id: 'u-9', status: 'active' }] });
    await expect(
      h.service.create(
        {
          code: 'S-NEW',
          name: 'Phiên mới',
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-06-30T00:00:00.000Z',
          leadInstructorId: 'u-9',
        },
        CTX,
      ),
    ).rejects.toMatchObject({ response: { statusCode: 403, code: 'INSTRUCTOR_PERMISSION_MISSING' } });
  });
});
