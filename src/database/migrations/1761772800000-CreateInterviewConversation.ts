import { MigrationInterface, QueryRunner } from "typeorm";
export class CreateInterviewConversation1761772800000
  implements MigrationInterface
{
  name = "CreateInterviewConversation1761772800000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE interview_conversation_turns (
      questionId uniqueidentifier NOT NULL PRIMARY KEY REFERENCES interview_session_questions(id),
      sessionId uniqueidentifier NOT NULL REFERENCES interview_sessions(id),
      status nvarchar(16) NOT NULL CHECK(status IN ('generating','ready','failed')),
      prompt nvarchar(2000) NULL,
      leaseId uniqueidentifier NOT NULL,
      startedAt datetime2 NOT NULL,
      aiRunId uniqueidentifier NULL REFERENCES ai_runs(id),
      errorCode nvarchar(64) NULL,
      clarificationPrompt nvarchar(2000) NULL,clarificationRunId uniqueidentifier NULL REFERENCES ai_runs(id),
      clarificationLeaseId uniqueidentifier NULL,clarificationStartedAt datetime2 NULL
    )`);
    await q.query(
      "CREATE INDEX IX_interview_conversation_session ON interview_conversation_turns(sessionId)",
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE interview_conversation_turns");
  }
}
