import { MigrationInterface, QueryRunner } from 'typeorm';

/** No content seed: every usable item must pass the later publication workflow. */
export class CreateKnowledgeLibrary1762809600000 implements MigrationInterface {
  name = 'CreateKnowledgeLibrary1762809600000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE knowledge_entries (
      id uniqueidentifier NOT NULL CONSTRAINT PK_knowledge_entries PRIMARY KEY,
      code nvarchar(80) NOT NULL,
      version int NOT NULL,
      status nvarchar(16) NOT NULL CONSTRAINT DF_knowledge_entries_status DEFAULT N'draft',
      createdAt datetime2 NOT NULL CONSTRAINT DF_knowledge_entries_created DEFAULT SYSUTCDATETIME(),
      updatedAt datetime2 NOT NULL CONSTRAINT DF_knowledge_entries_updated DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_knowledge_entries_code UNIQUE(code),
      CONSTRAINT CK_knowledge_entries_version CHECK(version>0),
      CONSTRAINT CK_knowledge_entries_status CHECK(status IN ('draft','published','archived'))
    )`);
    await q.query('CREATE INDEX IX_knowledge_entries_status ON knowledge_entries(status,id)');
    await q.query(`CREATE TABLE knowledge_revisions (
      entryId uniqueidentifier NOT NULL,
      version int NOT NULL,
      snapshotJson nvarchar(max) NOT NULL,
      sha256 varchar(64) NOT NULL,
      createdBy uniqueidentifier NOT NULL,
      createdAt datetime2 NOT NULL CONSTRAINT DF_knowledge_revisions_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_knowledge_revisions PRIMARY KEY(entryId,version),
      CONSTRAINT FK_knowledge_revisions_entry FOREIGN KEY(entryId) REFERENCES knowledge_entries(id),
      CONSTRAINT FK_knowledge_revisions_actor FOREIGN KEY(createdBy) REFERENCES users(id),
      CONSTRAINT CK_knowledge_revisions_version CHECK(version>0),
      CONSTRAINT CK_knowledge_revisions_json CHECK(ISJSON(snapshotJson)=1 AND DATALENGTH(snapshotJson)<=162000),
      CONSTRAINT CK_knowledge_revisions_hash CHECK(LEN(sha256)=64 AND sha256 COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9a-f]%')
    )`);
    await q.query(`CREATE TRIGGER TR_knowledge_revisions_immutable ON knowledge_revisions
      INSTEAD OF UPDATE, DELETE AS
      BEGIN
        SET NOCOUNT ON;
        THROW 51020, 'Knowledge revisions are immutable; create a new revision.', 1;
      END`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [counts]: Array<{ entries: number; revisions: number }> = await q.query(`SELECT
      (SELECT COUNT(*) FROM knowledge_entries WITH(TABLOCKX,HOLDLOCK)) entries,
      (SELECT COUNT(*) FROM knowledge_revisions WITH(TABLOCKX,HOLDLOCK)) revisions`);
    if (counts.entries || counts.revisions) throw new Error('Preserve knowledge entries and immutable revisions before reverting this migration.');
    await q.query('DROP TABLE knowledge_revisions');
    await q.query('DROP TABLE knowledge_entries');
  }
}
