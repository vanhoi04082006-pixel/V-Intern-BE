import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateProjectTemplates1760563200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE project_templates(id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(), name nvarchar(256) NOT NULL,
      definitionJson nvarchar(max) NOT NULL CHECK(ISJSON(definitionJson)=1), version int NOT NULL DEFAULT 1,
      createdById uniqueidentifier NOT NULL REFERENCES users(id), createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME())`);
    await q.query(`CREATE TABLE template_runs(id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(), templateId uniqueidentifier NOT NULL REFERENCES project_templates(id),
      projectId uniqueidentifier NOT NULL UNIQUE REFERENCES projects(id), sessionId uniqueidentifier NOT NULL UNIQUE REFERENCES internship_sessions(id),
      templateVersion int NOT NULL, snapshotJson nvarchar(max) NOT NULL CHECK(ISJSON(snapshotJson)=1), createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME())`);
    await q.query(`CREATE TABLE task_specs(taskId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES tasks(id), specJson nvarchar(max) NOT NULL CHECK(ISJSON(specJson)=1))`);
    await q.query(`CREATE TABLE project_change_requests(id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(), projectId uniqueidentifier NOT NULL REFERENCES projects(id),
      title nvarchar(256) NOT NULL, description nvarchar(4000) NOT NULL, reason nvarchar(4000) NOT NULL, dueDate datetime2 NULL,
      status nvarchar(16) NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','applied')), taskId uniqueidentifier NULL REFERENCES tasks(id),
      createdById uniqueidentifier NOT NULL REFERENCES users(id), createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), appliedAt datetime2 NULL,
      CHECK((status='proposed' AND taskId IS NULL AND appliedAt IS NULL) OR (status='applied' AND taskId IS NOT NULL AND appliedAt IS NOT NULL)))`);
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of ['project_change_requests','task_specs','template_runs','project_templates']) await q.query(`DROP TABLE ${table}`);
  }
}
