import { Repository } from 'typeorm';
import { ActivityService } from '../audit/activity.service';
import { AuditService } from '../audit/audit.service';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { User } from '../users/entities/user.entity';
import { ClassesService } from './classes.service';
import { AcademicClass } from './entities/class.entity';
import { ClassMember } from './entities/class-member.entity';

/**
 * Class membership tests (spec 42): duplicate prevention via idempotent add
 * (DB composite unique UX is the hard guarantee — e2e on SQL Server).
 */

type AnyMock = jest.Mock;
interface AnyRepo {
  [key: string]: AnyMock;
}

const CLASS_ROW = { id: 'c-1', code: 'SE-2026A', name: 'Lớp 2026A', status: 'upcoming' } as unknown as AcademicClass;

function buildHarness(opts?: {
  classRow?: AcademicClass | null;
  existingMembers?: Array<{ classId: string; userId: string }>;
  users?: Array<{ id: string; status: string }>;
}) {
  const classesRepo: AnyRepo = {
    findOne: jest.fn(async () => (opts?.classRow === undefined ? CLASS_ROW : opts.classRow)),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
  };
  const membersRepo: AnyRepo = {
    find: jest.fn(async () => opts?.existingMembers ?? []),
    insert: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
  const usersRepo: AnyRepo = {
    find: jest.fn(async () => opts?.users ?? []),
    findOne: jest.fn(async () => null),
  };
  const sessionsRepo: AnyRepo = { findOne: jest.fn(async () => null) };
  const audit = { record: jest.fn(async () => undefined) } as unknown as AuditService;
  const activity = { record: jest.fn(async () => undefined) } as unknown as ActivityService;

  const service = new ClassesService(
    classesRepo as unknown as Repository<AcademicClass>,
    membersRepo as unknown as Repository<ClassMember>,
    usersRepo as unknown as Repository<User>,
    sessionsRepo as unknown as Repository<InternshipSession>,
    audit,
    activity,
  );
  return { service, classesRepo, membersRepo, usersRepo, audit };
}

const CTX = { actorId: 'admin-1', ip: '127.0.0.1', userAgent: 'jest' };

describe('ClassesService.addMembers — duplicate prevention (spec 9/42)', () => {
  it('inserts only NEW members and skips existing ones (idempotent)', async () => {
    const h = buildHarness({
      existingMembers: [{ classId: 'c-1', userId: 'u-1' }],
      users: [{ id: 'u-1', status: 'active' }, { id: 'u-2', status: 'active' }],
    });
    const res = await h.service.addMembers('c-1', ['u-1', 'u-2'], CTX);
    expect(res).toEqual({ added: 1, skipped: 1 });
    expect(h.membersRepo.insert).toHaveBeenCalledWith([{ classId: 'c-1', userId: 'u-2' }]);
  });

  it('re-running the exact same batch adds nothing and reports all skipped', async () => {
    const h = buildHarness({
      existingMembers: [
        { classId: 'c-1', userId: 'u-1' },
        { classId: 'c-1', userId: 'u-2' },
      ],
      users: [{ id: 'u-1', status: 'active' }, { id: 'u-2', status: 'active' }],
    });
    const res = await h.service.addMembers('c-1', ['u-1', 'u-2'], CTX);
    expect(res).toEqual({ added: 0, skipped: 2 });
    expect(h.membersRepo.insert).not.toHaveBeenCalled();
  });

  it('404 CLASS_NOT_FOUND for unknown class id', async () => {
    const h = buildHarness({ classRow: null });
    await expect(h.service.addMembers('missing', ['u-1'], CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'CLASS_NOT_FOUND' },
    });
  });

  it('404 USER_NOT_FOUND listing unknown user ids', async () => {
    const h = buildHarness({ users: [{ id: 'u-1', status: 'active' }] });
    await expect(h.service.addMembers('c-1', ['u-1', 'ghost'], CTX)).rejects.toMatchObject({
      response: { statusCode: 404, code: 'USER_NOT_FOUND' },
    });
    expect(h.membersRepo.insert).not.toHaveBeenCalled();
  });

  it('409 CLASS_CODE_TAKEN on duplicate code create', async () => {
    const h = buildHarness();
    h.classesRepo.findOne.mockImplementation(async (args?: { where?: { code?: string } }) =>
      args?.where?.code ? CLASS_ROW : null,
    );
    await expect(
      h.service.create({ code: 'SE-2026A', name: 'Trùng mã' }, CTX),
    ).rejects.toMatchObject({ response: { statusCode: 409, code: 'CLASS_CODE_TAKEN' } });
  });
});
