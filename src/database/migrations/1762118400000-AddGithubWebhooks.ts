import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddGithubWebhooks1762118400000 implements MigrationInterface {
  name = 'AddGithubWebhooks1762118400000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE session_repositories ADD webhookId bigint NULL,
      webhookStatus nvarchar(24) NOT NULL CONSTRAINT DF_repository_webhook_status DEFAULT 'not_configured' CONSTRAINT CK_repository_webhook_status CHECK(webhookStatus IN ('not_configured','configuring','ready','failed')),
      webhookConfigHash char(64) NULL,webhookLeaseId uniqueidentifier NULL,webhookUpdatedAt datetime2 NULL,webhookErrorCode nvarchar(64) NULL`);
    await q.query('CREATE UNIQUE INDEX UX_session_repositories_repoId ON session_repositories(repoId) WHERE repoId IS NOT NULL');
    await q.query(`CREATE TABLE github_webhook_deliveries (
      deliveryId uniqueidentifier NOT NULL PRIMARY KEY,payloadHash char(64) NOT NULL,eventType nvarchar(32) NOT NULL,
      sessionId uniqueidentifier NULL REFERENCES internship_sessions(id),repositoryId bigint NOT NULL,
      status nvarchar(16) NOT NULL CHECK(status IN ('processed','ignored')),receivedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
    await q.query(`CREATE TABLE github_repository_events (
      id uniqueidentifier NOT NULL PRIMARY KEY,deliveryId uniqueidentifier NOT NULL UNIQUE REFERENCES github_webhook_deliveries(deliveryId),
      sessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id),eventType nvarchar(32) NOT NULL,
      action nvarchar(32) NOT NULL,headSha char(40) NULL,pullNumber int NULL,branch nvarchar(200) NULL,
      receivedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
    await q.query('CREATE INDEX IX_github_events_session_time ON github_repository_events(sessionId,receivedAt DESC,id)');
    await q.query('ALTER TABLE task_submissions ADD observedHeadSha char(40) NULL,sourceChangedAt datetime2 NULL');
    await q.query("CREATE INDEX IX_submission_github_source ON task_submissions(repositoryId,sourceKind,pullNumber,sourceRef) INCLUDE(headSha,observedHeadSha,taskId,internId) WHERE status='submitted'");
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE github_repository_events');
    await q.query('DROP TABLE github_webhook_deliveries');
    await q.query('DROP INDEX UX_session_repositories_repoId ON session_repositories');
    await q.query('DROP INDEX IX_submission_github_source ON task_submissions');
    await q.query('ALTER TABLE task_submissions DROP COLUMN observedHeadSha,sourceChangedAt');
    await q.query('ALTER TABLE session_repositories DROP CONSTRAINT CK_repository_webhook_status,DF_repository_webhook_status');
    await q.query('ALTER TABLE session_repositories DROP COLUMN webhookId,webhookStatus,webhookConfigHash,webhookLeaseId,webhookUpdatedAt,webhookErrorCode');
  }
}
