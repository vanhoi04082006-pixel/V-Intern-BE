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
}): PermissionsService {
  const userRoles = makeRepo(overrides.userRoles ?? []);
  const groupMembers = makeRepo(overrides.groupMembers ?? []);
  const groupRoles = makeRepo(overrides.groupRoles ?? []);
  const roles = makeRepo(overrides.roles ?? []);
  const rolePermissions = makeRepo(overrides.rolePermissions ?? []);
  const permissions = makeRepo(overrides.permissions ?? []);
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
