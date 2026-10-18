import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddInterviewFollowUps1761945600000 implements MigrationInterface {
  name = 'AddInterviewFollowUps1761945600000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE interview_conversation_turns ADD
      followUpStatus nvarchar(16) NULL CONSTRAINT CK_interview_followup_status CHECK(followUpStatus IN ('generating','ready','answered','skipped','failed')),
      followUpPrompt nvarchar(2000) NULL, followUpAnswer nvarchar(max) NULL,
      followUpLeaseId uniqueidentifier NULL, followUpStartedAt datetime2 NULL,
      followUpAnsweredAt datetime2 NULL, followUpAiRunId uniqueidentifier NULL,
      followUpErrorCode nvarchar(64) NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE interview_conversation_turns DROP CONSTRAINT CK_interview_followup_status');
    await q.query(`ALTER TABLE interview_conversation_turns DROP COLUMN followUpStatus,followUpPrompt,followUpAnswer,followUpLeaseId,followUpStartedAt,followUpAnsweredAt,followUpAiRunId,followUpErrorCode`);
  }
}
