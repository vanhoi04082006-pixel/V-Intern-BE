import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateTaskSubmissions1760476800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE task_submissions (
      id uniqueidentifier NOT NULL CONSTRAINT PK_task_submissions PRIMARY KEY DEFAULT NEWID(),
      taskId uniqueidentifier NOT NULL CONSTRAINT FK_task_submissions_task REFERENCES tasks(id),
      internId uniqueidentifier NOT NULL CONSTRAINT FK_task_submissions_intern REFERENCES users(id),
      prUrl nvarchar(512) NOT NULL, summary nvarchar(4000) NOT NULL,
      status nvarchar(16) NOT NULL CONSTRAINT CK_task_submissions_status CHECK (status IN ('submitted','approved','rework')),
      score decimal(4,1) NULL CONSTRAINT CK_task_submissions_score CHECK (score BETWEEN 0 AND 100),
      rubricJson nvarchar(max) NULL, rubricVersion nvarchar(32) NOT NULL DEFAULT 'task-review-v1',
      feedback nvarchar(4000) NULL, reviewerId uniqueidentifier NULL CONSTRAINT FK_task_submissions_reviewer REFERENCES users(id),
      submittedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), reviewedAt datetime2 NULL,
      CONSTRAINT CK_task_submissions_review CHECK ((status='submitted' AND reviewerId IS NULL AND score IS NULL AND reviewedAt IS NULL) OR (status<>'submitted' AND reviewerId IS NOT NULL AND score IS NOT NULL AND reviewedAt IS NOT NULL)),
      CONSTRAINT CK_task_submissions_rubric CHECK (rubricJson IS NULL OR ISJSON(rubricJson)=1)
    )`);
    await runner.query(`CREATE UNIQUE INDEX UX_task_submissions_pending ON task_submissions(taskId) WHERE status='submitted'`);
    await runner.query(`CREATE INDEX IX_task_submissions_task_time ON task_submissions(taskId,submittedAt)`);
  }
  async down(runner: QueryRunner): Promise<void> { await runner.query('DROP TABLE task_submissions'); }
}
