import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PHASE 6 — AI MENTOR + AI EVALUATION ASSISTANCE + AI RECOMMENDATIONS.
 *
 * Builds on top of the FROZEN Phase 1-5 migrations (never modified —
 * docs/database/MIGRATION_POLICY.md). Up = ai_mentor_conversations,
 * ai_mentor_messages, evaluation_ai_suggestions, ai_recommendation_snapshots.
 * Down = full reverse drop (no data mutation).
 *
 * DESIGN (docs/architecture/ai-mentor.md — authority contracts):
 * - ai_mentor_messages.role is CHECK-bounded to ('user','assistant'); the
 *   hidden system prompt is NEVER persisted as a chat row (spec 10/53).
 * - ai_mentor_messages.aiRunId is a plain indexed column (NO FK): AIRun
 *   provenance must survive any conversation retention action, exactly like
 *   every other ai_runs consumer (Phase 4 convention).
 * - evaluation_ai_suggestions is an APPEND-ONLY instructor workspace: every
 *   generation inserts a NEW row (history preserved, nothing overwritten in
 *   place — spec 25). It has ZERO authority over evaluations/evaluation_scores.
 * - ai_recommendation_snapshots stores the deterministic source-fact
 *   snapshot + its sha256 sourceHash: a recommendation always remains
 *   explainable from its own snapshot even after live metrics move on
 *   (spec 32/34). Refresh reuses the latest snapshot while the source hash
 *   is unchanged (spec 35).
 *
 * Conventions (identical to Phase 1-5):
 * - PKs: uniqueidentifier (DB default NEWID as safety)
 * - Strings: nvarchar (explicit lengths / max) — Vietnamese-safe
 * - Timestamps: datetime2 (UTC), defaults SYSUTCDATETIME()
 * - Enum-like columns: nvarchar + named CHECK constraints
 * - All constraints/indexes explicitly named (reviewable, drop-safe)
 *
 * FK DELETE-ACTION DESIGN (error-1785 multi-cascade-path class):
 * - ai_mentor_messages.conversationId → ai_mentor_conversations CASCADE
 *   (single path: messages are the conversation's content — archiving keeps
 *   rows, only a deliberate conversation delete removes them together).
 * - ai_mentor_conversations.userId / evaluation_ai_suggestions.generatedById
 *   / ai_recommendation_snapshots.userId → users NO ACTION: users are
 *   DEACTIVATED, never hard-deleted, on this platform (Phase 1-5 lesson).
 * - evaluation_ai_suggestions.evaluationId → evaluations NO ACTION: a
 *   suggestion is advisor telemetry; the authoritative evaluation must be
 *   free to follow its own lifecycle (revision flow) without being blocked
 *   by, or cascading into, AI workspace rows.
 * - ai_mentor_messages.conversationId is the only CASCADE because it is the
 *   sole FK on that table (no multi-path risk — documented, deliberate).
 */
export class CreateAiMentorAssistanceRecommendationTables1760304000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);

    // ── AI Mentor conversations (owner = authenticated principal) ─────────
    await S(`
      CREATE TABLE ai_mentor_conversations (
        id uniqueidentifier NOT NULL CONSTRAINT DF_ai_mentor_conversations_id DEFAULT NEWID()
          CONSTRAINT PK_ai_mentor_conversations PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        title nvarchar(256) NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_ai_mentor_conversations_status DEFAULT ('active')
          CONSTRAINT CK_ai_mentor_conversations_status CHECK ([status] IN ('active','archived')),
        createdAt datetime2 NOT NULL CONSTRAINT DF_ai_mentor_conversations_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_ai_mentor_conversations_updatedAt DEFAULT SYSUTCDATETIME(),
        lastMessageAt datetime2 NULL,
        CONSTRAINT FK_ai_mentor_conversations_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(
      `CREATE INDEX IX_ai_mentor_conversations_user_lastMessageAt ON ai_mentor_conversations (userId, lastMessageAt DESC);`,
    );
    await S(
      `CREATE INDEX IX_ai_mentor_conversations_user_status ON ai_mentor_conversations (userId, status);`,
    );

    // ── AI Mentor messages (bounded; roles user|assistant only) ───────────
    await S(`
      CREATE TABLE ai_mentor_messages (
        id uniqueidentifier NOT NULL CONSTRAINT DF_ai_mentor_messages_id DEFAULT NEWID()
          CONSTRAINT PK_ai_mentor_messages PRIMARY KEY,
        conversationId uniqueidentifier NOT NULL,
        role nvarchar(16) NOT NULL
          CONSTRAINT CK_ai_mentor_messages_role CHECK ([role] IN ('user','assistant')),
        content nvarchar(max) NOT NULL,
        aiRunId uniqueidentifier NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_ai_mentor_messages_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_ai_mentor_messages_content_length CHECK (DATALENGTH([content]) > (0)),
        CONSTRAINT FK_ai_mentor_messages_conversation FOREIGN KEY (conversationId)
          REFERENCES ai_mentor_conversations (id) ON DELETE CASCADE
      );`);
    await S(
      `CREATE INDEX IX_ai_mentor_messages_conversation_createdAt ON ai_mentor_messages (conversationId, createdAt);`,
    );
    await S(`CREATE INDEX IX_ai_mentor_messages_aiRunId ON ai_mentor_messages (aiRunId);`);

    // ── Evaluation AI suggestions (append-only instructor workspace) ──────
    await S(`
      CREATE TABLE evaluation_ai_suggestions (
        id uniqueidentifier NOT NULL CONSTRAINT DF_evaluation_ai_suggestions_id DEFAULT NEWID()
          CONSTRAINT PK_evaluation_ai_suggestions PRIMARY KEY,
        evaluationId uniqueidentifier NOT NULL,
        aiRunId uniqueidentifier NULL,
        promptVersion nvarchar(64) NOT NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_evaluation_ai_suggestions_status DEFAULT ('generated')
          CONSTRAINT CK_evaluation_ai_suggestions_status CHECK ([status] IN ('generated','applied','discarded')),
        suggestionJson nvarchar(max) NOT NULL,
        generatedAt datetime2 NOT NULL CONSTRAINT DF_evaluation_ai_suggestions_generatedAt DEFAULT SYSUTCDATETIME(),
        acceptedAt datetime2 NULL,
        acceptedById uniqueidentifier NULL,
        CONSTRAINT CK_evaluation_ai_suggestions_acceptance CHECK (
          ([status] = 'generated' AND [acceptedAt] IS NULL AND [acceptedById] IS NULL)
          OR ([status] <> 'generated')
        ),
        CONSTRAINT FK_evaluation_ai_suggestions_evaluation FOREIGN KEY (evaluationId)
          REFERENCES evaluations (id) ON DELETE NO ACTION,
        CONSTRAINT FK_evaluation_ai_suggestions_acceptedBy FOREIGN KEY (acceptedById)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(
      `CREATE INDEX IX_evaluation_ai_suggestions_evaluation_createdAt ON evaluation_ai_suggestions (evaluationId, generatedAt);`,
    );

    // ── AI recommendation snapshots (deterministic + explainable) ─────────
    await S(`
      CREATE TABLE ai_recommendation_snapshots (
        id uniqueidentifier NOT NULL CONSTRAINT DF_ai_recommendation_snapshots_id DEFAULT NEWID()
          CONSTRAINT PK_ai_recommendation_snapshots PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        aiRunId uniqueidentifier NULL,
        scope nvarchar(32) NOT NULL CONSTRAINT DF_ai_recommendation_snapshots_scope DEFAULT ('intern_own'),
        promptVersion nvarchar(64) NOT NULL,
        sourceHash nvarchar(64) NOT NULL,
        sourceSnapshotJson nvarchar(max) NOT NULL,
        recommendationsJson nvarchar(max) NOT NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_ai_recommendation_snapshots_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ai_recommendation_snapshots_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(
      `CREATE INDEX IX_ai_recommendation_snapshots_user_createdAt ON ai_recommendation_snapshots (userId, createdAt DESC);`,
    );
    await S(
      `CREATE INDEX IX_ai_recommendation_snapshots_user_hash ON ai_recommendation_snapshots (userId, sourceHash, createdAt DESC);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);
    // Reverse dependency order — safe full rollback (indexes drop with
    // their tables, matching the proven Phase 1-5 pattern).
    await S(`DROP TABLE IF EXISTS ai_recommendation_snapshots;`);
    await S(`DROP TABLE IF EXISTS evaluation_ai_suggestions;`);
    await S(`DROP TABLE IF EXISTS ai_mentor_messages;`);
    await S(`DROP TABLE IF EXISTS ai_mentor_conversations;`);
  }
}
