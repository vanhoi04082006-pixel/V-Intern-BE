import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateParticipation1763500800000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE participation_policies(
      sessionId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES internship_sessions(id),version int NOT NULL DEFAULT 1,
      warningFrom int NOT NULL DEFAULT 1,penaltyFrom int NOT NULL DEFAULT 2,replacementFrom int NOT NULL DEFAULT 3,
      penaltyPoints decimal(5,2) NULL,penaltyCap decimal(5,2) NOT NULL DEFAULT 20,
      activeFrom datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),updatedBy uniqueidentifier NULL REFERENCES users(id),updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_participation_policy CHECK(warningFrom>=1 AND warningFrom<=penaltyFrom AND penaltyFrom<=replacementFrom AND replacementFrom<=50 AND penaltyCap BETWEEN 0 AND 100 AND (penaltyPoints IS NULL OR penaltyPoints BETWEEN 0 AND 100)))`);
    await q.query(`CREATE TABLE participation_deadlines(
      taskId uniqueidentifier NOT NULL REFERENCES tasks(id),internId uniqueidentifier NOT NULL REFERENCES users(id),
      sessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id),version int NOT NULL DEFAULT 1,
      baseDueAt datetime2 NULL,extensionAt datetime2 NULL,effectiveDueAt datetime2 NULL,
      reason nvarchar(1000) NULL,updatedBy uniqueidentifier NULL REFERENCES users(id),updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_participation_deadline PRIMARY KEY(taskId,internId))`);
    await q.query(`CREATE TABLE participation_incidents(
      id uniqueidentifier NOT NULL PRIMARY KEY,taskId uniqueidentifier NOT NULL REFERENCES tasks(id),internId uniqueidentifier NOT NULL REFERENCES users(id),
      sessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id),deadlineVersion int NOT NULL,policyVersion int NOT NULL,
      dueAt datetime2 NOT NULL,firstSubmissionId uniqueidentifier NULL REFERENCES task_submissions(id),submittedAt datetime2 NULL,
      kind varchar(16) NOT NULL CHECK(kind IN('missing','late')),status varchar(16) NOT NULL CHECK(status IN('active','excused','reversed')),
      ordinal int NOT NULL,points decimal(5,2) NOT NULL,recommendReplacement bit NOT NULL,policySnapshot nvarchar(max) NOT NULL,
      createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      reason nvarchar(1000) NULL,handledBy uniqueidentifier NULL REFERENCES users(id),
      CONSTRAINT UX_participation_incident UNIQUE(taskId,internId),CONSTRAINT CK_participation_points CHECK(points BETWEEN 0 AND 100))`);
    await q.query(
      "CREATE INDEX IX_participation_incidents_scope ON participation_incidents(sessionId,internId,status)",
    );
    await q.query(`CREATE TABLE participation_events(
      id uniqueidentifier NOT NULL PRIMARY KEY,sessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id),
      internId uniqueidentifier NULL REFERENCES users(id),taskId uniqueidentifier NULL REFERENCES tasks(id),
      incidentId uniqueidentifier NULL REFERENCES participation_incidents(id),actorId uniqueidentifier NULL REFERENCES users(id),
      action nvarchar(64) NOT NULL,detail nvarchar(max) NOT NULL,createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME())`);
    await q.query(`CREATE TABLE participation_penalties(
      id uniqueidentifier NOT NULL PRIMARY KEY,incidentId uniqueidentifier NOT NULL REFERENCES participation_incidents(id),
      version int NOT NULL,points decimal(6,2) NOT NULL,kind varchar(16) NOT NULL CHECK(kind IN('deduction','reversal')),
      reason nvarchar(1000) NOT NULL,actorId uniqueidentifier NULL REFERENCES users(id),createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UX_participation_penalty UNIQUE(incidentId,version))`);
    await q.query(`ALTER TABLE task_submissions ADD baseScore decimal(5,2) NULL,latePenalty decimal(5,2) NULL,
      participationIncidentId uniqueidentifier NULL REFERENCES participation_incidents(id)`);
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      "SELECT (SELECT COUNT(*) FROM participation_events)+(SELECT COUNT(*) FROM participation_incidents) n",
    );
    if (row.n) throw Error("Preserve participation history before rollback.");
    // The FK on the added column is unnamed; remove only that reference before its column.
    await q.query(`DECLARE @name sysname,@sql nvarchar(512);
      SELECT @name=f.name FROM sys.foreign_keys f JOIN sys.foreign_key_columns c ON c.constraint_object_id=f.object_id
      WHERE f.parent_object_id=OBJECT_ID('task_submissions') AND COL_NAME(c.parent_object_id,c.parent_column_id)='participationIncidentId';
      IF @name IS NOT NULL BEGIN SET @sql='ALTER TABLE task_submissions DROP CONSTRAINT '+QUOTENAME(@name);EXEC(@sql);END;
      ALTER TABLE task_submissions DROP COLUMN baseScore,latePenalty,participationIncidentId;`);
    await q.query("DROP TABLE participation_penalties");
    await q.query("DROP TABLE participation_events");
    await q.query("DROP TABLE participation_incidents");
    await q.query("DROP TABLE participation_deadlines");
    await q.query("DROP TABLE participation_policies");
  }
}
