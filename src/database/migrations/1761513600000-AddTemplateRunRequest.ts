import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M20 — template_runs request tracking (Phase 3 WP-3, ADR-08).
 * requesterId + requestId power idempotent Start (replays return the existing
 * run instead of minting duplicate sessions/projects). Nullable so historic
 * runs stay valid; filtered UNIQUE only constrains keyed requests.
 */
export class AddTemplateRunRequest1761513600000 implements MigrationInterface {
  name = 'AddTemplateRunRequest1761513600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE template_runs ADD requesterId uniqueidentifier NULL REFERENCES users(id),
      requestId uniqueidentifier NULL`);
    await q.query(`CREATE UNIQUE INDEX UX_template_runs_request ON template_runs(requesterId, requestId)
      WHERE requestId IS NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX UX_template_runs_request ON template_runs`);
    await q.query(`ALTER TABLE template_runs DROP COLUMN requesterId, requestId`);
  }
}
