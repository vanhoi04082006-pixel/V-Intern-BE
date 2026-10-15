import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateLearningAlertDispatches1762291200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE learning_alert_dispatches (
      eventKey nvarchar(256) NOT NULL,userId uniqueidentifier NOT NULL REFERENCES users(id),
      notificationId uniqueidentifier NULL REFERENCES notifications(id) ON DELETE SET NULL,
      createdAt datetime2 NOT NULL CONSTRAINT DF_learning_alerts_created DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_learning_alert_dispatches PRIMARY KEY(eventKey,userId))`);
    await q.query('CREATE INDEX IX_learning_alert_dispatches_created ON learning_alert_dispatches(createdAt)');
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE learning_alert_dispatches'); }
}
