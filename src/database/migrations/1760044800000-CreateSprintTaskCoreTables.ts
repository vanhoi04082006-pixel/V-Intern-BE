import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PHASE 3 — SPRINT / TASK CORE (spec 1).
 *
 * Builds on top of 1759872000000-InitPlatformCore and
 * 1759958400000-CreateAcademicCoreTables (both NEVER modified).
 * Up = sprints, tasks, task_comments, task_status_histories + the
 * task_code_seq SEQUENCE. Down = full reverse drop (no data mutation).
 *
 * Conventions (identical to Phase 1/2):
 * - PKs: uniqueidentifier (client-generated uuid; DB default NEWID as safety)
 * - Strings: nvarchar (explicit lengths) — Vietnamese-safe
 * - Timestamps: datetime2 (UTC), defaults SYSUTCDATETIME()
 * - Enum-like columns: nvarchar + named CHECK constraints
 * - All constraints/indexes explicitly named (reviewable, drop-safe)
 *
 * Key invariants (spec 4/11/25):
 * - ONE active sprint per project: FILTERED unique index
 *   UX_sprints_project_active (WHERE [status] = 'active').
 * - Task codes are generated from the SQL Server SEQUENCE task_code_seq
 *   (concurrency-safe, gaps allowed on rollback — NEVER count()+1).
 * - tasks.version is the optimistic-concurrency token (spec 25);
 *   storyPoints >= 0 and progress BETWEEN 0 AND 100 are DB CHECKs.
 * - Query-supporting indexes: (projectId,status), (sprintId,status),
 *   (assigneeId,status), (dueDate), history (taskId,createdAt),
 *   comments (taskId,createdAt), sprints (projectId,status) — spec 31.
 *
 * PHASE 3.5 REPAIR RECORD (pre-deployment, documented per migration policy):
 * - 2026-10-07 — FK_tasks_createdBy changed ON DELETE SET NULL → NO ACTION.
 *   Real SQL Server 2019 (CI run 37590542594) rejected the original with
 *   error 1785 'may cause cycles or multiple cascade paths': assigneeId
 *   (SET NULL) + createdById (SET NULL) both reference users — two cascade
 *   paths from one parent to the same child row. assigneeId keeps SET NULL
 *   (deleting an assignee unassigns the task); the creator reference
 *   becomes a restrict — users are deactivated via status in this platform
 *   (never hard-deleted through normal flows). Identical class of repair as
 *   FK_assignments_assignedBy. No other object was altered.
 * - 2026-10-07 — FK_tasks_sprint changed ON DELETE SET NULL → NO ACTION.
 *   Same CI run: projects→tasks (direct CASCADE) AND projects→sprints
 *   (CASCADE) → tasks (SET NULL) form a second multi-cascade-path pair
 *   (error 1785 again). The strong ownership (project → tasks CASCADE) is
 *   kept; the scheduling grouping becomes a restrict — sprints end their
 *   lifecycle via completed/cancelled transitions, never hard-deleted by
 *   any product flow. No other object was altered.
 */
export class CreateSprintTaskCoreTables1760044800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);

    // ── Sprints (tasks reference it → create first) ────────────────────────
    await S(`
      CREATE TABLE sprints (
        id uniqueidentifier NOT NULL CONSTRAINT DF_sprints_id DEFAULT NEWID()
          CONSTRAINT PK_sprints PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        name nvarchar(256) NOT NULL,
        description nvarchar(max) NULL,
        projectId uniqueidentifier NOT NULL,
        sessionId uniqueidentifier NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_sprints_status DEFAULT ('planned')
          CONSTRAINT CK_sprints_status CHECK ([status] IN ('planned','active','completed','cancelled')),
        goal nvarchar(512) NULL,
        startDate datetime2 NOT NULL,
        endDate datetime2 NOT NULL,
        createdById uniqueidentifier NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_sprints_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_sprints_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_sprints_project FOREIGN KEY (projectId)
          REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT FK_sprints_session FOREIGN KEY (sessionId)
          REFERENCES internship_sessions (id) ON DELETE SET NULL,
        CONSTRAINT FK_sprints_createdBy FOREIGN KEY (createdById)
          REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT CK_sprints_dates CHECK ([endDate] >= [startDate])
      );`);
    await S(`CREATE UNIQUE INDEX UX_sprints_code ON sprints (code);`);
    // ONE active sprint per project — DB-enforced (spec 4), not app-only.
    await S(
      `CREATE UNIQUE INDEX UX_sprints_project_active ON sprints (projectId) WHERE [status] = 'active';`,
    );
    await S(`CREATE INDEX IX_sprints_projectId_status ON sprints (projectId, status);`);
    await S(`CREATE INDEX IX_sprints_sessionId ON sprints (sessionId);`);

    // ── Task code sequence (spec 11) ────────────────────────────────────────
    // SEQUENCE values are non-transactional: concurrent calls never collide
    // and rolled-back transactions leave a (harmless, documented) gap.
    await S(`CREATE SEQUENCE task_code_seq AS bigint START WITH 100 INCREMENT BY 1;`);

    // ── Tasks (critical lifecycle entity) ───────────────────────────────────
    await S(`
      CREATE TABLE tasks (
        id uniqueidentifier NOT NULL CONSTRAINT DF_tasks_id DEFAULT NEWID()
          CONSTRAINT PK_tasks PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        title nvarchar(256) NOT NULL,
        description nvarchar(max) NULL,
        projectId uniqueidentifier NOT NULL,
        sprintId uniqueidentifier NULL,
        assigneeId uniqueidentifier NULL,
        createdById uniqueidentifier NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_tasks_status DEFAULT ('todo')
          CONSTRAINT CK_tasks_status CHECK ([status] IN ('todo','doing','review','done')),
        priority nvarchar(16) NOT NULL CONSTRAINT DF_tasks_priority DEFAULT ('medium')
          CONSTRAINT CK_tasks_priority CHECK ([priority] IN ('low','medium','high','critical')),
        storyPoints int NULL CONSTRAINT CK_tasks_storyPoints CHECK ([storyPoints] IS NULL OR [storyPoints] >= 0),
        progress int NOT NULL CONSTRAINT DF_tasks_progress DEFAULT (0)
          CONSTRAINT CK_tasks_progress CHECK ([progress] BETWEEN 0 AND 100),
        dueDate datetime2 NULL,
        version int NOT NULL CONSTRAINT DF_tasks_version DEFAULT (0),
        deletedAt datetime2 NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_tasks_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_tasks_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_tasks_project FOREIGN KEY (projectId)
          REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT FK_tasks_sprint FOREIGN KEY (sprintId)
          REFERENCES sprints (id) ON DELETE NO ACTION,
        CONSTRAINT FK_tasks_assignee FOREIGN KEY (assigneeId)
          REFERENCES users (id) ON DELETE SET NULL,
        -- Phase 3.5 repair (error 1785 multi-cascade-path): see REPAIR RECORD
        -- in the header — the second FK to users must be a restrict.
        CONSTRAINT FK_tasks_createdBy FOREIGN KEY (createdById)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(`CREATE UNIQUE INDEX UX_tasks_code ON tasks (code);`);
    await S(`CREATE INDEX IX_tasks_projectId_status ON tasks (projectId, status);`);
    await S(`CREATE INDEX IX_tasks_sprintId_status ON tasks (sprintId, status);`);
    await S(`CREATE INDEX IX_tasks_assigneeId_status ON tasks (assigneeId, status);`);
    await S(`CREATE INDEX IX_tasks_dueDate ON tasks (dueDate);`);

    // ── Task comments (spec 13) ─────────────────────────────────────────────
    await S(`
      CREATE TABLE task_comments (
        id uniqueidentifier NOT NULL CONSTRAINT DF_task_comments_id DEFAULT NEWID()
          CONSTRAINT PK_task_comments PRIMARY KEY,
        taskId uniqueidentifier NOT NULL,
        authorId uniqueidentifier NOT NULL,
        content nvarchar(2000) NOT NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_task_comments_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_task_comments_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_task_comments_task FOREIGN KEY (taskId)
          REFERENCES tasks (id) ON DELETE CASCADE,
        CONSTRAINT FK_task_comments_author FOREIGN KEY (authorId)
          REFERENCES users (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_task_comments_taskId_createdAt ON task_comments (taskId, createdAt);`);

    // ── Task status history (append-only, spec 12) ──────────────────────────
    await S(`
      CREATE TABLE task_status_histories (
        id uniqueidentifier NOT NULL CONSTRAINT DF_task_status_histories_id DEFAULT NEWID()
          CONSTRAINT PK_task_status_histories PRIMARY KEY,
        taskId uniqueidentifier NOT NULL,
        fromStatus nvarchar(16) NULL,
        toStatus nvarchar(16) NOT NULL,
        changedById uniqueidentifier NULL,
        reason nvarchar(512) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_task_status_histories_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_task_status_histories_task FOREIGN KEY (taskId)
          REFERENCES tasks (id) ON DELETE CASCADE,
        CONSTRAINT FK_task_status_histories_changedBy FOREIGN KEY (changedById)
          REFERENCES users (id) ON DELETE SET NULL
      );`);
    await S(
      `CREATE INDEX IX_task_status_histories_taskId_createdAt ON task_status_histories (taskId, createdAt);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);
    // Reverse dependency order — safe full rollback.
    await S(`DROP TABLE IF EXISTS task_status_histories;`);
    await S(`DROP TABLE IF EXISTS task_comments;`);
    await S(`DROP INDEX IF EXISTS UX_tasks_code ON tasks;`);
    await S(`DROP TABLE IF EXISTS tasks;`);
    await S(`DROP SEQUENCE IF EXISTS task_code_seq;`);
    await S(`DROP INDEX IF EXISTS UX_sprints_code ON sprints;`);
    await S(`DROP INDEX IF EXISTS UX_sprints_project_active ON sprints;`);
    await S(`DROP TABLE IF EXISTS sprints;`);
  }
}
