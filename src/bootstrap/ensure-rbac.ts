import { DataSource, In } from 'typeorm';
import { Permission } from '../rbac/entities/permission.entity';
import { Role } from '../rbac/entities/role.entity';
import { RolePermission } from '../rbac/entities/role-permission.entity';

/**
 * Phase-1 permission catalogue (domain.code). Extend per milestone —
 * never remove codes here (migrations handle permission retirement).
 */
export const PERMISSION_CATALOG: Array<{ code: string; name: string; description: string }> = [
  { code: 'users.read', name: 'Xem người dùng', description: 'Danh sách và chi tiết người dùng' },
  { code: 'users.create', name: 'Tạo người dùng', description: 'Tạo tài khoản mới' },
  { code: 'users.update', name: 'Sửa người dùng', description: 'Cập nhật hồ sơ người dùng' },
  { code: 'users.status', name: 'Đổi trạng thái người dùng', description: 'Kích hoạt/khoá/tạm ngưng tài khoản' },
  { code: 'roles.read', name: 'Xem vai trò', description: 'Danh sách vai trò' },
  { code: 'permissions.read', name: 'Xem quyền', description: 'Danh sách quyền' },
  { code: 'groups.read', name: 'Xem nhóm', description: 'Danh sách nhóm người dùng' },
  { code: 'groups.manage', name: 'Quản trị nhóm', description: 'Tạo/sửa nhóm, thành viên, vai trò nhóm' },
  { code: 'catalogs.read', name: 'Xem danh mục', description: 'Danh mục dùng chung' },
  { code: 'catalogs.manage', name: 'Quản trị danh mục', description: 'Tạo/sửa loại và mục danh mục' },
  { code: 'settings.read', name: 'Xem cài đặt', description: 'Đọc cấu hình hệ thống' },
  { code: 'settings.update', name: 'Sửa cài đặt', description: 'Thay đổi cấu hình hệ thống' },
  { code: 'audit.read', name: 'Xem nhật ký kiểm toán', description: 'Trail bảo mật/compliance' },
  { code: 'activity.read', name: 'Xem hoạt động', description: 'Feed hoạt động hệ thống' },
];

const ROLE_CATALOG: Array<{ code: string; name: string; description: string; isSystem: boolean; grantAll?: boolean }> = [
  { code: 'admin', name: 'Quản trị viên', description: 'Toàn quyền hệ thống', isSystem: true, grantAll: true },
  {
    code: 'instructor',
    name: 'Giảng viên',
    description: 'Quản lý lớp, phiên thực tập, đánh giá',
    isSystem: true,
  },
  { code: 'intern', name: 'Thực tập sinh', description: 'Người tham gia chương trình thực tập', isSystem: true },
];

export interface EnsureRbacResult {
  rolesCreated: number;
  permissionsCreated: number;
  rolePermissionsAdded: number;
}

/**
 * Idempotent RBAC bootstrap: upsert roles + permissions by code, then grant
 * `admin` every permission. Safe to run repeatedly (explicit, no demo data).
 */
export async function ensureRbac(ds: DataSource): Promise<EnsureRbacResult> {
  const roleRepo = ds.getRepository(Role);
  const permRepo = ds.getRepository(Permission);
  const rpRepo = ds.getRepository(RolePermission);

  let rolesCreated = 0;
  let permissionsCreated = 0;
  let rolePermissionsAdded = 0;

  const roleByCode = new Map<string, Role>();
  for (const def of ROLE_CATALOG) {
    let role = await roleRepo.findOne({ where: { code: def.code } });
    if (!role) {
      role = await roleRepo.save(roleRepo.create(def));
      rolesCreated += 1;
    }
    roleByCode.set(def.code, role);
  }

  const permById = new Map<string, Permission>();
  for (const def of PERMISSION_CATALOG) {
    let perm = await permRepo.findOne({ where: { code: def.code } });
    if (!perm) {
      perm = await permRepo.save(permRepo.create(def));
      permissionsCreated += 1;
    }
    permById.set(def.code, perm);
  }

  const admin = roleByCode.get('admin');
  if (!admin) throw new Error('ensureRbac invariant failed: admin role missing after upsert.');
  const allPerms = [...permById.values()];
  const existingGrants = await rpRepo.find({ where: { roleId: In(allPerms.map((p) => p.id)) } });
  const granted = new Set(existingGrants.filter((g) => g.roleId === admin.id).map((g) => g.permissionId));
  const missing = allPerms.filter((p) => !granted.has(p.id));
  if (missing.length > 0) {
    await rpRepo.insert(missing.map((p) => ({ roleId: admin.id, permissionId: p.id })));
    rolePermissionsAdded = missing.length;
  }

  return { rolesCreated, permissionsCreated, rolePermissionsAdded };
}
