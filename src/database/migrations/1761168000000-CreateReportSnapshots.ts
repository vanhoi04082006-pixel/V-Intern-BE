import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateReportSnapshots1761168000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE report_snapshots (
      id uniqueidentifier NOT NULL CONSTRAINT DF_report_snapshots_id DEFAULT NEWID() CONSTRAINT PK_report_snapshots PRIMARY KEY,
      requestId uniqueidentifier NOT NULL, createdById uniqueidentifier NOT NULL CONSTRAINT FK_report_snapshots_actor REFERENCES users(id),
      projectId uniqueidentifier NOT NULL CONSTRAINT FK_report_snapshots_project REFERENCES projects(id),
      title nvarchar(256) NOT NULL, kind nvarchar(20) NOT NULL CONSTRAINT CK_report_snapshots_kind CHECK(kind IN ('progress','performance','evaluation','review','risk')),
      snapshotJson nvarchar(max) NOT NULL CONSTRAINT CK_report_snapshots_json CHECK(ISJSON(snapshotJson)=1),
      createdAt datetime2 NOT NULL CONSTRAINT DF_report_snapshots_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_report_snapshots_request UNIQUE(createdById,requestId)
    )`);
    await q.query('CREATE INDEX IX_report_snapshots_actor_date ON report_snapshots(createdById,createdAt DESC)');
  }
  async down(q: QueryRunner): Promise<void> {
    if ((await q.query('SELECT TOP(1) id FROM report_snapshots')).length) throw new Error('Preserve report snapshots before reverting.');
    await q.query('DROP TABLE report_snapshots');
  }
}
