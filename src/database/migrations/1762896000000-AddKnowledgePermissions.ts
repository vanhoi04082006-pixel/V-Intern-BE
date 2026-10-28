import { MigrationInterface, QueryRunner } from 'typeorm';

const permissions = [
  ['knowledge.read', 'Đọc kho tri thức nội bộ'],
  ['knowledge.manage', 'Biên soạn và lưu trữ tri thức'],
  ['knowledge.publish', 'Duyệt xuất bản tri thức'],
] as const;
export class AddKnowledgePermissions1762896000000 implements MigrationInterface {
  name = 'AddKnowledgePermissions1762896000000';
  async up(q: QueryRunner): Promise<void> {
    for (const [code, name] of permissions) {
      await q.query('IF NOT EXISTS(SELECT 1 FROM permissions WHERE code=@0) INSERT INTO permissions(code,name,description) VALUES(@0,@1,@1)', [code, name]);
      await q.query(`INSERT INTO role_permissions(roleId,permissionId) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
        WHERE r.code='admin' AND p.code=@0 AND NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.roleId=r.id AND rp.permissionId=p.id)`, [code]);
    }
  }
  async down(): Promise<void> { throw new Error('Knowledge grants may be in use; preserve authorization policy and audit before reverting.'); }
}
