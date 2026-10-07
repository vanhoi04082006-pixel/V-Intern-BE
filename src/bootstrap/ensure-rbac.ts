import { DataSource } from 'typeorm';
import { Permission } from '../rbac/entities/permission.entity';
import { Role } from '../rbac/entities/role.entity';
import { RolePermission } from '../rbac/entities/role-permission.entity';

/**
 * Permission catalogue (domain.code). Extend per milestone —
 * never remove codes here (migrations handle permission retirement).
 *
 * PHASE 2 addition (spec 34): classes/sessions/projects/assignments
 * view+manage and intern.workspace.view.
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
  // ── Phase 2 — academic core ──────────────────────────────────────────────
  { code: 'classes.view', name: 'Xem lớp học', description: 'Danh sách và chi tiết lớp' },
  { code: 'classes.manage', name: 'Quản trị lớp học', description: 'Tạo/sửa lớp, thêm/xoá thành viên lớp' },
  { code: 'sessions.view', name: 'Xem phiên thực tập', description: 'Danh sách và chi tiết phiên thực tập' },
  { code: 'sessions.manage', name: 'Quản trị phiên thực tập', description: 'Tạo/sửa phiên, chuyển trạng thái, thành viên, giảng viên, cột mốc' },
  { code: 'projects.view', name: 'Xem đồ án', description: 'Danh sách và chi tiết đồ án' },
  { code: 'projects.manage', name: 'Quản trị đồ án', description: 'Tạo/sửa đồ án, công nghệ, lưu trữ' },
  { code: 'assignments.view', name: 'Xem phân công', description: 'Danh sách và chi tiết phân công thực tập' },
  { code: 'assignments.manage', name: 'Quản trị phân công', description: 'Tạo/hoàn thành phân công (giao thực tập sinh vào phiên + đồ án)' },
  { code: 'intern.workspace.view', name: 'Xem workspace của tôi', description: 'Thực tập sinh xem trạng thái workspace hiện tại' },
  // ── Phase 3 — sprint / task core ──────────────────────────────────────────
  { code: 'sprints.view', name: 'Xem sprint', description: 'Danh sách, chi tiết, board và tổng kết sprint' },
  { code: 'sprints.manage', name: 'Quản trị sprint', description: 'Tạo/sửa sprint, chuyển trạng thái (một sprint hoạt động mỗi đồ án)' },
  { code: 'tasks.view', name: 'Xem task', description: 'Danh sách và chi tiết mọi task' },
  { code: 'tasks.manage', name: 'Quản trị task', description: 'Tạo/sửa/giao/xoá task, duyệt review, yêu cầu làm lại' },
  { code: 'tasks.view.own', name: 'Xem task của tôi', description: 'Thực tập sinh xem task được giao cho mình' },
  { code: 'tasks.update.own', name: 'Cập nhật task của tôi', description: 'Thực tập sinh tự chuyển trạng thái/tiến độ task của mình' },
];

/**
 * Role catalogue. `grantAll` (admin) or `grantCodes` give the bootstrap its
 * explicit, reviewable default mapping (spec 34):
 * - admin → everything
 * - instructor → academic manage/view set (NO platform administration)
 * - intern → only the current-user workspace view
 */
export const ROLE_CATALOG: Array<{
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  grantAll?: boolean;
  grantCodes?: string[];
}> = [
  { code: 'admin', name: 'Quản trị viên', description: 'Toàn quyền hệ thống', isSystem: true, grantAll: true },
  {
    code: 'instructor',
    name: 'Giảng viên',
    description: 'Quản lý lớp, phiên thực tập, đồ án, phân công',
    isSystem: true,
    grantCodes: [
      'classes.view',
      'classes.manage',
      'sessions.view',
      'sessions.manage',
      'projects.view',
      'projects.manage',
      'assignments.view',
      'assignments.manage',
      // Phase 3 — sprint / task management
      'sprints.view',
      'sprints.manage',
      'tasks.view',
      'tasks.manage',
    ],
  },
  {
    code: 'intern',
    name: 'Thực tập sinh',
    description: 'Người tham gia chương trình thực tập',
    isSystem: true,
    grantCodes: ['intern.workspace.view', 'tasks.view.own', 'tasks.update.own'],
  },
];

export interface EnsureRbacResult {
  rolesCreated: number;
  permissionsCreated: number;
  rolePermissionsAdded: number;
}

/**
 * Idempotent RBAC bootstrap: upsert roles + permissions by code (existing
 * rows — including their IDs — are never rewritten), then grant each role
 * its default permissions. Safe to run repeatedly (no duplicate rows).
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

  const allPerms = [...permById.values()];
  const admin = roleByCode.get('admin');
  if (!admin) throw new Error('ensureRbac invariant failed: admin role missing after upsert.');

  // Collect every (roleId, permissionId) the catalogue demands, then insert
  // only the missing pairs — reruns and partial states converge idempotently.
  const wantedGrants: Array<{ roleId: string; permissionId: string }> = [];
  for (const def of ROLE_CATALOG) {
    const role = roleByCode.get(def.code);
    if (!role) continue;
    const codes = def.grantAll ? allPerms.map((p) => p.code) : (def.grantCodes ?? []);
    for (const code of codes) {
      const perm = permById.get(code);
      if (!perm) throw new Error(`ensureRbac invariant failed: permission ${code} missing after upsert.`);
      wantedGrants.push({ roleId: role.id, permissionId: perm.id });
    }
  }

  if (wantedGrants.length > 0) {
    const existingGrants = await rpRepo.find({
      where: wantedGrants.map((g) => ({ roleId: g.roleId, permissionId: g.permissionId })),
    });
    const existingKeys = new Set(existingGrants.map((g) => `${g.roleId}:${g.permissionId}`));
    const missing = wantedGrants.filter((g) => !existingKeys.has(`${g.roleId}:${g.permissionId}`));
    if (missing.length > 0) {
      await rpRepo.insert(missing);
      rolePermissionsAdded = missing.length;
    }
  }

  return { rolesCreated, permissionsCreated, rolePermissionsAdded };
}
