import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PHASE 2 — ACADEMIC CORE (spec scope: classes, internship sessions,
 * projects, assignments, memberships, milestones, technologies).
 *
 * Build on top of InitPlatformCore1759872000000 (never modified).
 * Up = academic core schema. Down = full reverse-FK rollback.
 *
 * Conventions (identical to Phase 1):
 * - PKs: uniqueidentifier (client-generated uuid; DB default NEWID as safety)
 * - Strings: nvarchar (explicit lengths) — Vietnamese-safe
 * - Timestamps: datetime2 (UTC), defaults SYSUTCDATETIME()
 * - Enum-like columns: nvarchar + named CHECK constraints (no arbitrary strings)
 * - All constraints/indexes explicitly named (reviewable, drop-safe)
 *
 * Key invariant (spec 19): an intern has AT MOST ONE active assignment,
 * enforced by the FILTERED unique index UX_assignments_intern_active
 * (SQL Server syntax: CREATE UNIQUE INDEX ... WHERE [status] = 'active')
 * so concurrency cannot create duplicate active assignments even if the
 * application transaction is bypassed.
 *
 * PHASE 3.5 REPAIR RECORD (pre-deployment, documented per migration policy):
 * - 2026-10-07 — FK_assignments_assignedBy changed ON DELETE SET NULL →
 *   NO ACTION. Real SQL Server 2019 (CI run 37588816341) rejected the
 *   original with error 1785 'may cause cycles or multiple cascade paths':
 *   internId (CASCADE) + assignedById (SET NULL) both reference users, and
 *   SQL Server forbids two cascade paths from one parent to the same child
 *   row. internId keeps the lifecycle CASCADE; the assigner reference
 *   becomes a restrict — users are deactivated via status in this platform
 *   (never hard-deleted through normal flows), so this is the smallest
 *   safe repair that preserves the assignment lifecycle. No other object
 *   in this migration was altered.
 */
export class CreateAcademicCoreTables1759958400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);

    // ── Internship sessions (classes reference it → create first) ─────────
    await S(`
      CREATE TABLE internship_sessions (
        id uniqueidentifier NOT NULL CONSTRAINT DF_internship_sessions_id DEFAULT NEWID()
          CONSTRAINT PK_internship_sessions PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        name nvarchar(256) NOT NULL,
        description nvarchar(max) NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_internship_sessions_status DEFAULT ('upcoming')
          CONSTRAINT CK_internship_sessions_status CHECK ([status] IN ('upcoming','active','ending','completed','cancelled')),
        leadInstructorId uniqueidentifier NULL,
        startDate datetime2 NOT NULL,
        endDate datetime2 NOT NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_internship_sessions_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_internship_sessions_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_internship_sessions_leadInstructor FOREIGN KEY (leadInstructorId)
          REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT CK_internship_sessions_dates CHECK ([endDate] >= [startDate])
      );`);
    await S(`CREATE UNIQUE INDEX UX_internship_sessions_code ON internship_sessions (code);`);
    await S(`CREATE INDEX IX_internship_sessions_status ON internship_sessions (status);`);
    await S(`CREATE INDEX IX_internship_sessions_leadInstructorId ON internship_sessions (leadInstructorId);`);

    // ── Session members (unique sessionId+userId) ─────────────────────────
    await S(`
      CREATE TABLE session_members (
        sessionId uniqueidentifier NOT NULL,
        userId uniqueidentifier NOT NULL,
        joinedAt datetime2 NOT NULL CONSTRAINT DF_session_members_joinedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_session_members PRIMARY KEY (sessionId, userId),
        CONSTRAINT FK_session_members_session FOREIGN KEY (sessionId)
          REFERENCES internship_sessions (id) ON DELETE CASCADE,
        CONSTRAINT FK_session_members_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_session_members_userId ON session_members (userId);`);

    // ── Session instructors (unique sessionId+instructorId) ───────────────
    await S(`
      CREATE TABLE session_instructors (
        sessionId uniqueidentifier NOT NULL,
        instructorId uniqueidentifier NOT NULL,
        assignedAt datetime2 NOT NULL CONSTRAINT DF_session_instructors_assignedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_session_instructors PRIMARY KEY (sessionId, instructorId),
        CONSTRAINT FK_session_instructors_session FOREIGN KEY (sessionId)
          REFERENCES internship_sessions (id) ON DELETE CASCADE,
        CONSTRAINT FK_session_instructors_instructor FOREIGN KEY (instructorId)
          REFERENCES users (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_session_instructors_instructorId ON session_instructors (instructorId);`);

    // ── Session milestones ─────────────────────────────────────────────────
    await S(`
      CREATE TABLE session_milestones (
        id uniqueidentifier NOT NULL CONSTRAINT DF_session_milestones_id DEFAULT NEWID()
          CONSTRAINT PK_session_milestones PRIMARY KEY,
        sessionId uniqueidentifier NOT NULL,
        title nvarchar(256) NOT NULL,
        description nvarchar(max) NULL,
        dueDate datetime2 NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_session_milestones_status DEFAULT ('pending')
          CONSTRAINT CK_session_milestones_status CHECK ([status] IN ('pending','in_progress','completed')),
        sortOrder int NOT NULL CONSTRAINT DF_session_milestones_sortOrder DEFAULT (0),
        createdAt datetime2 NOT NULL CONSTRAINT DF_session_milestones_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_session_milestones_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_session_milestones_session FOREIGN KEY (sessionId)
          REFERENCES internship_sessions (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_session_milestones_session_sort ON session_milestones (sessionId, sortOrder);`);

    // ── Classes ────────────────────────────────────────────────────────────
    await S(`
      CREATE TABLE classes (
        id uniqueidentifier NOT NULL CONSTRAINT DF_classes_id DEFAULT NEWID()
          CONSTRAINT PK_classes PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        name nvarchar(256) NOT NULL,
        description nvarchar(max) NULL,
        leadInstructorId uniqueidentifier NULL,
        sessionId uniqueidentifier NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_classes_status DEFAULT ('upcoming')
          CONSTRAINT CK_classes_status CHECK ([status] IN ('upcoming','active','completed','cancelled')),
        startDate datetime2 NULL,
        endDate datetime2 NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_classes_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_classes_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_classes_leadInstructor FOREIGN KEY (leadInstructorId)
          REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT FK_classes_session FOREIGN KEY (sessionId)
          REFERENCES internship_sessions (id) ON DELETE CASCADE
      );`);
    await S(`CREATE UNIQUE INDEX UX_classes_code ON classes (code);`);
    await S(`CREATE INDEX IX_classes_status ON classes (status);`);
    await S(`CREATE INDEX IX_classes_leadInstructorId ON classes (leadInstructorId);`);
    await S(`CREATE INDEX IX_classes_sessionId ON classes (sessionId);`);

    // ── Class members (unique classId+userId) ──────────────────────────────
    await S(`
      CREATE TABLE class_members (
        classId uniqueidentifier NOT NULL,
        userId uniqueidentifier NOT NULL,
        joinedAt datetime2 NOT NULL CONSTRAINT DF_class_members_joinedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_class_members PRIMARY KEY (classId, userId),
        CONSTRAINT FK_class_members_class FOREIGN KEY (classId)
          REFERENCES classes (id) ON DELETE CASCADE,
        CONSTRAINT FK_class_members_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_class_members_userId ON class_members (userId);`);

    // ── Projects ───────────────────────────────────────────────────────────
    await S(`
      CREATE TABLE projects (
        id uniqueidentifier NOT NULL CONSTRAINT DF_projects_id DEFAULT NEWID()
          CONSTRAINT PK_projects PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        name nvarchar(256) NOT NULL,
        description nvarchar(max) NOT NULL,
        domainCategory nvarchar(128) NULL,
        difficulty nvarchar(16) NOT NULL CONSTRAINT DF_projects_difficulty DEFAULT ('beginner')
          CONSTRAINT CK_projects_difficulty CHECK ([difficulty] IN ('beginner','intermediate','advanced')),
        status nvarchar(16) NOT NULL CONSTRAINT DF_projects_status DEFAULT ('draft')
          CONSTRAINT CK_projects_status CHECK ([status] IN ('draft','active','completed','archived')),
        mentorId uniqueidentifier NULL,
        capacity int NULL CONSTRAINT CK_projects_capacity CHECK ([capacity] IS NULL OR [capacity] >= 1),
        startDate datetime2 NULL,
        endDate datetime2 NULL,
        archivedAt datetime2 NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_projects_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_projects_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_projects_mentor FOREIGN KEY (mentorId)
          REFERENCES users (id) ON DELETE SET NULL
      );`);
    await S(`CREATE UNIQUE INDEX UX_projects_code ON projects (code);`);
    await S(`CREATE INDEX IX_projects_status ON projects (status);`);
    await S(`CREATE INDEX IX_projects_mentorId ON projects (mentorId);`);

    // ── Project members (unique projectId+userId; assignment-driven) ───────
    await S(`
      CREATE TABLE project_members (
        projectId uniqueidentifier NOT NULL,
        userId uniqueidentifier NOT NULL,
        roleInProject nvarchar(64) NULL,
        joinedAt datetime2 NOT NULL CONSTRAINT DF_project_members_joinedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_project_members PRIMARY KEY (projectId, userId),
        CONSTRAINT FK_project_members_project FOREIGN KEY (projectId)
          REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT FK_project_members_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE CASCADE
      );`);
    await S(`CREATE INDEX IX_project_members_userId ON project_members (userId);`);

    // ── Project technologies (relational join table — NEVER comma-serialized;
    //    catalog linkage deferred to a later phase, documented decision) ────
    await S(`
      CREATE TABLE project_technologies (
        projectId uniqueidentifier NOT NULL,
        technology nvarchar(64) NOT NULL,
        CONSTRAINT PK_project_technologies PRIMARY KEY (projectId, technology),
        CONSTRAINT FK_project_technologies_project FOREIGN KEY (projectId)
          REFERENCES projects (id) ON DELETE CASCADE
      );`);

    // ── Assignments (critical lifecycle entity) ────────────────────────────
    await S(`
      CREATE TABLE assignments (
        id uniqueidentifier NOT NULL CONSTRAINT DF_assignments_id DEFAULT NEWID()
          CONSTRAINT PK_assignments PRIMARY KEY,
        internId uniqueidentifier NOT NULL,
        projectId uniqueidentifier NOT NULL,
        sessionId uniqueidentifier NOT NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_assignments_status DEFAULT ('active')
          CONSTRAINT CK_assignments_status CHECK ([status] IN ('active','completed','cancelled')),
        assignedById uniqueidentifier NULL,
        assignedAt datetime2 NOT NULL CONSTRAINT DF_assignments_assignedAt DEFAULT SYSUTCDATETIME(),
        completedAt datetime2 NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_assignments_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_assignments_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_assignments_intern FOREIGN KEY (internId)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT FK_assignments_project FOREIGN KEY (projectId)
          REFERENCES projects (id) ON DELETE CASCADE,
        CONSTRAINT FK_assignments_session FOREIGN KEY (sessionId)
          REFERENCES internship_sessions (id) ON DELETE CASCADE,
        -- Phase 3.5 repair (error 1785 multi-cascade-path): see REPAIR RECORD
        -- in the header — the second FK to users must be a restrict.
        CONSTRAINT FK_assignments_assignedBy FOREIGN KEY (assignedById)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(`CREATE INDEX IX_assignments_internId ON assignments (internId, status);`);
    await S(`CREATE INDEX IX_assignments_projectId_status ON assignments (projectId, status);`);
    await S(`CREATE INDEX IX_assignments_sessionId_status ON assignments (sessionId, status);`);
    // Filtered unique index — DB-level enforcement of the core invariant:
    // "at most ONE active assignment per intern" (SQL Server filtered syntax).
    await S(
      `CREATE UNIQUE INDEX UX_assignments_intern_active ON assignments (internId) WHERE [status] = 'active';`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);
    // Reverse FK order — safe full rollback.
    await S(`DROP INDEX IF EXISTS UX_assignments_intern_active ON assignments;`);
    await S(`DROP TABLE IF EXISTS assignments;`);
    await S(`DROP TABLE IF EXISTS project_technologies;`);
    await S(`DROP TABLE IF EXISTS project_members;`);
    await S(`DROP TABLE IF EXISTS projects;`);
    await S(`DROP TABLE IF EXISTS class_members;`);
    await S(`DROP TABLE IF EXISTS classes;`);
    await S(`DROP TABLE IF EXISTS session_milestones;`);
    await S(`DROP TABLE IF EXISTS session_instructors;`);
    await S(`DROP TABLE IF EXISTS session_members;`);
    await S(`DROP TABLE IF EXISTS internship_sessions;`);
  }
}
