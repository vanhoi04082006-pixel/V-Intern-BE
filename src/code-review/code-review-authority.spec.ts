import { DataSource } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';
import { resolveCodeReviewActor } from './code-review-authority';

const student = 'student', mentor = 'mentor', outsider = 'outsider';
function fixture() {
  let mentorId: string | null = mentor;
  let active = true;
  let sessionOwned = true;
  const staff = new Set([mentor]);
  const canManage = new Set([mentor]);
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM users')) return active ? [{ status: 'active' }] : [];
    if (sql.includes('FROM projects')) return [{ mentorId }];
    if (sql.includes('FROM sprints')) return [{ sessionId: 'session' }];
    if (sql.includes('COUNT(1)')) return [{ n: Number(sessionOwned) }];
    return [];
  });
  const permissions = {
    accessSnapshot: jest.fn(async (id: string) => ({ roles: new Set(staff.has(id) ? ['instructor'] : ['intern']), permissions: new Set(canManage.has(id) ? ['tasks.manage'] : []) })),
    hasRole: jest.fn(async () => false),
  } as unknown as PermissionsService;
  const task = { projectId: 'project', sprintId: 'sprint' };
  const resolve = (actor = student) => resolveCodeReviewActor({ query } as unknown as DataSource, permissions, task, { internId: student }, actor);
  return { resolve, staff, canManage, query, noMentor: () => { mentorId = null; }, inactive: () => { active = false; }, foreignSession: () => { sessionOwned = false; } };
}

describe('automatic code review authority', () => {
  it('dispatches an own submission to its server-selected managing mentor without granting student permissions', async () => {
    const f = fixture();
    await expect(f.resolve()).resolves.toBe(mentor);
    expect(f.staff.has(student)).toBe(false);
    expect(f.canManage.has(student)).toBe(false);
  });
  it('keeps an authorized managing instructor as the Agent actor', async () => {
    await expect(fixture().resolve(mentor)).resolves.toBe(mentor);
  });
  it('refuses a different student even if they carry a forged management permission', async () => {
    const f = fixture(); f.canManage.add(outsider);
    await expect(f.resolve(outsider)).rejects.toMatchObject({ status: 403 });
  });
  it.each(['noMentor', 'inactive', 'foreignSession'] as const)('fails closed for %s', async setup => {
    const f = fixture(); f[setup]();
    await expect(f.resolve()).rejects.toMatchObject({ status: 403 });
  });
  it('refuses a mentor whose management permission has been revoked', async () => {
    const f = fixture(); f.canManage.delete(mentor);
    await expect(f.resolve()).rejects.toMatchObject({ status: 403 });
  });
  it('refuses an assigned account that is no longer staff', async () => {
    const f = fixture(); f.staff.delete(mentor);
    await expect(f.resolve()).rejects.toMatchObject({ status: 403 });
  });
});
