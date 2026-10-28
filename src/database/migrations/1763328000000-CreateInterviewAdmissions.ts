import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInterviewAdmissions1763328000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE interview_admissions(
      bookingId uniqueidentifier NOT NULL REFERENCES interview_bookings(id),bookingVersion int NOT NULL,
      applicationId uniqueidentifier NOT NULL REFERENCES cv_applications(id),userId uniqueidentifier NOT NULL REFERENCES users(id),
      slotId uniqueidentifier NOT NULL REFERENCES interview_slots(id),roleCode nvarchar(32) NOT NULL,
      startsAt datetime2 NOT NULL,endsAt datetime2 NOT NULL,
      sessionId uniqueidentifier NULL REFERENCES interview_sessions(id),startedAt datetime2 NULL,noShowAt datetime2 NULL,
      createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_interview_admissions PRIMARY KEY(bookingId,bookingVersion),
      CONSTRAINT CK_interview_admission_outcome CHECK(
        (sessionId IS NOT NULL AND startedAt IS NOT NULL AND noShowAt IS NULL) OR
        (sessionId IS NULL AND startedAt IS NULL AND noShowAt IS NOT NULL)),
      CONSTRAINT CK_interview_admission_version CHECK(bookingVersion>0)
    )`);
    await q.query(
      "CREATE UNIQUE INDEX UX_interview_admission_session ON interview_admissions(sessionId) WHERE sessionId IS NOT NULL",
    );
    await q.query(
      "CREATE INDEX IX_cv_application_user ON cv_applications(userId,createdAt DESC)",
    );
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      "SELECT COUNT(*) n FROM interview_admissions WITH(TABLOCKX,HOLDLOCK)",
    );
    if (row.n)
      throw Error("Preserve interview admission history before rollback.");
    await q.query("DROP TABLE interview_admissions");
    await q.query("DROP INDEX IX_cv_application_user ON cv_applications");
  }
}
