import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddQuestionVersions1762204800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE interview_questions ADD version int NOT NULL CONSTRAINT DF_interview_questions_version DEFAULT 1');
    await q.query('CREATE INDEX IX_interview_questions_admin ON interview_questions(roleCode,category,isActive,sortOrder) INCLUDE(version,difficulty)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX IX_interview_questions_admin ON interview_questions');
    await q.query('ALTER TABLE interview_questions DROP CONSTRAINT DF_interview_questions_version');
    await q.query('ALTER TABLE interview_questions DROP COLUMN version');
  }
}
