import { MigrationInterface, QueryRunner } from 'typeorm';
import { createHash } from 'crypto';

export class CreateTemplateMaterials1763068800000 implements MigrationInterface {
  name = 'CreateTemplateMaterials1763068800000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE project_template_revisions (
      templateId uniqueidentifier NOT NULL,version int NOT NULL,definitionJson nvarchar(max) NOT NULL,sha256 varchar(64) NOT NULL,
      createdById uniqueidentifier NULL,createdAt datetime2 NOT NULL CONSTRAINT DF_template_revisions_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_project_template_revisions PRIMARY KEY(templateId,version),
      CONSTRAINT FK_template_revisions_template FOREIGN KEY(templateId) REFERENCES project_templates(id),
      CONSTRAINT FK_template_revisions_actor FOREIGN KEY(createdById) REFERENCES users(id),
      CONSTRAINT CK_template_revisions_version CHECK(version>0),CONSTRAINT CK_template_revisions_json CHECK(ISJSON(definitionJson)=1)
    )`);
    await q.query(`CREATE TABLE project_template_assessments (
      templateId uniqueidentifier NOT NULL,version int NOT NULL,assessmentJson nvarchar(max) NOT NULL,sha256 varchar(64) NOT NULL,
      CONSTRAINT PK_project_template_assessments PRIMARY KEY(templateId,version),
      CONSTRAINT FK_template_assessments_revision FOREIGN KEY(templateId,version) REFERENCES project_template_revisions(templateId,version),
      CONSTRAINT CK_template_assessments_json CHECK(ISJSON(assessmentJson)=1 AND DATALENGTH(assessmentJson)<=1048576)
    )`);
    // Only actual current definitions are known. Historical run snapshots stay untouched;
    // do not invent old central revisions or change the version of an existing template.
    for (let offset = 0; ; offset += 100) {
      const rows: Array<{ id: string; version: number; definitionJson: string; createdById: string; createdAt: Date }> = await q.query('SELECT id,version,definitionJson,createdById,createdAt FROM project_templates ORDER BY id OFFSET @0 ROWS FETCH NEXT 100 ROWS ONLY', [offset]);
      if (!rows.length) break;
      for (const row of rows) await q.query('INSERT INTO project_template_revisions(templateId,version,definitionJson,sha256,createdById,createdAt) VALUES(@0,@1,@2,@3,@4,@5)',
        [row.id, row.version, row.definitionJson, createHash('sha256').update(row.definitionJson, 'utf8').digest('hex'), row.createdById, row.createdAt]);
    }
    for (const table of ['project_template_revisions', 'project_template_assessments']) await q.query(`CREATE TRIGGER TR_${table}_immutable ON ${table} INSTEAD OF UPDATE, DELETE AS BEGIN SET NOCOUNT ON; THROW 51030, 'Template revisions and assessments are immutable; append a new version.', 1; END`);
    for (const [code, name] of [['templates.assessment.read', 'Đọc tài liệu chấm mẫu'], ['templates.assessment.manage', 'Biên soạn tài liệu chấm mẫu']]) {
      await q.query('IF NOT EXISTS(SELECT 1 FROM permissions WHERE code=@0) INSERT INTO permissions(code,name,description) VALUES(@0,@1,@1)', [code, name]);
      await q.query("INSERT INTO role_permissions(roleId,permissionId) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code IN('admin','instructor') AND p.code=@0 AND NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.roleId=r.id AND rp.permissionId=p.id)", [code]);
    }
  }
  async down(q: QueryRunner): Promise<void> {
    const [row]: Array<{ count: number }> = await q.query('SELECT COUNT(*) count FROM project_template_revisions WITH(TABLOCKX,HOLDLOCK)');
    if (row.count) throw Error('Preserve template revisions and assessments before reverting this migration.');
    await q.query('DROP TABLE project_template_assessments'); await q.query('DROP TABLE project_template_revisions');
    // Retain permission records: existing role/group policy may refer to them.
  }
}
