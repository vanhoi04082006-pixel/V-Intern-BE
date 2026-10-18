import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateGithubDelivery1761859200000 implements MigrationInterface {
  name = "CreateGithubDelivery1761859200000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE github_connections (
      userId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES users(id),
      githubUserId bigint NOT NULL UNIQUE, login nvarchar(100) NOT NULL,
      tokenCiphertext nvarchar(max) NOT NULL, scopes nvarchar(512) NOT NULL,
      expiresAt datetime2 NULL, connectedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
    await q.query(`CREATE TABLE github_oauth_states (
      stateHash char(64) NOT NULL PRIMARY KEY, userId uniqueidentifier NOT NULL REFERENCES users(id),
      verifierCiphertext nvarchar(512) NOT NULL, returnRole nvarchar(16) NOT NULL,
      expiresAt datetime2 NOT NULL, usedAt datetime2 NULL
    )`);
    await q.query(`CREATE TABLE session_repositories (
      sessionId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES internship_sessions(id),
      ownerUserId uniqueidentifier NOT NULL REFERENCES users(id),
      githubOwnerId bigint NOT NULL, ownerLogin nvarchar(100) NOT NULL, repoName nvarchar(100) NOT NULL,
      repoId bigint NULL, htmlUrl nvarchar(512) NULL, defaultBranch nvarchar(200) NULL,
      status nvarchar(16) NOT NULL CHECK(status IN ('provisioning','ready','failed')),
      leaseId uniqueidentifier NOT NULL, updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      errorCode nvarchar(64) NULL
    )`);
    await q.query(`CREATE TABLE session_repo_members (
      sessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id), userId uniqueidentifier NOT NULL REFERENCES users(id),
      status nvarchar(24) NOT NULL CHECK(status IN ('invited','not_connected','failed')),
      updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), PRIMARY KEY(sessionId,userId)
    )`);
    await q.query(
      "ALTER TABLE task_submissions DROP CONSTRAINT CK_task_submissions_status, CK_task_submissions_review",
    );
    await q.query(
      "ALTER TABLE task_submissions ADD CONSTRAINT CK_task_submissions_status CHECK(status IN ('submitted','approved','rework','withdrawn'))",
    );
    await q.query(
      "ALTER TABLE task_submissions ADD CONSTRAINT CK_task_submissions_review CHECK ((status IN ('submitted','withdrawn') AND reviewerId IS NULL AND score IS NULL AND reviewedAt IS NULL) OR (status IN ('approved','rework') AND reviewerId IS NOT NULL AND score IS NOT NULL AND reviewedAt IS NOT NULL))",
    );
    await q.query(`ALTER TABLE task_submissions ADD headSha char(40) NULL,baseSha char(40) NULL,
      repositoryId bigint NULL,sourceKind nvarchar(16) NULL,sourceRef nvarchar(200) NULL,pullNumber int NULL`);
    await q.query(`CREATE TABLE submission_code_reviews (
      id uniqueidentifier NOT NULL PRIMARY KEY, submissionId uniqueidentifier NOT NULL REFERENCES task_submissions(id),
      headSha char(40) NOT NULL, status nvarchar(24) NOT NULL CHECK(status IN ('running','awaiting_instructor','needs_changes','inconclusive','failed')),
      leaseId uniqueidentifier NOT NULL, resultJson nvarchar(max) NULL CHECK(resultJson IS NULL OR ISJSON(resultJson)=1),
      evidenceJson nvarchar(max) NULL CHECK(evidenceJson IS NULL OR ISJSON(evidenceJson)=1),
      inputHash char(64) NULL,aiRunId uniqueidentifier NULL REFERENCES ai_runs(id),errorCode nvarchar(64) NULL,
      rubricVersion nvarchar(32) NOT NULL DEFAULT 'task-review-v1',promptVersion nvarchar(32) NOT NULL DEFAULT 'code-review-v1',
      createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),completedAt datetime2 NULL
    )`);
    await q.query(
      "CREATE INDEX IX_code_reviews_submission ON submission_code_reviews(submissionId,createdAt DESC)",
    );
    await q.query(
      "CREATE UNIQUE INDEX UX_code_reviews_running ON submission_code_reviews(submissionId) WHERE status='running'",
    );
  }
  async down(q: QueryRunner): Promise<void> {
    const withdrawn = (await q.query(
      "SELECT TOP(1) id FROM task_submissions WHERE status='withdrawn'",
    )) as unknown[];
    if (withdrawn.length)
      throw new Error(
        "Cannot revert GitHub delivery while withdrawn submissions exist. Preserve or explicitly migrate history first.",
      );
    await q.query("DROP TABLE submission_code_reviews");
    await q.query(
      "ALTER TABLE task_submissions DROP CONSTRAINT CK_task_submissions_status, CK_task_submissions_review",
    );
    await q.query(
      "ALTER TABLE task_submissions ADD CONSTRAINT CK_task_submissions_status CHECK(status IN ('submitted','approved','rework'))",
    );
    await q.query(
      "ALTER TABLE task_submissions ADD CONSTRAINT CK_task_submissions_review CHECK ((status='submitted' AND reviewerId IS NULL AND score IS NULL AND reviewedAt IS NULL) OR (status<>'submitted' AND reviewerId IS NOT NULL AND score IS NOT NULL AND reviewedAt IS NOT NULL))",
    );
    await q.query(
      "ALTER TABLE task_submissions DROP COLUMN headSha,baseSha,repositoryId,sourceKind,sourceRef,pullNumber",
    );
    await q.query("DROP TABLE session_repo_members");
    await q.query("DROP TABLE session_repositories");
    await q.query("DROP TABLE github_oauth_states");
    await q.query("DROP TABLE github_connections");
  }
}
