import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateAiGenerationBatches1761340800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE ai_generation_batches (
      id uniqueidentifier NOT NULL CONSTRAINT DF_ai_generation_batches_id DEFAULT NEWID() CONSTRAINT PK_ai_generation_batches PRIMARY KEY,
      requestId uniqueidentifier NOT NULL,
      createdById uniqueidentifier NOT NULL CONSTRAINT FK_ai_generation_batches_actor REFERENCES users(id),
      projectId uniqueidentifier NOT NULL CONSTRAINT FK_ai_generation_batches_project REFERENCES projects(id),
      sessionId uniqueidentifier NOT NULL CONSTRAINT FK_ai_generation_batches_session REFERENCES internship_sessions(id),
      summaryJson nvarchar(max) NOT NULL CONSTRAINT CK_ai_generation_batches_json CHECK(ISJSON(summaryJson)=1),
      createdAt datetime2 NOT NULL CONSTRAINT DF_ai_generation_batches_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_ai_generation_batches_request UNIQUE(createdById,requestId)
    )`);
    await q.query('CREATE INDEX IX_ai_generation_batches_actor ON ai_generation_batches(createdById,createdAt DESC)');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE ai_generation_batches');
  }
}
