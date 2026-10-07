import { DataSource } from 'typeorm';
import { Permission } from '../rbac/entities/permission.entity';
import { Role } from '../rbac/entities/role.entity';
import { RolePermission } from '../rbac/entities/role-permission.entity';
import { ensureRbac, PERMISSION_CATALOG, ROLE_CATALOG } from './ensure-rbac';

/**
 * RBAC bootstrap tests (spec 35/36): idempotent, never rewrites existing
 * permission/role IDs, never duplicates grants, role mapping is exact,
 * and the Phase 3 upgrade path adds ONLY the new sprint/task codes.
 */

type RepoFactory = () => Record<string, jest.Mock>;

/** Grants implied by the catalog for a role code (single source of truth). */
function grantsFor(roleCode: string): string[] {
  const def = ROLE_CATALOG.find((r) => r.code === roleCode);
  if (!def) throw new Error(`role ${roleCode} missing from catalog`);
  return def.grantAll ? PERMISSION_CATALOG.map((p) => p.code) : def.grantCodes ?? [];
}

const PHASE_3_CODES = [
  'sprints.view',
  'sprints.manage',
  'tasks.view',
  'tasks.manage',
  'tasks.view.own',
  'tasks.update.own',
];

function makeDs(overrides?: { perm?: RepoFactory; role?: RepoFactory; rp?: RepoFactory }): {
  ds: DataSource;
  permRepo: Record<string, jest.Mock>;
  roleRepo: Record<string, jest.Mock>;
  rpRepo: Record<string, jest.Mock>;
} {
  const permRepo: Record<string, jest.Mock> = {
    findOne: jest.fn(),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    ...(overrides?.perm ?? {}),
  };
  const roleRepo: Record<string, jest.Mock> = {
    findOne: jest.fn(),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    ...(overrides?.role ?? {}),
  };
  const rpRepo: Record<string, jest.Mock> = {
    find: jest.fn(async () => []),
    insert: jest.fn(async () => ({})),
    ...(overrides?.rp ?? {}),
  };
  const ds = {
    getRepository: jest.fn((entity: unknown) => {
      const name = (entity as { name?: string }).name;
      if (name === 'Permission') return permRepo;
      if (name === 'Role') return roleRepo;
      return rpRepo;
    }),
  } as unknown as DataSource;
  return { ds, permRepo, roleRepo, rpRepo };
}

function role(id: string, code: string): Role {
  return { id, code } as Role;
}
function perm(id: string, code: string): Permission {
  return { id, code } as Permission;
}

describe('ensureRbac (Phase 3 catalog)', () => {
  it('creates missing roles/permissions and grants admin everything, instructor/intern their exact sets', async () => {
    const { ds, roleRepo, permRepo, rpRepo } = makeDs();

    roleRepo.findOne.mockImplementation(async () => undefined);
    roleRepo.save.mockImplementation(async (r: Role) => role(`role-${r.code}`, r.code));
    permRepo.findOne.mockImplementation(async () => undefined);
    permRepo.save.mockImplementation(async (p: Permission) => perm(`perm-${p.code}`, p.code));

    const result = await ensureRbac(ds);

    expect(result.rolesCreated).toBe(3);
    expect(result.permissionsCreated).toBe(PERMISSION_CATALOG.length);
    expect(rpRepo.insert).toHaveBeenCalledTimes(1);

    const grants = rpRepo.insert.mock.calls[0][0] as Array<{ roleId: string; permissionId: string }>;
    // admin gets every permission:
    expect(grants.filter((g) => g.roleId === 'role-admin').length).toBe(PERMISSION_CATALOG.length);
    // instructor gets exactly its catalog-defined manage/view set:
    const instructorCodes = grants
      .filter((g) => g.roleId === 'role-instructor')
      .map((g) => g.permissionId.replace('perm-', ''));
    expect(instructorCodes.sort()).toEqual(grantsFor('instructor').sort());
    // intern gets ONLY the workspace view + own-task permissions (spec 24):
    const internCodes = grants
      .filter((g) => g.roleId === 'role-intern')
      .map((g) => g.permissionId.replace('perm-', ''));
    expect(internCodes.sort()).toEqual(grantsFor('intern').sort());
    expect(internCodes).not.toContain('tasks.manage');
    expect(internCodes).not.toContain('sprints.manage');
  });

  it('is idempotent on rerun: no role/permission rewrites, no duplicate grants', async () => {
    const existingRoles = new Map<string, Role>([
      ['admin', role('role-admin', 'admin')],
      ['instructor', role('role-instructor', 'instructor')],
      ['intern', role('role-intern', 'intern')],
    ]);
    const existingPerms = new Map<string, Permission>(
      PERMISSION_CATALOG.map((def) => [def.code, perm(`perm-${def.code}`, def.code)]),
    );

    const { ds, roleRepo, permRepo, rpRepo } = makeDs();
    roleRepo.findOne.mockImplementation(async ({ where }: { where: { code: string } }) => existingRoles.get(where.code));
    roleRepo.save.mockImplementation(async () => {
      throw new Error('must not rewrite existing roles');
    });
    permRepo.findOne.mockImplementation(async ({ where }: { where: { code: string } }) => existingPerms.get(where.code));
    permRepo.save.mockImplementation(async () => {
      throw new Error('must not rewrite existing permissions');
    });

    // Pre-existing grants = exactly what the catalog wants → nothing to add.
    const wanted: Array<{ roleId: string; permissionId: string }> = [];
    for (const r of existingRoles.values()) {
      for (const code of grantsFor(r.code)) wanted.push({ roleId: r.id, permissionId: `perm-${code}` });
    }
    rpRepo.find.mockImplementation(async ({ where }: { where: Array<{ roleId: string; permissionId: string }> }) =>
      wanted.filter((g) => where.some((w) => w.roleId === g.roleId && w.permissionId === g.permissionId)),
    );

    const result = await ensureRbac(ds);

    expect(result.rolesCreated).toBe(0);
    expect(result.permissionsCreated).toBe(0);
    expect(result.rolePermissionsAdded).toBe(0);
    expect(rpRepo.insert).not.toHaveBeenCalled();
  });

  it('adds ONLY missing grants when a partial state exists (never rewrites IDs)', async () => {
    const existingRoles = new Map<string, Role>([
      ['admin', role('role-admin', 'admin')],
      ['instructor', role('role-instructor', 'instructor')],
      ['intern', role('role-intern', 'intern')],
    ]);
    const existingPerms = new Map<string, Permission>(
      PERMISSION_CATALOG.map((def) => [def.code, perm(`perm-${def.code}`, def.code)]),
    );

    const { ds, roleRepo, permRepo, rpRepo } = makeDs();
    roleRepo.findOne.mockImplementation(async ({ where }: { where: { code: string } }) => existingRoles.get(where.code));
    permRepo.findOne.mockImplementation(async ({ where }: { where: { code: string } }) => existingPerms.get(where.code));

    // Only the intern workspace grant exists — everything else is missing.
    rpRepo.find.mockImplementation(async () => [
      { roleId: 'role-intern', permissionId: 'perm-intern.workspace.view' } as RolePermission,
    ]);

    const result = await ensureRbac(ds);

    const grants = rpRepo.insert.mock.calls[0][0] as Array<{ roleId: string; permissionId: string }>;
    expect(grants.some((g) => g.roleId === 'role-intern' && g.permissionId === 'perm-intern.workspace.view')).toBe(false);
    expect(grants.filter((g) => g.roleId === 'role-admin').length).toBe(PERMISSION_CATALOG.length);
    expect(result.rolePermissionsAdded).toBe(grants.length);
  });

  it('Phase 3 upgrade: a Phase 2 database gains exactly the 6 new sprint/task permissions and 12 new grants, rewriting nothing', async () => {
    // DB state as of Phase 2: all roles exist, only the 9 Phase 2 permissions exist.
    const phase2Codes = [
      'users.read',
      'users.create',
      'users.update',
      'users.status',
      'roles.read',
      'permissions.read',
      'groups.read',
      'groups.manage',
      'catalogs.read',
      'catalogs.manage',
      'settings.read',
      'settings.update',
      'audit.read',
      'activity.read',
      'classes.view',
      'classes.manage',
      'sessions.view',
      'sessions.manage',
      'projects.view',
      'projects.manage',
      'assignments.view',
      'assignments.manage',
      'intern.workspace.view',
    ];
    const existingRoles = new Map<string, Role>([
      ['admin', role('role-admin', 'admin')],
      ['instructor', role('role-instructor', 'instructor')],
      ['intern', role('role-intern', 'intern')],
    ]);
    const existingPerms = new Map<string, Permission>(phase2Codes.map((c) => [c, perm(`perm-${c}`, c)]));

    const { ds, roleRepo, permRepo, rpRepo } = makeDs();
    roleRepo.findOne.mockImplementation(async ({ where }: { where: { code: string } }) => existingRoles.get(where.code));
    roleRepo.save.mockImplementation(async () => {
      throw new Error('must not rewrite existing roles');
    });
    permRepo.findOne.mockImplementation(async ({ where }: { where: { code: string } }) =>
      existingPerms.get(where.code),
    );
    permRepo.save.mockImplementation(async (p: Permission) => {
      const created = perm(`perm-${p.code}`, p.code);
      existingPerms.set(p.code, created);
      return created;
    });
    // Pre-existing grants = the full Phase 2 mapping.
    const existingGrants = new Set<string>();
    for (const r of existingRoles.values()) {
      for (const code of phase2Codes) {
        if (r.code === 'admin' || grantsFor(r.code).includes(code)) existingGrants.add(`${r.id}:perm-${code}`);
      }
    }
    rpRepo.find.mockImplementation(async ({ where }: { where: Array<{ roleId: string; permissionId: string }> }) =>
      where
        .filter((w) => existingGrants.has(`${w.roleId}:${w.permissionId}`))
        .map((w) => ({ roleId: w.roleId, permissionId: w.permissionId }) as RolePermission),
    );

    const result = await ensureRbac(ds);

    expect(result.rolesCreated).toBe(0);
    // Phase 3 (6) + Phase 4 (6) + Phase 5 (15) — a Phase 2 database
    // upgrades to the FULL catalogue (count derived from the catalog so
    // future phases only extend, never silently rewrite, this test).
    expect(result.permissionsCreated).toBe(PERMISSION_CATALOG.length - phase2Codes.length);
    const grants = rpRepo.insert.mock.calls[0][0] as Array<{ roleId: string; permissionId: string }>;
    const newPerms = PERMISSION_CATALOG.filter((p) => !phase2Codes.includes(p.code)).map((p) => p.code);
    const newFor = (roleCode: string) => grantsFor(roleCode).filter((c) => !phase2Codes.includes(c));
    expect(grants.length).toBe(newPerms.length + newFor('instructor').length + newFor('intern').length);
    expect(grants.filter((g) => g.roleId === 'role-admin').length).toBe(newPerms.length);
    expect(grants.filter((g) => g.roleId === 'role-instructor').map((g) => g.permissionId.replace('perm-', '')).sort())
      .toEqual(newFor('instructor').sort());
    expect(grants.filter((g) => g.roleId === 'role-intern').map((g) => g.permissionId.replace('perm-', '')).sort())
      .toEqual(newFor('intern').sort());
    expect(newFor('intern').sort()).toEqual([
      // Phase 6 — own AI mentor + own recommendations
      'ai.mentor.use',
      'ai.recommendations.view.own',
      'certificates.view.own',
      'evaluations.view.own',
      'kpi.view.own',
      'performance.view.own',
      'recruitment.answer.own',
      'recruitment.start.own',
      'recruitment.submit.own',
      'recruitment.view.own',
      'tasks.update.own',
      'tasks.view.own',
      'virtual_salary.view.own',
    ]);
    // no existing (roleId, permissionId) pair is re-inserted
    for (const g of grants) {
      expect(existingGrants.has(`${g.roleId}:${g.permissionId}`)).toBe(false);
    }
  });

  it('catalog contains exactly the Phase 2 + Phase 3 spec codes with no duplicates', () => {
    const codes = PERMISSION_CATALOG.map((p) => p.code);
    const expected = new Set([
      'classes.view',
      'classes.manage',
      'sessions.view',
      'sessions.manage',
      'projects.view',
      'projects.manage',
      'assignments.view',
      'assignments.manage',
      'intern.workspace.view',
      ...PHASE_3_CODES,
      // Phase 4 — recruitment + AI interview core (spec 45)
      'recruitment.view.own',
      'recruitment.start.own',
      'recruitment.answer.own',
      'recruitment.submit.own',
      'recruitment.view',
      'recruitment.manage',
      // Phase 6 — AI mentor + AI evaluation assistance + AI recommendations
      'ai.mentor.use',
      'ai.evaluation.assist',
      'ai.recommendations.view.own',
      'ai.recommendations.view',
    ]);
    for (const code of expected) expect(codes).toContain(code);
    expect(new Set(codes).size).toBe(codes.length);
    // spec 24 + spec 45: intern NEVER receives manage-scope codes
    expect(grantsFor('intern')).not.toContain('tasks.manage');
    expect(grantsFor('intern')).not.toContain('sprints.manage');
    expect(grantsFor('intern')).not.toContain('recruitment.manage');
    expect(grantsFor('instructor')).not.toContain('recruitment.manage');
    // Phase 6 (spec 63): interns are NEVER granted instructor AI assistance;
    // instructors are NEVER granted the intern's own AI mentor surface.
    expect(grantsFor('intern')).not.toContain('ai.evaluation.assist');
    expect(grantsFor('intern')).not.toContain('ai.recommendations.view');
    expect(grantsFor('instructor')).not.toContain('ai.mentor.use');
    expect(grantsFor('instructor')).not.toContain('ai.recommendations.view.own');
  });
});
