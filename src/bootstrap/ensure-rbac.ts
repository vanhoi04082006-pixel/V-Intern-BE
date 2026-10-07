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
  // ── Phase 4 — recruitment + AI interview core ─────────────────────────────
  { code: 'recruitment.view.own', name: 'Xem tuyển dụng của tôi', description: 'Thực tập sinh xem trạng thái tuyển dụng và kết quả của mình' },
  { code: 'recruitment.start.own', name: 'Bắt đầu phỏng vấn của tôi', description: 'Thực tập sinh chọn vai trò và bắt đầu buổi phỏng vấn tuyển dụng' },
  { code: 'recruitment.answer.own', name: 'Trả lời phỏng vấn của tôi', description: 'Thực tập sinh lưu/cập nhật câu trả lời phỏng vấn của mình' },
  { code: 'recruitment.submit.own', name: 'Nộp phỏng vấn của tôi', description: 'Thực tập sinh nộp bài và yêu cầu đánh giá lại khi được phép' },
  { code: 'recruitment.view', name: 'Xem tuyển dụng ứng viên', description: 'Giảng viên/quản trị xem trạng thái tuyển dụng của ứng viên' },
  { code: 'recruitment.manage', name: 'Quản trị tuyển dụng', description: 'Quản trị quy trình tuyển dụng (giai đoạn sau; Phase 4 chỉ đọc)' },
  // ── Phase 5 — evaluation + performance + KPI + virtual salary + certificates ──
  { code: 'evaluations.view', name: 'Xem đánh giá', description: 'Danh sách và chi tiết đánh giá của giảng viên' },
  { code: 'evaluations.manage', name: 'Quản trị đánh giá', description: 'Tạo/nộp/chốt/điều chỉnh đánh giá (theo phạm vi sở hữu)' },
  { code: 'evaluations.view.own', name: 'Xem đánh giá của tôi', description: 'Thực tập sinh xem đánh giá đã chốt của mình' },
  { code: 'performance.view', name: 'Xem hiệu suất', description: 'Chỉ số hiệu suất tất định của thực tập sinh' },
  { code: 'performance.view.own', name: 'Xem hiệu suất của tôi', description: 'Thực tập sinh xem chỉ số của chính mình' },
  { code: 'kpi.view', name: 'Xem KPI', description: 'Kỳ KPI và kết quả KPI' },
  { code: 'kpi.manage', name: 'Quản trị KPI', description: 'Tạo/tính toán/chốt kỳ KPI (chính sách quản trị)' },
  { code: 'kpi.view.own', name: 'Xem KPI của tôi', description: 'Thực tập sinh xem kết quả KPI của mình' },
  { code: 'virtual_salary.view', name: 'Xem lương ảo', description: 'Sổ cái lương ảo toàn hệ thống (quản trị)' },
  { code: 'virtual_salary.manage', name: 'Quản trị lương ảo', description: 'Sinh lương theo KPI, thưởng/phạt/điều chỉnh (quản trị)' },
  { code: 'virtual_salary.view.own', name: 'Xem lương ảo của tôi', description: 'Thực tập sinh xem số dư và sổ cái của mình' },
  { code: 'certificates.view', name: 'Xem chứng nhận', description: 'Danh sách và chi tiết chứng nhận' },
  { code: 'certificates.manage', name: 'Quản trị chứng nhận', description: 'Cấp/thu hồi chứng nhận (quản trị)' },
  { code: 'certificates.view.own', name: 'Xem chứng nhận của tôi', description: 'Thực tập sinh xem/tải chứng nhận của mình' },
  { code: 'certificates.verify', name: 'Xác minh chứng nhận', description: 'Tra cứu xác minh công khai (dự phòng cho route public)' },
  // ── Phase 6 — AI mentor + AI evaluation assistance + AI recommendations ──
  { code: 'ai.mentor.use', name: 'Sử dụng AI Mentor', description: 'Thực tập sinh trò chuyện với AI mentor trên dữ liệu của chính mình' },
  { code: 'ai.evaluation.assist', name: 'Hỗ trợ đánh giá bằng AI', description: 'Giảng viên yêu cầu gợi ý đánh giá AI (workspace, không có quyền quyết định)' },
  { code: 'ai.recommendations.view.own', name: 'Xem khuyến nghị AI của tôi', description: 'Thực tập sinh xem khuyến nghị phát triển của chính mình' },
  { code: 'ai.recommendations.view', name: 'Xem khuyến nghị AI', description: 'Giảng viên xem khuyến nghị AI của thực tập sinh trong phạm vi sở hữu' },
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
      // Phase 4 — recruitment candidate read (view-only, spec 44)
      'recruitment.view',
      // Phase 5 — evaluation/performance within OWN session/project scope
      // (service-level ownership checks enforce the boundary, spec 61);
      // KPI + salary + certificate ISSUE/REVOKE stay admin-only policies.
      'evaluations.view',
      'evaluations.manage',
      'performance.view',
      'kpi.view',
      'certificates.view',
      'certificates.verify',
      // Phase 6 — AI assistance within OWN authorized scope (spec 63/64);
      // ownership is enforced at the service layer (evaluator-of-record /
      // session-project mentor), the role alone is never sufficient.
      'ai.evaluation.assist',
      'ai.recommendations.view',
    ],
  },
  {
    code: 'intern',
    name: 'Thực tập sinh',
    description: 'Người tham gia chương trình thực tập',
    isSystem: true,
    grantCodes: [
      'intern.workspace.view',
      'tasks.view.own',
      'tasks.update.own',
      // Phase 4 — recruitment own-only actions (spec 45)
      'recruitment.view.own',
      'recruitment.start.own',
      'recruitment.answer.own',
      'recruitment.submit.own',
      // Phase 5 — own views only (spec 60: interns never manage)
      'evaluations.view.own',
      'performance.view.own',
      'kpi.view.own',
      'virtual_salary.view.own',
      'certificates.view.own',
      // Phase 6 — own AI mentor + own recommendations (spec 63: interns are
      // NEVER granted instructor assistance: no ai.evaluation.assist here).
      'ai.mentor.use',
      'ai.recommendations.view.own',
    ],
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
