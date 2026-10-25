import { MigrationInterface, QueryRunner } from "typeorm";
export class SeparateGithubInvitationRequests1763457600000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE session_repo_members ADD lastRequestedAt datetime2 NULL",
    );
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      "SELECT COUNT(*) n FROM session_repo_members WHERE lastRequestedAt IS NOT NULL",
    );
    if (row.n)
      throw Error(
        "Preserve manual GitHub invitation request history before rollback.",
      );
    await q.query(
      "ALTER TABLE session_repo_members DROP COLUMN lastRequestedAt",
    );
  }
}
