import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GroupMember } from '../groups/entities/group-member.entity';
import { GroupRole } from '../groups/entities/group-role.entity';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserRole } from './entities/user-role.entity';
import { User } from '../users/entities/user.entity';
import { SessionUser } from '../common/types/request-principal';

/**
 * Effective authorization = direct roles (user_roles)
 *                              ∪ group-inherited roles (group_members → group_roles)
 * Permissions = union of all effective roles' permissions.
 * Always resolved FRESH from the database — JWTs carry identity only,
 * so permission revocation takes effect on the very next request.
 */
@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserRole) private readonly userRoles: Repository<UserRole>,
    @InjectRepository(GroupMember) private readonly groupMembers: Repository<GroupMember>,
    @InjectRepository(GroupRole) private readonly groupRoles: Repository<GroupRole>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(RolePermission) private readonly rolePermissions: Repository<RolePermission>,
    @InjectRepository(Permission) private readonly permissions: Repository<Permission>,
  ) {}

  /** Effective role IDs (direct ∪ group-inherited), deduplicated. */
  async getEffectiveRoleIds(userId: string): Promise<string[]> {
    const direct = await this.userRoles.find({ where: { userId } });
    const memberships = await this.groupMembers.find({ where: { userId } });
    const groupIds = memberships.map((m) => m.groupId);
    const inherited =
      groupIds.length > 0 ? await this.groupRoles.find({ where: { groupId: In(groupIds) } }) : [];
    return [...new Set([...direct.map((r) => r.roleId), ...inherited.map((r) => r.roleId)])];
  }

  /** True when the user holds the named role DIRECTLY or via a group. */
  async accessSnapshot(userId: string) {
    const roleIds = await this.getEffectiveRoleIds(userId);
    if (!roleIds.length) return { roles: new Set<string>(), permissions: new Set<string>() };
    const [roles, grants] = await Promise.all([this.roles.find({ where: roleIds.map(id => ({ id })) }), this.getRolePermissionCodes(roleIds)]);
    return { roles: new Set(roles.map(role => role.code)), permissions: new Set([...grants.values()].flatMap(codes => [...codes])) };
  }

  /** True when the user holds the named role DIRECTLY or via a group. */
  async hasRole(userId: string, roleCode: string): Promise<boolean> {
    const roleIds = await this.getEffectiveRoleIds(userId);
    if (roleIds.length === 0) return false;
    const roles = await this.roles.find({ where: roleIds.map((id) => ({ id })) });
    return roles.some((r) => r.code === roleCode);
  }

  /** Effective permission codes (Set for O(1) guard checks). */
  async getEffectivePermissionCodes(userId: string): Promise<Set<string>> {
    const roleIds = await this.getEffectiveRoleIds(userId);
    if (roleIds.length === 0) return new Set();
    const grants = await this.rolePermissions.find({ where: { roleId: In(roleIds) } });
    const permissionIds = [...new Set(grants.map((g) => g.permissionId))];
    if (permissionIds.length === 0) return new Set();
    const rows = await this.permissions.find({ where: { id: In(permissionIds) } });
    return new Set(rows.map((p) => p.code));
  }

  /** Permission codes conveyed by each given role ID (roleId → codes). */
  async getRolePermissionCodes(roleIds: string[]): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    const unique = [...new Set(roleIds)];
    for (const id of unique) out.set(id, new Set());
    if (unique.length === 0) return out;
    const grants = await this.rolePermissions.find({ where: { roleId: In(unique) } });
    const permissionIds = [...new Set(grants.map((g) => g.permissionId))];
    const rows =
      permissionIds.length > 0 ? await this.permissions.find({ where: { id: In(permissionIds) } }) : [];
    const codeById = new Map(rows.map((p) => [p.id, p.code]));
    for (const g of grants) {
      const code = codeById.get(g.permissionId);
      if (code) out.get(g.roleId)?.add(code);
    }
    return out;
  }

  /**
   * Role-grant policy (P0 BE-001/BE-002): an actor may only grant roles whose
   * conveyed permissions are a subset of their own effective permissions.
   * Granting `admin` additionally requires holding the admin role. Callers must
   * normalize role codes (trim/lowercase) BEFORE resolving entities. Missing
   * actor (system paths) is fail-closed; scripts using repositories directly
   * (bootstrap/seeds) are unaffected by design.
   */
  async assertGrantableRoles(
    actorId: string | null | undefined,
    roles: Array<{ id: string; code: string }>,
  ): Promise<void> {
    if (!actorId) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ROLE_GRANT_FORBIDDEN',
        message: 'Role assignment requires an authenticated actor.',
      });
    }
    if (roles.length === 0) return;
    const [byId, actorCodes, actorIsAdmin] = await Promise.all([
      this.getRolePermissionCodes(roles.map((r) => r.id)),
      this.getEffectivePermissionCodes(actorId),
      this.hasRole(actorId, 'admin'),
    ]);
    for (const role of roles) {
      if (role.code === 'admin' && !actorIsAdmin) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'ROLE_GRANT_FORBIDDEN',
          message: 'Only an admin can grant the admin role.',
        });
      }
      const missing = [...(byId.get(role.id) ?? [])].filter((c) => !actorCodes.has(c));
      if (missing.length > 0) {
        throw new ForbiddenException({
          statusCode: 403,
          code: 'ROLE_GRANT_FORBIDDEN',
          message: `Cannot grant role '${role.code}': actor is missing permissions: ${missing.join(', ')}.`,
        });
      }
    }
  }

  /** Full principal for /auth/me and login responses (roles + permissions codes). */
  async buildPrincipal(user: User): Promise<SessionUser> {
    const roleIds = await this.getEffectiveRoleIds(user.id);
    const roleEntities =
      roleIds.length > 0 ? await this.roles.find({ where: { id: In(roleIds) } }) : [];
    const grants =
      roleIds.length > 0 ? await this.rolePermissions.find({ where: { roleId: In(roleIds) } }) : [];
    const permissionIds = [...new Set(grants.map((g) => g.permissionId))];
    const permissionEntities =
      permissionIds.length > 0
        ? await this.permissions.find({ where: { id: In(permissionIds) } })
        : [];
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      roles: roleEntities.map((r) => r.code),
      permissions: permissionEntities.map((p) => p.code),
    };
  }
}
