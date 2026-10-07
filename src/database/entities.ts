import { User } from '../users/entities/user.entity';
import { Role } from '../rbac/entities/role.entity';
import { Permission } from '../rbac/entities/permission.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { RolePermission } from '../rbac/entities/role-permission.entity';
import { UserGroup } from '../groups/entities/user-group.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { GroupRole } from '../groups/entities/group-role.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { CatalogType } from '../catalogs/entities/catalog-type.entity';
import { CatalogItem } from '../catalogs/entities/catalog-item.entity';
import { SystemSetting } from '../settings/entities/system-setting.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';

/** Single source of truth for the Phase 1 platform-core entity list. */
export const ENTITIES = [
  User,
  Role,
  Permission,
  UserRole,
  RolePermission,
  UserGroup,
  GroupMember,
  GroupRole,
  RefreshToken,
  CatalogType,
  CatalogItem,
  SystemSetting,
  AuditLog,
  ActivityEvent,
  Notification,
  NotificationPreference,
];
