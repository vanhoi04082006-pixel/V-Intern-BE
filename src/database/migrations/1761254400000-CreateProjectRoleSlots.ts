import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateProjectRoleSlots1761254400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE project_role_slots (
      projectId uniqueidentifier NOT NULL CONSTRAINT FK_project_role_slots_project REFERENCES projects(id) ON DELETE CASCADE,
      roleCode nvarchar(64) NOT NULL,
      requiredCount int NOT NULL CONSTRAINT CK_project_role_slots_count CHECK(requiredCount >= 1 AND requiredCount <= 50),
      createdAt datetime2 NOT NULL CONSTRAINT DF_project_role_slots_created DEFAULT SYSUTCDATETIME(),
      updatedAt datetime2 NOT NULL CONSTRAINT DF_project_role_slots_updated DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_project_role_slots PRIMARY KEY (projectId, roleCode)
    )`);
    await q.query('CREATE INDEX IX_project_role_slots_project ON project_role_slots(projectId)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE project_role_slots');
  }
}
