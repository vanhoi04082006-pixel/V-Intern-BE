import { MigrationInterface, QueryRunner } from "typeorm";
export class TrackGithubInvitations1763414400000 implements MigrationInterface {
  async up(q: QueryRunner) {
    // The original check was unnamed; discover only the check on this table's status.
    await q.query(`DECLARE @constraint sysname;
      SELECT @constraint=name FROM sys.check_constraints
      WHERE parent_object_id=OBJECT_ID('session_repo_members') AND definition LIKE '%status%';
      IF @constraint IS NOT NULL BEGIN
        DECLARE @command nvarchar(512)='ALTER TABLE session_repo_members DROP CONSTRAINT '+QUOTENAME(@constraint);
        EXEC(@command);
      END;
      UPDATE session_repo_members SET status='pending' WHERE status='invited';
      ALTER TABLE session_repo_members ADD CONSTRAINT CK_repo_member_status CHECK(status IN('pending','accepted','expired','failed','not_connected'));`);
    await q.query(`ALTER TABLE session_repo_members ADD githubUserId bigint NULL,login nvarchar(100) NULL,
      invitationId bigint NULL,invitedAt datetime2 NULL,expiresAt datetime2 NULL,acceptedAt datetime2 NULL,
      lastCheckedAt datetime2 NULL,lastAttemptAt datetime2 NULL,errorCode nvarchar(64) NULL,
      leaseToken uniqueidentifier NULL,leaseUntil datetime2 NULL`);
    await q.query(`CREATE TABLE github_invitation_events(
      id uniqueidentifier NOT NULL PRIMARY KEY,sessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id),
      userId uniqueidentifier NOT NULL REFERENCES users(id),actorId uniqueidentifier NULL REFERENCES users(id),
      githubUserId bigint NULL,invitationId bigint NULL,action nvarchar(32) NOT NULL,
      previousStatus nvarchar(24) NULL,status nvarchar(24) NOT NULL,errorCode nvarchar(64) NULL,
      source nvarchar(32) NOT NULL,createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      notificationSentAt datetime2 NULL,mailQueuedAt datetime2 NULL
    )`);
    await q.query(
      "CREATE INDEX IX_github_invitation_events_due ON github_invitation_events(action,mailQueuedAt,createdAt)",
    );
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      "SELECT COUNT(*) n FROM github_invitation_events WITH(TABLOCKX,HOLDLOCK)",
    );
    if (row.n) throw Error("Preserve GitHub invitation audit before rollback.");
    await q.query("DROP TABLE github_invitation_events");
    await q.query(
      "ALTER TABLE session_repo_members DROP CONSTRAINT CK_repo_member_status",
    );
    await q.query(
      "UPDATE session_repo_members SET status='invited' WHERE status IN('pending','accepted','expired')",
    );
    await q.query(
      `ALTER TABLE session_repo_members DROP COLUMN githubUserId,login,invitationId,invitedAt,expiresAt,acceptedAt,lastCheckedAt,lastAttemptAt,errorCode,leaseToken,leaseUntil`,
    );
    await q.query(
      "ALTER TABLE session_repo_members ADD CONSTRAINT CK_repo_member_legacy_status CHECK(status IN('invited','not_connected','failed'))",
    );
  }
}
