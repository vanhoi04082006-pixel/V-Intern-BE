import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateCommunications1763155200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE mail_outbox (
      id uniqueidentifier NOT NULL CONSTRAINT PK_mail_outbox PRIMARY KEY,
      eventKey nvarchar(200) NOT NULL CONSTRAINT UX_mail_event UNIQUE,
      ownerId uniqueidentifier NULL REFERENCES users(id),
      kind nvarchar(32) NOT NULL, recipientHint nvarchar(320) NOT NULL,
      sealedPayload nvarchar(max) NULL, sensitive bit NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0,
      availableAt datetime2 NOT NULL, expiresAt datetime2 NOT NULL,
      leaseToken uniqueidentifier NULL, leaseUntil datetime2 NULL,
      lastCode varchar(64) NULL, lastResendAt datetime2 NULL,
      createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_mail_status CHECK(status IN('pending','sending','accepted','delivered','bounced','uncertain','dead','cancelled','expired')),
      CONSTRAINT CK_mail_attempts CHECK(attempts BETWEEN 0 AND 5)
    )`);
    await q.query('CREATE INDEX IX_mail_due ON mail_outbox(status,availableAt)');
    await q.query(`CREATE TABLE mail_receipts (
      id uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
      mailId uniqueidentifier NOT NULL REFERENCES mail_outbox(id), attempt int NOT NULL,
      outcome varchar(16) NOT NULL, code varchar(64) NOT NULL,
      createdAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
    for (const [code, name] of [['communications.manage', 'Quản lý hàng đợi email']]) {
      await q.query('INSERT INTO permissions(code,name,description) VALUES(@0,@1,@1)', [code, name]);
      await q.query("INSERT INTO role_permissions(roleId,permissionId) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='admin' AND p.code=@0", [code]);
    }
  }
  async down(q: QueryRunner): Promise<void> {
    const [r] = await q.query('SELECT COUNT(*) n FROM mail_outbox WITH(TABLOCKX,HOLDLOCK)');
    if (r.n) throw Error('Preserve mail history before reverting.');
    await q.query('DROP TABLE mail_receipts'); await q.query('DROP TABLE mail_outbox');
  }
}
