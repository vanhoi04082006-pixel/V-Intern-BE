import { DataSource } from 'typeorm';
import { Permission } from '../rbac/entities/permission.entity';
import { Role } from '../rbac/entities/role.entity';
import { RolePermission } from '../rbac/entities/role-permission.entity';
import { ensureRbac, PERMISSION_CATALOG } from './ensure-rbac';

/**
 * RBAC bootstrap tests (spec 35): idempotent, never rewrites existing
 * permission/role IDs, never duplicates grants, role mapping is exact.
 */

type RepoFactory = () => Record<string, jest.Mock>;

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

describe('ensureRbac (Phase 2 catalog)', () => {
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
    // instructor gets exactly its manage/view set:
    const instructorCodes = grants
      .filter((g) => g.roleId === 'role-instructor')
      .map((g) => g.permissionId.replace('perm-', ''));
    expect(instructorCodes.sort()).toEqual(
      [
        'classes.view',
        'classes.manage',
        'sessions.view',
        'sessions.manage',
        'projects.view',
        'projects.manage',
        'assignments.view',
        'assignments.manage',
      ].sort(),
    );
    // intern gets ONLY the workspace view:
    const internCodes = grants
      .filter((g) => g.roleId === 'role-intern')
      .map((g) => g.permissionId.replace('perm-', ''));
    expect(internCodes).toEqual(['intern.workspace.view']);
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
      const codes =
        r.code === 'admin'
          ? PERMISSION_CATALOG.map((p) => p.code)
          : r.code === 'instructor'
            ? [
                'classes.view',
                'classes.manage',
                'sessions.view',
                'sessions.manage',
                'projects.view',
                'projects.manage',
                'assignments.view',
                'assignments.manage',
              ]
            : ['intern.workspace.view'];
      for (const code of codes) wanted.push({ roleId: r.id, permissionId: `perm-${code}` });
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

  it('Phase 2 catalog contains exactly the spec-34 codes with no duplicates', () => {
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
    ]);
    for (const code of expected) expect(codes).toContain(code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
