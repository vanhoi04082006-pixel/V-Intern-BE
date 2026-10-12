import { PermissionsService } from './permissions.service';
import { GroupMember } from '../groups/entities/group-member.entity';
import { GroupRole } from '../groups/entities/group-role.entity';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserRole } from './entities/user-role.entity';

/**
 * Effective-permission resolution (mocked repos):
 * direct roles ∪ group-inherited roles → union of their permissions.
 */
interface RepoStub {
  find: jest.Mock;
}

function makeRepo(defaultRows: unknown[] = []): RepoStub {
  return { find: jest.fn().mockResolvedValue(defaultRows) };
}

function buildService(overrides: {
  userRoles?: unknown[];
  groupMembers?: unknown[];
  groupRoles?: unknown[];
  roles?: unknown[];
  rolePermissions?: unknown[];
  permissions?: unknown[];
  /** Optional filter for rolePermissions.find (mocks ignore `where` by default). */
  rolePermissionsWhere?: (rows: any[], where: any) => unknown[];
  /** Optional filter for permissions.find (same reason). */
  permissionsWhere?: (rows: any[], where: any) => unknown[];
}): PermissionsService {
  const userRoles = makeRepo(overrides.userRoles ?? []);
  const groupMembers = makeRepo(overrides.groupMembers ?? []);
  const groupRoles = makeRepo(overrides.groupRoles ?? []);
  const roles = makeRepo(overrides.roles ?? []);
  const rpRows = overrides.rolePermissions ?? [];
  const rolePermissions = {
    find: jest.fn(async (opts?: any) =>
      overrides.rolePermissionsWhere ? overrides.rolePermissionsWhere(rpRows, opts?.where) : rpRows,
    ),
  };
  const pRows = overrides.permissions ?? [];
  const permissions = {
    find: jest.fn(async (opts?: any) =>
      overrides.permissionsWhere ? overrides.permissionsWhere(pRows, opts?.where) : pRows,
    ),
  };
  return new PermissionsService(
    userRoles as unknown as Repository<UserRole>,
    groupMembers as unknown as Repository<GroupMember>,
    groupRoles as unknown as Repository<GroupRole>,
    roles as unknown as Repository<Role>,
    rolePermissions as unknown as Repository<RolePermission>,
    permissions as unknown as Repository<Permission>,
  );
}

// Repository import kept for typing only
import { Repository } from 'typeorm';

describe('PermissionsService — effective permissions from DB', () => {
  it('empty roles → empty permission set (intern with no grants)', async () => {
    const svc = buildService({});
    const codes = await svc.getEffectivePermissionCodes('u-1');
    expect(codes.size).toBe(0);
  });

  it('direct role only → its permissions', async () => {
    const svc = buildService({
      userRoles: [{ userId: 'u-1', roleId: 'r-instructor' }],
      rolePermissions: [{ roleId: 'r-instructor', permissionId: 'p-users.read' }],
      permissions: [{ id: 'p-users.read', code: 'users.read', name: 'users.read' }],
    });
    const codes = await svc.getEffectivePermissionCodes('u-1');
    expect([...codes]).toEqual(['users.read']);
  });

  it('group-inherited role adds its permissions (union with direct)', async () => {
    const svc = buildService({
      userRoles: [{ userId: 'u-1', roleId: 'r-intern' }],
      groupMembers: [{ groupId: 'g-1', userId: 'u-1' }],
      groupRoles: [{ groupId: 'g-1', roleId: 'r-instructor' }],
      rolePermissions: [
        { roleId: 'r-intern', permissionId: 'p-catalogs.read' },
        { roleId: 'r-instructor', permissionId: 'p-users.read' },
      ],
      permissions: [
        { id: 'p-catalogs.read', code: 'catalogs.read' },
        { id: 'p-users.read', code: 'users.read' },
      ],
    });
    const codes = await svc.getEffectivePermissionCodes('u-1');
    expect([...codes].sort()).toEqual(['catalogs.read', 'users.read']);
  });

  it('overlapping grants are deduplicated (direct + group share a role)', async () => {
    const svc = buildService({
      userRoles: [{ userId: 'u-1', roleId: 'r-shared' }],
      groupMembers: [{ groupId: 'g-1', userId: 'u-1' }],
      groupRoles: [{ groupId: 'g-1', roleId: 'r-shared' }],
      rolePermissions: [{ roleId: 'r-shared', permissionId: 'p-1' }],
      permissions: [{ id: 'p-1', code: 'catalogs.read' }],
    });
    const codes = await svc.getEffectivePermissionCodes('u-1');
    expect([...codes]).toEqual(['catalogs.read']);
  });

  it('buildPrincipal returns roles + permissions codes (never ids)', async () => {
    const svc = buildService({
      userRoles: [{ userId: 'u-1', roleId: 'r-admin' }],
      roles: [{ id: 'r-admin', code: 'admin', name: 'Quản trị viên', description: null, isSystem: true, createdAt: new Date(), updatedAt: new Date() }],
      rolePermissions: [{ roleId: 'r-admin', permissionId: 'p-users.read' }],
      permissions: [{ id: 'p-users.read', code: 'users.read', name: 'users.read', description: null, createdAt: new Date() }],
    });
    const principal = await svc.buildPrincipal({
      id: 'u-1',
      email: 'a@b.vn',
      displayName: 'A',
      status: 'active',
    } as never);
    expect(principal).toMatchObject({ roles: ['admin'], permissions: ['users.read'] });
  });
});

describe('PermissionsService — role-grant policy (P0 BE-001/BE-002)', () => {
  const PERMS = [
    { id: 'p-users.create', code: 'users.create' },
    { id: 'p-users.read', code: 'users.read' },
    { id: 'p-workspace', code: 'intern.workspace.view' },
  ];
  // Actor holds exactly {users.create, users.read}; intern conveys {intern.workspace.view}.
  // NOTE: mocked repos ignore query args, so the `roles` table deliberately
  // omits the admin row — otherwise hasRole('admin') would be true for everyone.
  function grantSetup() {
    const rp = [
      { roleId: 'r-creator', permissionId: 'p-users.create' },
      { roleId: 'r-creator', permissionId: 'p-users.read' },
      { roleId: 'r-intern', permissionId: 'p-workspace' },
    ];
    return buildService({
      userRoles: [{ userId: 'actor', roleId: 'r-creator' }],
      roles: [
        { id: 'r-creator', code: 'creator' },
        { id: 'r-intern', code: 'intern' },
      ],
      rolePermissions: rp,
      // Honor TypeORM `where: { roleId: In([...]) | string }` like the real repository.
      rolePermissionsWhere: (rows, where) => {
        const raw = where?.roleId;
        const ids = Array.isArray(raw?.value) ? raw.value : raw !== undefined ? [raw] : [];
        return rows.filter((r: any) => ids.includes(r.roleId));
      },
      permissions: PERMS,
      // Honor `where: { id: In([...]) }` — otherwise every lookup sees all codes.
      permissionsWhere: (rows, where) => {
        const raw = where?.id;
        const ids = Array.isArray(raw?.value) ? raw.value : raw !== undefined ? [raw] : [];
        return rows.filter((r: any) => ids.includes(r.id));
      },
    });
  }

  it('allows granting a role whose permissions are a subset of the actor', async () => {
    const svc = grantSetup();
    await expect(
      svc.assertGrantableRoles('actor', [{ id: 'r-creator', code: 'creator' }]),
    ).resolves.toBeUndefined();
  });

  it('denies granting admin without the admin role (403 ROLE_GRANT_FORBIDDEN)', async () => {
    const svc = grantSetup();
    const err = await svc
      .assertGrantableRoles('actor', [{ id: 'r-admin', code: 'admin' }])
      .catch((e) => e);
    expect(err?.status).toBe(403);
    expect(err?.response?.code ?? err?.code).toContain('ROLE_GRANT_FORBIDDEN');
  });

  it('denies granting a role conveying permissions the actor lacks', async () => {
    const svc = grantSetup();
    await expect(
      svc.assertGrantableRoles('actor', [{ id: 'r-intern', code: 'intern' }]),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('denies role assignment without an authenticated actor (fail-closed)', async () => {
    const svc = grantSetup();
    await expect(svc.assertGrantableRoles(null, [{ id: 'r-intern', code: 'intern' }])).rejects.toMatchObject({
      status: 403,
    });
  });

  it('getRolePermissionCodes maps role ids to their conveyed codes', async () => {
    const svc = grantSetup();
    const map = await svc.getRolePermissionCodes(['r-creator', 'r-intern', 'r-empty']);
    expect([...(map.get('r-creator') ?? [])].sort()).toEqual(['users.create', 'users.read']);
    expect([...(map.get('r-intern') ?? [])]).toEqual(['intern.workspace.view']);
    expect(map.get('r-empty')?.size).toBe(0);
  });
});
