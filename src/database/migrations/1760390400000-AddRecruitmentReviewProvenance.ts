import { MigrationInterface, QueryRunner } from 'typeorm';

/** Existing AI results retain their provenance; human review never fabricates an ai_run. */
export class AddRecruitmentReviewProvenance1760390400000 implements MigrationInterface {
  name = 'AddRecruitmentReviewProvenance1760390400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE recruitment_results ADD evaluationSource nvarchar(16) NOT NULL CONSTRAINT DF_recruitment_results_source DEFAULT 'ai', evaluatedBy uniqueidentifier NULL");
    await q.query("ALTER TABLE recruitment_results ADD CONSTRAINT CK_recruitment_results_source CHECK (evaluationSource IN ('ai', 'instructor'))");
    await q.query('ALTER TABLE recruitment_results ADD CONSTRAINT FK_recruitment_results_reviewer FOREIGN KEY (evaluatedBy) REFERENCES users(id)');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE recruitment_results DROP CONSTRAINT FK_recruitment_results_reviewer, CK_recruitment_results_source, DF_recruitment_results_source');
    await q.query('ALTER TABLE recruitment_results DROP COLUMN evaluationSource, evaluatedBy');
  }
}
