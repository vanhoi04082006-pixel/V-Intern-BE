import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateImportedReviews1760995200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE imported_reviews(
      id uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(), sourceKey nvarchar(128) NOT NULL UNIQUE,
      sourceImage nvarchar(256) NOT NULL, projectId uniqueidentifier NOT NULL REFERENCES projects(id),
      studentId uniqueidentifier NOT NULL REFERENCES users(id), prNumber int NOT NULL,
      title nvarchar(256) NOT NULL, score decimal(4,1) NOT NULL CHECK(score BETWEEN 0 AND 100),
      status nvarchar(32) NOT NULL CHECK(status IN ('passed','needs_review','failed')),
      feedback nvarchar(4000) NULL, occurredAt datetime2 NOT NULL,
      importedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      version int NOT NULL DEFAULT 1
    )`);
    await q.query(`CREATE INDEX IX_imported_reviews_project ON imported_reviews(projectId,occurredAt)`);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows=await q.query('SELECT TOP(1) id FROM imported_reviews');
    if(rows.length)throw new Error('Preserve imported review records before reverting.');
    await q.query('DROP TABLE imported_reviews');
  }
}
