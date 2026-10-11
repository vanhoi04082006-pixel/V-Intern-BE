import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRoleManagement1760908800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`IF NOT EXISTS (SELECT 1 FROM permissions WHERE code=N'roles.manage') INSERT INTO permissions(code,name,description) VALUES(N'roles.manage',N'Quản lý vai trò tùy chỉnh',N'Tạo và cập nhật vai trò bổ sung; vai trò hệ thống được bảo vệ')`);
    await q.query(`INSERT INTO role_permissions(roleId,permissionId) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code=N'admin' AND p.code=N'roles.manage' AND NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.roleId=r.id AND rp.permissionId=p.id)`);
  }
  async down(): Promise<void> { throw new Error('Role management grants may be in use; preserve policy and audit before reverting.'); }
}
