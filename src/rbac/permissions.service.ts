import { Injectable } from '@nestjs/common';
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
