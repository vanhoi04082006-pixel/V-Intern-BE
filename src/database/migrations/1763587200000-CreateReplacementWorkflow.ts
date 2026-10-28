import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateReplacementWorkflow1763587200000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE participation_replacement_commands(
      id uniqueidentifier NOT NULL PRIMARY KEY,sessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id),
      adviceId uniqueidentifier NOT NULL REFERENCES participation_events(id),incidentId uniqueidentifier NOT NULL REFERENCES participation_incidents(id),
      oldAssignmentId uniqueidentifier NOT NULL REFERENCES assignments(id),targetInternId uniqueidentifier NOT NULL REFERENCES users(id),candidateId uniqueidentifier NOT NULL REFERENCES users(id),
      projectId uniqueidentifier NOT NULL REFERENCES projects(id),roleCode nvarchar(32) NOT NULL REFERENCES career_roles(code),
      previewJson nvarchar(max) NOT NULL CHECK(ISJSON(previewJson)=1),previewHash char(64) NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved')),
      createdById uniqueidentifier NOT NULL REFERENCES users(id),createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      expiresAt datetime2 NOT NULL DEFAULT DATEADD(minute,15,SYSUTCDATETIME()),
      approvedById uniqueidentifier NULL REFERENCES users(id),approvedAt datetime2 NULL,
      resultJson nvarchar(max) NULL CHECK(resultJson IS NULL OR ISJSON(resultJson)=1),
      CHECK((status='pending' AND approvedAt IS NULL AND approvedById IS NULL AND resultJson IS NULL)
        OR (status='approved' AND approvedAt IS NOT NULL AND approvedById IS NOT NULL AND resultJson IS NOT NULL)),
      CHECK(targetInternId<>candidateId))`);
    await q.query(
      `CREATE INDEX IX_replacement_commands_session ON participation_replacement_commands(sessionId,createdAt DESC)`,
    );
    await q.query(`CREATE TABLE participation_replacements(
      id uniqueidentifier NOT NULL PRIMARY KEY,commandId uniqueidentifier NOT NULL UNIQUE REFERENCES participation_replacement_commands(id),
      sessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id),oldAssignmentId uniqueidentifier NOT NULL UNIQUE REFERENCES assignments(id),
      newAssignmentId uniqueidentifier NOT NULL UNIQUE REFERENCES assignments(id),oldInternId uniqueidentifier NOT NULL REFERENCES users(id),newInternId uniqueidentifier NOT NULL REFERENCES users(id),
      reason nvarchar(1000) NOT NULL,approvedById uniqueidentifier NOT NULL REFERENCES users(id),createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      movementJson nvarchar(max) NOT NULL CHECK(ISJSON(movementJson)=1))`);
    await q.query(`CREATE TABLE repository_access_jobs(
      id uniqueidentifier NOT NULL PRIMARY KEY,replacementId uniqueidentifier NOT NULL REFERENCES participation_replacements(id),
      sessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id),userId uniqueidentifier NOT NULL REFERENCES users(id),
      status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN('pending','leased','retry','waiting_user','done','failed')),
      attempts int NOT NULL DEFAULT 0 CHECK(attempts>=0),nextAttemptAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      leaseToken uniqueidentifier NULL,leaseUntil datetime2 NULL,errorCode varchar(80) NULL,
      effectJson nvarchar(max) NULL CHECK(effectJson IS NULL OR ISJSON(effectJson)=1),
      createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UX_repository_access_job UNIQUE(replacementId,userId))`);
    await q.query(
      "CREATE INDEX IX_repository_access_jobs_due ON repository_access_jobs(status,nextAttemptAt,leaseUntil)",
    );
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      "SELECT (SELECT COUNT(*) FROM participation_replacement_commands)+(SELECT COUNT(*) FROM participation_replacements)+(SELECT COUNT(*) FROM repository_access_jobs) n",
    );
    if (row.n)
      throw Error(
        "Preserve replacement approvals and repository access history before rollback.",
      );
    await q.query("DROP TABLE repository_access_jobs");
    await q.query("DROP TABLE participation_replacements");
    await q.query("DROP TABLE participation_replacement_commands");
  }
}
