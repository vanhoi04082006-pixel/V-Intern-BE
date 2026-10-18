import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSessionSharing1761686400000 implements MigrationInterface {
  name = "CreateSessionSharing1761686400000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE session_access_requests (
      id uniqueidentifier NOT NULL PRIMARY KEY,
      requesterId uniqueidentifier NOT NULL REFERENCES users(id),
      ownerId uniqueidentifier NOT NULL REFERENCES users(id),
      sessionId uniqueidentifier NULL REFERENCES internship_sessions(id),
      reason nvarchar(2000) NOT NULL,
      status nvarchar(16) NOT NULL CONSTRAINT DF_session_access_status DEFAULT 'pending',
      expiresAt datetime2 NULL,
      createdAt datetime2 NOT NULL CONSTRAINT DF_session_access_created DEFAULT SYSUTCDATETIME(),
      decidedAt datetime2 NULL,
      CONSTRAINT CK_session_access_status CHECK (status IN ('pending','approved','denied','revoked')),
      CONSTRAINT CK_session_access_distinct CHECK (requesterId<>ownerId),
      CONSTRAINT CK_session_access_grant CHECK (status<>'approved' OR (sessionId IS NOT NULL AND expiresAt IS NOT NULL))
    )`);
    await q.query(
      `CREATE UNIQUE INDEX UX_session_access_pending ON session_access_requests(requesterId,ownerId) WHERE status='pending'`,
    );
    await q.query(
      "CREATE INDEX IX_session_access_owner ON session_access_requests(ownerId,createdAt DESC)",
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE session_access_requests");
  }
}
