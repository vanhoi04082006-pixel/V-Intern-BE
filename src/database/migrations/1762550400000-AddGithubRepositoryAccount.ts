import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGithubRepositoryAccount1762550400000 implements MigrationInterface {
  name = 'AddGithubRepositoryAccount1762550400000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE github_repository_account (
      id int NOT NULL PRIMARY KEY CHECK(id=1),
      userId uniqueidentifier NOT NULL REFERENCES users(id),
      githubUserId bigint NOT NULL,
      configuredBy uniqueidentifier NOT NULL REFERENCES users(id),
      updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: unknown[] = await q.query('SELECT TOP(1) id FROM github_repository_account');
    if (rows.length) throw new Error('Preserve the configured GitHub repository account before reverting this migration.');
    await q.query('DROP TABLE github_repository_account');
  }
}
