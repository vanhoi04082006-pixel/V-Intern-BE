import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M22 — AI plan lifecycle columns (Phase 3 WP-5, ADR-07/08).
 * Drafts persist as plan rows (generating → ready | failed) so instructors can
 * review across page loads; confirms mark rows confirmed. Additive only.
 */
export class AddAiPlanLifecycle1761600000000 implements MigrationInterface {
  name = 'AddAiPlanLifecycle1761600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ai_generation_batches ADD
      status nvarchar(16) NOT NULL CONSTRAINT DF_ai_generation_batches_status DEFAULT 'ready',
      draftJson nvarchar(max) NULL,
      errorJson nvarchar(max) NULL,
      templateVersion int NULL`);
    await q.query(`ALTER TABLE ai_generation_batches ADD CONSTRAINT CK_ai_generation_batches_status
      CHECK (status IN ('generating','ready','failed','confirmed'))`);
    await q.query(`ALTER TABLE ai_generation_batches ADD CONSTRAINT CK_ai_generation_batches_json_nullable
      CHECK ((draftJson IS NULL OR ISJSON(draftJson) = 1) AND (errorJson IS NULL OR ISJSON(errorJson) = 1))`);
    await q.query(`CREATE INDEX IX_ai_generation_batches_session ON ai_generation_batches(sessionId, createdAt DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IX_ai_generation_batches_session ON ai_generation_batches`);
    await q.query(`ALTER TABLE ai_generation_batches DROP CONSTRAINT CK_ai_generation_batches_json_nullable, CK_ai_generation_batches_status, DF_ai_generation_batches_status`);
    await q.query(`ALTER TABLE ai_generation_batches DROP COLUMN status, draftJson, errorJson, templateVersion`);
  }
}
