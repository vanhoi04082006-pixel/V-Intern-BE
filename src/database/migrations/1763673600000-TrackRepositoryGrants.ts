import { MigrationInterface, QueryRunner } from "typeorm";
export class TrackRepositoryGrants1763673600000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE github_repository_grants(
      id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES github_invitation_events(id),
      sourceSessionId uniqueidentifier NOT NULL REFERENCES internship_sessions(id),sourceUserId uniqueidentifier NOT NULL REFERENCES users(id),
      repoId bigint NOT NULL CHECK(repoId>0),githubUserId bigint NOT NULL CHECK(githubUserId>0),githubOwnerId bigint NOT NULL CHECK(githubOwnerId>0),
      invitationId bigint NOT NULL CHECK(invitationId>0),provenance varchar(16) NOT NULL CHECK(provenance='github_201'),
      state varchar(16) NOT NULL DEFAULT 'invited' CHECK(state IN('invited','accepted','revoking','revoked','review')),
      createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),lastObservedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      acceptedAt datetime2 NULL,revokedAt datetime2 NULL,errorCode varchar(80) NULL,
      CONSTRAINT CK_repository_grant_not_owner CHECK(githubUserId<>githubOwnerId),
      CONSTRAINT UX_repository_grant_invitation UNIQUE(repoId,githubUserId,invitationId))`);
    await q.query(
      "CREATE INDEX IX_repository_grants_identity ON github_repository_grants(repoId,githubUserId,state)",
    );
  }
  async down(q: QueryRunner) {
    const [row] = await q.query(
      "SELECT COUNT(*) n FROM github_repository_grants WITH(TABLOCKX,HOLDLOCK)",
    );
    if (row.n) throw Error("Preserve GitHub grant provenance before rollback.");
    await q.query("DROP TABLE github_repository_grants");
  }
}
