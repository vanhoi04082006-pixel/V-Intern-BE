import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PHASE 4 — RECRUITMENT + AI INTERVIEW CORE (spec 6/58).
 *
 * Builds on top of the FROZEN Phase 1/2/3 migrations (never modified —
 * docs/database/MIGRATION_POLICY.md). Up = recruitment_profiles,
 * interview_questions, interview_sessions, interview_session_questions,
 * interview_answers, recruitment_results, ai_runs. Down = full reverse
 * drop (no data mutation).
 *
 * Conventions (identical to Phase 1/2/3):
 * - PKs: uniqueidentifier (DB default NEWID as safety)
 * - Strings: nvarchar (explicit lengths / max) — Vietnamese-safe
 * - Timestamps: datetime2 (UTC), defaults SYSUTCDATETIME()
 * - Enum-like columns: nvarchar + named CHECK constraints
 * - All constraints/indexes explicitly named (reviewable, drop-safe)
 *
 * FK DELETE-ACTION DESIGN (spec 58 — error 1785 multi-cascade-path class,
 * already encountered and repaired in Phases 2/3; designed OUT here):
 * - users → recruitment_profiles              CASCADE (single ownership path)
 * - recruitment_profiles → interview_sessions CASCADE (single ownership path)
 * - interview_sessions.userId → users         NO ACTION (2nd path to sessions
 *   would be users→profiles→sessions PLUS users→sessions — restricted;
 *   users are deactivated, never hard-deleted, in this platform)
 * - interview_sessions → interview_session_questions CASCADE
 * - interview_session_questions.questionId → interview_questions SET NULL
 *   (deleting a bank row must never destroy session evidence)
 * - interview_session_questions → interview_answers CASCADE (single path)
 * - interview_answers.sessionId → interview_sessions NO ACTION (2nd path:
 *   sessions→session_questions→answers would duplicate; sessionId is a
 *   denormalized query column)
 * - interview_answers.userId → users          NO ACTION (same rationale)
 * - recruitment_results.profileId → profiles  CASCADE (single path)
 * - recruitment_results.sessionId → sessions  NO ACTION (2nd path:
 *   profiles→sessions AND profiles→results would give profiles two cascade
 *   routes to the same result row)
 * - ai_runs: NO FKs at all — a provenance ledger must survive the deletion
 *   of any referenced row (spec 33); userId/resourceId are plain columns.
 * - recruitment_profiles.currentInterviewSessionId: plain column, NO FK —
 *   a reverse edge to interview_sessions would close a profile↔session
 *   FK cycle; the service maintains the pointer transactionally.
 */
export class CreateRecruitmentAiCoreTables1760131200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);

    // ── Recruitment profiles (one per user, gates the intern lifecycle) ────
    await S(`
      CREATE TABLE recruitment_profiles (
        id uniqueidentifier NOT NULL CONSTRAINT DF_recruitment_profiles_id DEFAULT NEWID()
          CONSTRAINT PK_recruitment_profiles PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        selectedRole nvarchar(32) NULL,
        status nvarchar(32) NOT NULL CONSTRAINT DF_recruitment_profiles_status DEFAULT ('not_started')
          CONSTRAINT CK_recruitment_profiles_status CHECK ([status] IN
            ('not_started','role_selected','interview_in_progress','evaluation_pending','passed','failed')),
        currentInterviewSessionId uniqueidentifier NULL,
        attemptCount int NOT NULL CONSTRAINT DF_recruitment_profiles_attemptCount DEFAULT (0)
          CONSTRAINT CK_recruitment_profiles_attemptCount CHECK ([attemptCount] >= 0),
        recruitedAt datetime2 NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_recruitment_profiles_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_recruitment_profiles_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_recruitment_profiles_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE CASCADE
      );`);
    await S(`CREATE UNIQUE INDEX UX_recruitment_profiles_userId ON recruitment_profiles (userId);`);
    await S(`CREATE INDEX IX_recruitment_profiles_status ON recruitment_profiles (status);`);

    // ── Question bank (internal; rubric NEVER exposed — spec 10/11) ────────
    await S(`
      CREATE TABLE interview_questions (
        id uniqueidentifier NOT NULL CONSTRAINT DF_interview_questions_id DEFAULT NEWID()
          CONSTRAINT PK_interview_questions PRIMARY KEY,
        roleCode nvarchar(32) NOT NULL,
        category nvarchar(16) NOT NULL
          CONSTRAINT CK_interview_questions_category CHECK ([category] IN ('technical','soft')),
        difficulty nvarchar(16) NOT NULL
          CONSTRAINT CK_interview_questions_difficulty CHECK ([difficulty] IN ('easy','medium','hard')),
        prompt nvarchar(max) NOT NULL,
        rubricJson nvarchar(max) NOT NULL,
        isActive bit NOT NULL CONSTRAINT DF_interview_questions_isActive DEFAULT (1),
        sortOrder int NOT NULL CONSTRAINT DF_interview_questions_sortOrder DEFAULT (0),
        createdAt datetime2 NOT NULL CONSTRAINT DF_interview_questions_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_interview_questions_updatedAt DEFAULT SYSUTCDATETIME()
      );`);
    await S(
      `CREATE INDEX IX_interview_questions_role_active ON interview_questions (roleCode, isActive, sortOrder);`,
    );
    await S(
      `CREATE INDEX IX_interview_questions_role_category_active ON interview_questions (roleCode, category, isActive);`,
    );

    // ── Interview sessions (backend timer authority — spec 12/17) ──────────
    await S(`
      CREATE TABLE interview_sessions (
        id uniqueidentifier NOT NULL CONSTRAINT DF_interview_sessions_id DEFAULT NEWID()
          CONSTRAINT PK_interview_sessions PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        profileId uniqueidentifier NOT NULL,
        roleCode nvarchar(32) NOT NULL,
        status nvarchar(24) NOT NULL CONSTRAINT DF_interview_sessions_status DEFAULT ('created')
          CONSTRAINT CK_interview_sessions_status CHECK ([status] IN
            ('created','in_progress','submitted','evaluating','completed','evaluation_failed','expired','cancelled')),
        startedAt datetime2 NULL,
        expiresAt datetime2 NULL,
        submittedAt datetime2 NULL,
        evaluationStartedAt datetime2 NULL,
        evaluatedAt datetime2 NULL,
        attemptNumber int NOT NULL,
        questionCount int NOT NULL
          CONSTRAINT CK_interview_sessions_questionCount CHECK ([questionCount] > 0),
        createdAt datetime2 NOT NULL CONSTRAINT DF_interview_sessions_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_interview_sessions_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_interview_sessions_profile FOREIGN KEY (profileId)
          REFERENCES recruitment_profiles (id) ON DELETE CASCADE,
        -- Deliberate NO ACTION: prevents users → sessions as a SECOND cascade
        -- path (users→profiles→sessions already cascades) — error 1785 class.
        CONSTRAINT FK_interview_sessions_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(`CREATE INDEX IX_interview_sessions_userId_status ON interview_sessions (userId, status);`);
    await S(
      `CREATE INDEX IX_interview_sessions_profileId_status ON interview_sessions (profileId, status);`,
    );

    // ── Session question snapshots (historical reproducibility — spec 13) ──
    await S(`
      CREATE TABLE interview_session_questions (
        id uniqueidentifier NOT NULL CONSTRAINT DF_interview_session_questions_id DEFAULT NEWID()
          CONSTRAINT PK_interview_session_questions PRIMARY KEY,
        sessionId uniqueidentifier NOT NULL,
        questionId uniqueidentifier NULL,
        position int NOT NULL CONSTRAINT CK_interview_session_questions_position CHECK ([position] BETWEEN 1 AND 100),
        category nvarchar(16) NOT NULL,
        promptSnapshot nvarchar(max) NOT NULL,
        difficultySnapshot nvarchar(16) NOT NULL,
        rubricSnapshot nvarchar(max) NOT NULL,
        CONSTRAINT FK_interview_session_questions_session FOREIGN KEY (sessionId)
          REFERENCES interview_sessions (id) ON DELETE CASCADE,
        CONSTRAINT FK_interview_session_questions_question FOREIGN KEY (questionId)
          REFERENCES interview_questions (id) ON DELETE SET NULL
      );`);
    await S(
      `CREATE UNIQUE INDEX UX_interview_session_questions_sessionId_position ON interview_session_questions (sessionId, position);`,
    );
    await S(
      `CREATE INDEX IX_interview_session_questions_questionId ON interview_session_questions (questionId);`,
    );

    // ── Answers (one per session question, immutable after submit) ─────────
    await S(`
      CREATE TABLE interview_answers (
        id uniqueidentifier NOT NULL CONSTRAINT DF_interview_answers_id DEFAULT NEWID()
          CONSTRAINT PK_interview_answers PRIMARY KEY,
        sessionQuestionId uniqueidentifier NOT NULL,
        sessionId uniqueidentifier NOT NULL,
        userId uniqueidentifier NOT NULL,
        answerText nvarchar(max) NOT NULL,
        answeredAt datetime2 NOT NULL CONSTRAINT DF_interview_answers_answeredAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_interview_answers_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_interview_answers_sessionQuestion FOREIGN KEY (sessionQuestionId)
          REFERENCES interview_session_questions (id) ON DELETE CASCADE,
        -- Denormalized query columns; NO ACTION avoids duplicate cascade
        -- paths (session→session_questions→answers already cascades).
        CONSTRAINT FK_interview_answers_session FOREIGN KEY (sessionId)
          REFERENCES interview_sessions (id) ON DELETE NO ACTION,
        CONSTRAINT FK_interview_answers_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(
      `CREATE UNIQUE INDEX UX_interview_answers_sessionQuestionId ON interview_answers (sessionQuestionId);`,
    );
    await S(`CREATE INDEX IX_interview_answers_sessionId ON interview_answers (sessionId);`);

    // ── Authoritative results (unique per session; backend decision) ───────
    await S(`
      CREATE TABLE recruitment_results (
        id uniqueidentifier NOT NULL CONSTRAINT DF_recruitment_results_id DEFAULT NEWID()
          CONSTRAINT PK_recruitment_results PRIMARY KEY,
        profileId uniqueidentifier NOT NULL,
        sessionId uniqueidentifier NOT NULL,
        aiRunId uniqueidentifier NULL,
        technicalScore decimal(5,1) NOT NULL,
        softSkillScore decimal(5,1) NOT NULL,
        overallScore decimal(5,1) NOT NULL,
        decision nvarchar(16) NOT NULL
          CONSTRAINT CK_recruitment_results_decision CHECK ([decision] IN ('passed','failed')),
        strengthsJson nvarchar(max) NOT NULL,
        weaknessesJson nvarchar(max) NOT NULL,
        criteriaJson nvarchar(max) NOT NULL,
        feedback nvarchar(max) NOT NULL,
        recommendedRole nvarchar(32) NULL,
        model nvarchar(128) NOT NULL,
        promptVersion nvarchar(64) NOT NULL,
        evaluatedAt datetime2 NOT NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_recruitment_results_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_recruitment_results_profile FOREIGN KEY (profileId)
          REFERENCES recruitment_profiles (id) ON DELETE CASCADE,
        -- Deliberate NO ACTION: profiles→results (CASCADE) must remain the
        -- single cascade route; profiles→sessions→results would be a second.
        CONSTRAINT FK_recruitment_results_session FOREIGN KEY (sessionId)
          REFERENCES interview_sessions (id) ON DELETE NO ACTION,
        CONSTRAINT CK_recruitment_results_scores CHECK (
          [technicalScore] BETWEEN 0 AND 100
          AND [softSkillScore] BETWEEN 0 AND 100
          AND [overallScore] BETWEEN 0 AND 100
        )
      );`);
    await S(`CREATE UNIQUE INDEX UX_recruitment_results_sessionId ON recruitment_results (sessionId);`);
    await S(`CREATE INDEX IX_recruitment_results_profileId ON recruitment_results (profileId);`);

    // ── AI provenance ledger (no FKs by design — spec 33) ──────────────────
    await S(`
      CREATE TABLE ai_runs (
        id uniqueidentifier NOT NULL CONSTRAINT DF_ai_runs_id DEFAULT NEWID()
          CONSTRAINT PK_ai_runs PRIMARY KEY,
        feature nvarchar(64) NOT NULL,
        provider nvarchar(32) NOT NULL,
        model nvarchar(128) NOT NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_ai_runs_status DEFAULT ('running')
          CONSTRAINT CK_ai_runs_status CHECK ([status] IN ('running','succeeded','failed')),
        userId uniqueidentifier NULL,
        resourceType nvarchar(64) NOT NULL,
        resourceId nvarchar(64) NOT NULL,
        promptVersion nvarchar(64) NOT NULL,
        startedAt datetime2 NOT NULL CONSTRAINT DF_ai_runs_startedAt DEFAULT SYSUTCDATETIME(),
        completedAt datetime2 NULL,
        latencyMs int NULL,
        inputTokens int NULL,
        outputTokens int NULL,
        errorCode nvarchar(64) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_ai_runs_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_ai_runs_errorCode CHECK ([errorCode] IS NULL OR LEN([errorCode]) <= 64)
      );`);
    await S(`CREATE INDEX IX_ai_runs_resource ON ai_runs (resourceType, resourceId, status);`);
    await S(`CREATE INDEX IX_ai_runs_userId ON ai_runs (userId);`);
    await S(`CREATE INDEX IX_ai_runs_status_createdAt ON ai_runs (status, createdAt);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);
    // Reverse dependency order — safe full rollback.
    await S(`DROP TABLE IF EXISTS ai_runs;`);
    await S(`DROP TABLE IF EXISTS recruitment_results;`);
    await S(`DROP TABLE IF EXISTS interview_answers;`);
    await S(`DROP TABLE IF EXISTS interview_session_questions;`);
    await S(`DROP TABLE IF EXISTS interview_sessions;`);
    await S(`DROP TABLE IF EXISTS interview_questions;`);
    await S(`DROP TABLE IF EXISTS recruitment_profiles;`);
  }
}
