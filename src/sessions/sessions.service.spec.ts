import { Repository } from 'typeorm';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
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
    permissionsService,
    audit,
    activity,
  );
  return { service, sessionsRepo, milestonesRepo, usersRepo, permissionsService, instructorsRepo, audit };
}

const CTX = { actorId: 'admin-1', ip: '127.0.0.1', userAgent: 'jest' };

describe('SessionsService.update — backend state machine (spec 11/42)', () => {
  it('allows legal transitions and records a status-changed audit with from/to', async () => {
    const h = buildHarness({ sessionRow: { ...SESSION_ROW, status: 'active' } as unknown as InternshipSession });
    const res = await h.service.update('s-1', { status: 'ending' }, CTX);
    expect(h.sessionsRepo.update).toHaveBeenCalledWith(
      's-1',
      expect.objectContaining({ status: 'ending' }),
    );
    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session.status_changed',
        detail: { from: 'active', to: 'ending' },
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
