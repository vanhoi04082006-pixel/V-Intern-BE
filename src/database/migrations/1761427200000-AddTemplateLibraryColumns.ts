import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M19 — Project Template library columns (Phase 3 WP-3, ADR-01).
 * Additive only: existing rows keep working (definitionJson untouched).
 */
export class AddTemplateLibraryColumns1761427200000 implements MigrationInterface {
  name = 'AddTemplateLibraryColumns1761427200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE project_templates ADD code nvarchar(64) NULL,
      category nvarchar(64) NULL,
      difficulty nvarchar(16) NOT NULL CONSTRAINT DF_project_templates_difficulty DEFAULT 'beginner',
      status nvarchar(16) NOT NULL CONSTRAINT DF_project_templates_status DEFAULT 'active',
      archivedAt datetime2 NULL`);
    // Backfill deterministic codes for pre-existing rows, then enforce NOT NULL + UNIQUE.
    await q.query(`UPDATE project_templates SET code = 'TPL-' + UPPER(LEFT(CAST(id AS nvarchar(36)), 8)) WHERE code IS NULL`);
    await q.query(`ALTER TABLE project_templates ALTER COLUMN code nvarchar(64) NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX UX_project_templates_code ON project_templates(code)`);
    await q.query(`ALTER TABLE project_templates ADD CONSTRAINT CK_project_templates_difficulty
      CHECK (difficulty IN ('beginner','intermediate','advanced'))`);
    await q.query(`ALTER TABLE project_templates ADD CONSTRAINT CK_project_templates_status
      CHECK (status IN ('active','archived'))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE project_templates DROP CONSTRAINT CK_project_templates_status, CK_project_templates_difficulty, DF_project_templates_status, DF_project_templates_difficulty`);
    await q.query(`DROP INDEX UX_project_templates_code ON project_templates`);
    await q.query(`ALTER TABLE project_templates DROP COLUMN code, category, difficulty, status, archivedAt`);
  }
}
