import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddGithubTokenRotation1762464000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE github_connections ADD refreshTokenCiphertext nvarchar(max) NULL,refreshExpiresAt datetime2 NULL,
      tokenVersion int NOT NULL CONSTRAINT DF_github_token_version DEFAULT 1,
      refreshLeaseId uniqueidentifier NULL,refreshLeaseExpiresAt datetime2 NULL`);
    await q.query('ALTER TABLE github_oauth_states ADD connectionVersion int NOT NULL CONSTRAINT DF_github_state_connection_version DEFAULT 0');
    await q.query('CREATE INDEX IX_github_oauth_states_user ON github_oauth_states(userId,expiresAt)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX IX_github_oauth_states_user ON github_oauth_states');
    await q.query('ALTER TABLE github_oauth_states DROP CONSTRAINT DF_github_state_connection_version');
    await q.query('ALTER TABLE github_oauth_states DROP COLUMN connectionVersion');
    await q.query('ALTER TABLE github_connections DROP CONSTRAINT DF_github_token_version');
    await q.query('ALTER TABLE github_connections DROP COLUMN refreshTokenCiphertext,refreshExpiresAt,tokenVersion,refreshLeaseId,refreshLeaseExpiresAt');
  }
}
