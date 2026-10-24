import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateApplications1763241600000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE recruitment_rounds(
      id uniqueidentifier NOT NULL PRIMARY KEY,ownerId uniqueidentifier NOT NULL REFERENCES users(id),
      name nvarchar(160) NOT NULL,status varchar(16) NOT NULL DEFAULT 'draft',
      opensAt datetime2 NOT NULL,closesAt datetime2 NOT NULL,createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_round_status CHECK(status IN('draft','open','closed')), CONSTRAINT CK_round_dates CHECK(closesAt>opensAt)
    )`);
    await q.query(`CREATE TABLE interview_slots(
      id uniqueidentifier NOT NULL PRIMARY KEY,roundId uniqueidentifier NOT NULL REFERENCES recruitment_rounds(id),
      roleCode nvarchar(32) NOT NULL REFERENCES career_roles(code),startsAt datetime2 NOT NULL,endsAt datetime2 NOT NULL,timezone nvarchar(64) NOT NULL,
      capacity int NOT NULL,minimumPreparationMinutes int NOT NULL,credentialsLeadMinutes int NOT NULL,status varchar(16) NOT NULL DEFAULT 'open',
      CONSTRAINT CK_slot_status CHECK(status IN('open','closed')),CONSTRAINT CK_slot_dates CHECK(endsAt>startsAt),CONSTRAINT CK_slot_capacity CHECK(capacity BETWEEN 1 AND 100),
      CONSTRAINT CK_slot_prepare CHECK(minimumPreparationMinutes BETWEEN 30 AND 10080 AND credentialsLeadMinutes BETWEEN 5 AND minimumPreparationMinutes)
    )`);
    await q.query(`CREATE TABLE cv_applications(
      id uniqueidentifier NOT NULL PRIMARY KEY,roundId uniqueidentifier NOT NULL REFERENCES recruitment_rounds(id),
      email nvarchar(320) NOT NULL,fullName nvarchar(128) NOT NULL,consentVersion varchar(32) NOT NULL,consentedAt datetime2 NOT NULL,
      status varchar(24) NOT NULL DEFAULT 'unverified',verificationHash char(64) NULL,verificationExpiresAt datetime2 NULL,verifiedAt datetime2 NULL,
      capabilityHash char(64) NULL,capabilityExpiresAt datetime2 NULL,lastVerificationSentAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      fileId uniqueidentifier NULL,fileFormat varchar(8) NULL,fileSha256 char(64) NULL,segmentsJson nvarchar(max) NULL,revision int NOT NULL DEFAULT 1,
      factsJson nvarchar(max) NULL,matchJson nvarchar(max) NULL,matchedRole nvarchar(32) NULL REFERENCES career_roles(code),processingAttempt int NOT NULL DEFAULT 0,
      userId uniqueidentifier NULL REFERENCES users(id),leaseToken uniqueidentifier NULL,leaseUntil datetime2 NULL,lastCode varchar(64) NULL,
      createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UX_cv_round_email UNIQUE(roundId,email),
      CONSTRAINT CK_cv_status CHECK(status IN('unverified','queued','analyzing','needs_information','waitlisted','booked','cancelled','deferred','failed'))
    )`);
    await q.query(
      "CREATE INDEX IX_cv_queue ON cv_applications(status,leaseUntil)",
    );
    await q.query(
      "CREATE UNIQUE INDEX UX_cv_verification ON cv_applications(verificationHash) WHERE verificationHash IS NOT NULL",
    );
    await q.query(
      "CREATE UNIQUE INDEX UX_cv_capability ON cv_applications(capabilityHash) WHERE capabilityHash IS NOT NULL",
    );
    await q.query(`CREATE TABLE application_events(
      id uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,applicationId uniqueidentifier NOT NULL REFERENCES cv_applications(id),
      kind varchar(40) NOT NULL,message nvarchar(1000) NOT NULL,createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
    await q.query(`CREATE TABLE interview_bookings(
      id uniqueidentifier NOT NULL PRIMARY KEY,applicationId uniqueidentifier NOT NULL CONSTRAINT UX_booking_application UNIQUE REFERENCES cv_applications(id),
      slotId uniqueidentifier NOT NULL REFERENCES interview_slots(id),version int NOT NULL DEFAULT 1,status varchar(16) NOT NULL DEFAULT 'confirmed',
      createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),CONSTRAINT CK_booking_status CHECK(status IN('confirmed','cancelled'))
    )`);
    await q.query(
      "CREATE INDEX IX_booking_capacity ON interview_bookings(slotId,status)",
    );
    await q.query(
      "ALTER TABLE users ADD mustChangePassword bit NOT NULL DEFAULT 0, temporaryPasswordExpiresAt datetime2 NULL, authVersion int NOT NULL DEFAULT 0",
    );
    await q.query(
      "IF NOT EXISTS(SELECT 1 FROM permissions WHERE code='applications.manage') INSERT INTO permissions(code,name,description) VALUES('applications.manage',N'Quản lý hồ sơ và lịch tuyển',N'Quản lý hồ sơ trong đợt tuyển được giao')",
    );
    await q.query(
      "INSERT INTO role_permissions(roleId,permissionId) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code IN('admin','instructor') AND p.code='applications.manage' AND NOT EXISTS(SELECT 1 FROM role_permissions rp WHERE rp.roleId=r.id AND rp.permissionId=p.id)",
    );
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      "SELECT (SELECT COUNT(*) FROM cv_applications WITH(TABLOCKX,HOLDLOCK))+(SELECT COUNT(*) FROM recruitment_rounds WITH(TABLOCKX,HOLDLOCK))+(SELECT COUNT(*) FROM users WITH(TABLOCKX,HOLDLOCK) WHERE mustChangePassword=1 OR temporaryPasswordExpiresAt IS NOT NULL OR authVersion<>0) n",
    );
    if (row.n) throw Error("Preserve candidate data before rollback.");
    await q.query("DROP TABLE interview_bookings");
    await q.query("DROP TABLE application_events");
    await q.query("DROP TABLE cv_applications");
    await q.query("DROP TABLE interview_slots");
    await q.query("DROP TABLE recruitment_rounds");
    // Empty round-trip only. Never remove an active auth revocation/password-change state.
    const defaults: Array<{ name: string }> = await q.query("SELECT d.name FROM sys.default_constraints d JOIN sys.columns c ON c.object_id=d.parent_object_id AND c.column_id=d.parent_column_id WHERE d.parent_object_id=OBJECT_ID('users') AND c.name IN('mustChangePassword','temporaryPasswordExpiresAt','authVersion')");
    for (const d of defaults) await q.query(`ALTER TABLE users DROP CONSTRAINT [${d.name.replace(/]/g, ']]')}]`);
    await q.query('ALTER TABLE users DROP COLUMN mustChangePassword,temporaryPasswordExpiresAt,authVersion');
  }
}
