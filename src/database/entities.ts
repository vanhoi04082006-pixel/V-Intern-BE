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
import { AcademicClass } from '../classes/entities/class.entity';
import { ClassMember } from '../classes/entities/class-member.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionMember } from '../sessions/entities/session-member.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { SessionMilestone } from '../sessions/entities/session-milestone.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { ProjectTechnology } from '../projects/entities/project-technology.entity';
import { Assignment } from '../assignments/entities/assignment.entity';

/** Single source of truth for the platform + academic-core entity list. */
export const ENTITIES = [
  // Phase 1 — platform core
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
  // Phase 2 — academic core
  AcademicClass,
  ClassMember,
  InternshipSession,
  SessionMember,
  SessionInstructor,
  SessionMilestone,
  Project,
  ProjectMember,
  ProjectTechnology,
  Assignment,
];
