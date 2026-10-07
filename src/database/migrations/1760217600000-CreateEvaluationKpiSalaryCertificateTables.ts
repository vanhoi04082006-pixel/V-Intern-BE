import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PHASE 5 — EVALUATION + PERFORMANCE + KPI + VIRTUAL SALARY + CERTIFICATES.
 *
 * Builds on top of the FROZEN Phase 1-4 migrations (never modified —
 * docs/database/MIGRATION_POLICY.md). Up = evaluation_cycles,
 * evaluation_criteria, evaluations, evaluation_scores,
 * evaluation_revisions, kpi_periods, kpi_results, kpi_metric_results,
 * virtual_salary_ledger, certificate_policies, certificates + the
 * certificate_number_seq SEQUENCE. Down = full reverse drop (no data
 * mutation).
 *
 * Conventions (identical to Phase 1/2/3/4):
 * - PKs: uniqueidentifier (DB default NEWID as safety)
 * - Strings: nvarchar (explicit lengths / max) — Vietnamese-safe
 * - Timestamps: datetime2 (UTC), defaults SYSUTCDATETIME()
 * - Enum-like columns: nvarchar + named CHECK constraints
 * - All constraints/indexes explicitly named (reviewable, drop-safe)
 *
 * FK DELETE-ACTION DESIGN (error-1785 multi-cascade-path class, the
 * documented lesson of Phases 2/3/4 — designed OUT here):
 * - evaluation_cycles → evaluation_criteria    CASCADE (single path)
 * - evaluations → evaluation_scores            CASCADE (single path)
 * - evaluations → evaluation_revisions         CASCADE (single path)
 * - kpi_results → kpi_metric_results           CASCADE (single path)
 * - Every FK that touches `users` (evaluations.internId/evaluatorId,
 *   evaluation_revisions.changedById, kpi_results.userId/calculatedById,
 *   virtual_salary_ledger.userId/createdById, certificates.userId/
 *   issuedById/revokedById) is NO ACTION: users are DEACTIVATED, never
 *   hard-deleted, on this platform, and multiple user FKs on one table
 *   would instantly create duplicate cascade paths if any were CASCADE.
 * - evaluations.cycleId → evaluation_cycles NO ACTION (a cycle is archived,
 *   never dropped; the reverse CASCADE through criteria is unrelated).
 * - virtual_salary_ledger.kpiPeriodId → kpi_periods NO ACTION (the ledger
 *   is an append-only financial record — it must SURVIVE any period
 *   lifecycle action; periods are closed/finalized, never deleted).
 * - certificates.evaluationId / kpiResultId NO ACTION (the certificate is
 *   the permanent proof — it must survive the sources).
 * - virtual_salary_ledger has ZERO numeric balance column: the balance is
 *   ALWAYS SUM(amount) over the ledger (spec 31 — no mutable balance).
 * - certificate_number_seq: a real SQL Server SEQUENCE (spec 46) — the
 *   certificate number generator is concurrency-safe by the engine, never
 *   count()+1.
 */
export class CreateEvaluationKpiSalaryCertificateTables1760217600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);

    // ── Evaluation cycles (explicit state machine: draft/open/closed/archived) ──
    await S(`
      CREATE TABLE evaluation_cycles (
        id uniqueidentifier NOT NULL CONSTRAINT DF_evaluation_cycles_id DEFAULT NEWID()
          CONSTRAINT PK_evaluation_cycles PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        name nvarchar(256) NOT NULL,
        sessionId uniqueidentifier NULL,
        projectId uniqueidentifier NULL,
        type nvarchar(24) NOT NULL CONSTRAINT DF_evaluation_cycles_type DEFAULT ('sprint')
          CONSTRAINT CK_evaluation_cycles_type CHECK ([type] IN ('sprint','midterm','final')),
        status nvarchar(16) NOT NULL CONSTRAINT DF_evaluation_cycles_status DEFAULT ('draft')
          CONSTRAINT CK_evaluation_cycles_status CHECK ([status] IN ('draft','open','closed','archived')),
        startDate datetime2 NOT NULL,
        endDate datetime2 NOT NULL,
        dueDate datetime2 NULL,
        createdById uniqueidentifier NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_evaluation_cycles_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_evaluation_cycles_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_evaluation_cycles_dates CHECK ([endDate] > [startDate]),
        CONSTRAINT FK_evaluation_cycles_session FOREIGN KEY (sessionId)
          REFERENCES internship_sessions (id) ON DELETE NO ACTION,
        CONSTRAINT FK_evaluation_cycles_project FOREIGN KEY (projectId)
          REFERENCES projects (id) ON DELETE NO ACTION,
        CONSTRAINT FK_evaluation_cycles_createdBy FOREIGN KEY (createdById)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(`CREATE UNIQUE INDEX UX_evaluation_cycles_code ON evaluation_cycles (code);`);
    await S(
      `CREATE INDEX IX_evaluation_cycles_status_dates ON evaluation_cycles (status, startDate, endDate);`,
    );

    // ── Criteria (cycle-scoped snapshot; weights validated by the service) ──
    await S(`
      CREATE TABLE evaluation_criteria (
        id uniqueidentifier NOT NULL CONSTRAINT DF_evaluation_criteria_id DEFAULT NEWID()
          CONSTRAINT PK_evaluation_criteria PRIMARY KEY,
        cycleId uniqueidentifier NOT NULL,
        code nvarchar(64) NOT NULL,
        name nvarchar(128) NOT NULL,
        description nvarchar(512) NULL,
        weight decimal(5,2) NOT NULL,
        maxScore decimal(5,1) NOT NULL CONSTRAINT DF_evaluation_criteria_maxScore DEFAULT ((100.0)),
        sortOrder int NOT NULL CONSTRAINT DF_evaluation_criteria_sortOrder DEFAULT ((0)),
        isRequired bit NOT NULL CONSTRAINT DF_evaluation_criteria_isRequired DEFAULT ((1)),
        createdAt datetime2 NOT NULL CONSTRAINT DF_evaluation_criteria_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_evaluation_criteria_weight CHECK ([weight] > (0) AND [weight] <= (100)),
        CONSTRAINT CK_evaluation_criteria_maxScore CHECK ([maxScore] > (0)),
        CONSTRAINT FK_evaluation_criteria_cycle FOREIGN KEY (cycleId)
          REFERENCES evaluation_cycles (id) ON DELETE CASCADE
      );`);
    await S(
      `CREATE UNIQUE INDEX UX_evaluation_criteria_cycle_code ON evaluation_criteria (cycleId, code);`,
    );
    await S(`CREATE INDEX IX_evaluation_criteria_cycleId ON evaluation_criteria (cycleId);`);

    // ── Evaluations (one per cycle+intern+evaluator — DB-enforced) ─────────
    await S(`
      CREATE TABLE evaluations (
        id uniqueidentifier NOT NULL CONSTRAINT DF_evaluations_id DEFAULT NEWID()
          CONSTRAINT PK_evaluations PRIMARY KEY,
        cycleId uniqueidentifier NOT NULL,
        internId uniqueidentifier NOT NULL,
        evaluatorId uniqueidentifier NOT NULL,
        projectId uniqueidentifier NULL,
        sessionId uniqueidentifier NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_evaluations_status DEFAULT ('draft')
          CONSTRAINT CK_evaluations_status CHECK ([status] IN ('draft','submitted','finalized')),
        overallScore decimal(5,1) NULL,
        summary nvarchar(max) NULL,
        submittedAt datetime2 NULL,
        finalizedAt datetime2 NULL,
        revisionNumber int NOT NULL CONSTRAINT DF_evaluations_revisionNumber DEFAULT ((0)),
        createdAt datetime2 NOT NULL CONSTRAINT DF_evaluations_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_evaluations_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_evaluations_overall CHECK ([overallScore] IS NULL OR ([overallScore] BETWEEN 0 AND 100)),
        CONSTRAINT FK_evaluations_cycle FOREIGN KEY (cycleId)
          REFERENCES evaluation_cycles (id) ON DELETE NO ACTION,
        CONSTRAINT FK_evaluations_intern FOREIGN KEY (internId)
          REFERENCES users (id) ON DELETE NO ACTION,
        CONSTRAINT FK_evaluations_evaluator FOREIGN KEY (evaluatorId)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(
      `CREATE UNIQUE INDEX UX_evaluations_cycle_intern_evaluator ON evaluations (cycleId, internId, evaluatorId);`,
    );
    await S(`CREATE INDEX IX_evaluations_intern_cycle_status ON evaluations (internId, cycleId, status);`);
    await S(`CREATE INDEX IX_evaluations_evaluator_status ON evaluations (evaluatorId, status);`);

    // ── Per-criterion scores (0..100, unique per evaluation+criterion) ─────
    await S(`
      CREATE TABLE evaluation_scores (
        id uniqueidentifier NOT NULL CONSTRAINT DF_evaluation_scores_id DEFAULT NEWID()
          CONSTRAINT PK_evaluation_scores PRIMARY KEY,
        evaluationId uniqueidentifier NOT NULL,
        criterionId uniqueidentifier NOT NULL,
        score decimal(5,1) NOT NULL,
        comment nvarchar(1024) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_evaluation_scores_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_evaluation_scores_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_evaluation_scores_value CHECK ([score] BETWEEN 0 AND 100),
        CONSTRAINT FK_evaluation_scores_evaluation FOREIGN KEY (evaluationId)
          REFERENCES evaluations (id) ON DELETE CASCADE,
        CONSTRAINT FK_evaluation_scores_criterion FOREIGN KEY (criterionId)
          REFERENCES evaluation_criteria (id) ON DELETE NO ACTION
      );`);
    await S(
      `CREATE UNIQUE INDEX UX_evaluation_scores_evaluation_criterion ON evaluation_scores (evaluationId, criterionId);`,
    );
    await S(`CREATE INDEX IX_evaluation_scores_evaluationId ON evaluation_scores (evaluationId);`);

    // ── Revision history (finalized evaluations are NEVER silently mutated) ──
    await S(`
      CREATE TABLE evaluation_revisions (
        id uniqueidentifier NOT NULL CONSTRAINT DF_evaluation_revisions_id DEFAULT NEWID()
          CONSTRAINT PK_evaluation_revisions PRIMARY KEY,
        evaluationId uniqueidentifier NOT NULL,
        revisionNumber int NOT NULL,
        previousOverallScore decimal(5,1) NULL,
        newOverallScore decimal(5,1) NULL,
        reason nvarchar(1000) NOT NULL,
        changedById uniqueidentifier NOT NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_evaluation_revisions_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_evaluation_revisions_evaluation FOREIGN KEY (evaluationId)
          REFERENCES evaluations (id) ON DELETE CASCADE,
        CONSTRAINT FK_evaluation_revisions_changedBy FOREIGN KEY (changedById)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(
      `CREATE UNIQUE INDEX UX_evaluation_revisions_evaluation_revision ON evaluation_revisions (evaluationId, revisionNumber);`,
    );
    await S(`CREATE INDEX IX_evaluation_revisions_evaluationId ON evaluation_revisions (evaluationId);`);

    // ── KPI periods (versioned rule engine: draft/open/calculating/finalized/closed) ──
    await S(`
      CREATE TABLE kpi_periods (
        id uniqueidentifier NOT NULL CONSTRAINT DF_kpi_periods_id DEFAULT NEWID()
          CONSTRAINT PK_kpi_periods PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        name nvarchar(256) NOT NULL,
        startDate datetime2 NOT NULL,
        endDate datetime2 NOT NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_kpi_periods_status DEFAULT ('draft')
          CONSTRAINT CK_kpi_periods_status CHECK ([status] IN ('draft','open','calculating','finalized','closed')),
        ruleVersion nvarchar(32) NOT NULL CONSTRAINT DF_kpi_periods_ruleVersion DEFAULT ('kpi-v1'),
        createdById uniqueidentifier NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_kpi_periods_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_kpi_periods_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_kpi_periods_dates CHECK ([endDate] > [startDate]),
        CONSTRAINT FK_kpi_periods_createdBy FOREIGN KEY (createdById)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(`CREATE UNIQUE INDEX UX_kpi_periods_code ON kpi_periods (code);`);
    await S(`CREATE INDEX IX_kpi_periods_status_dates ON kpi_periods (status, startDate, endDate);`);

    // ── KPI results (immutable snapshots per period+user; NO live recompute) ──
    await S(`
      CREATE TABLE kpi_results (
        id uniqueidentifier NOT NULL CONSTRAINT DF_kpi_results_id DEFAULT NEWID()
          CONSTRAINT PK_kpi_results PRIMARY KEY,
        periodId uniqueidentifier NOT NULL,
        userId uniqueidentifier NOT NULL,
        ruleVersion nvarchar(32) NOT NULL,
        status nvarchar(24) NOT NULL
          CONSTRAINT CK_kpi_results_status CHECK ([status] IN ('calculated','insufficient_data')),
        finalScore decimal(5,1) NULL,
        calculatedAt datetime2 NOT NULL,
        calculatedById uniqueidentifier NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_kpi_results_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_kpi_results_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_kpi_results_finalScore CHECK ([finalScore] IS NULL OR ([finalScore] BETWEEN 0 AND 100)),
        CONSTRAINT FK_kpi_results_period FOREIGN KEY (periodId)
          REFERENCES kpi_periods (id) ON DELETE NO ACTION,
        CONSTRAINT FK_kpi_results_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE NO ACTION,
        CONSTRAINT FK_kpi_results_calculatedBy FOREIGN KEY (calculatedById)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(`CREATE UNIQUE INDEX UX_kpi_results_period_user ON kpi_results (periodId, userId);`);
    await S(`CREATE INDEX IX_kpi_results_user_period ON kpi_results (userId, periodId);`);

    // ── Component provenance (source value + configured/effective weight) ──
    await S(`
      CREATE TABLE kpi_metric_results (
        id uniqueidentifier NOT NULL CONSTRAINT DF_kpi_metric_results_id DEFAULT NEWID()
          CONSTRAINT PK_kpi_metric_results PRIMARY KEY,
        kpiResultId uniqueidentifier NOT NULL,
        metricCode nvarchar(16) NOT NULL
          CONSTRAINT CK_kpi_metric_results_code CHECK ([metricCode] IN ('delivery','quality','timeliness')),
        configuredWeight decimal(5,2) NOT NULL,
        effectiveWeight decimal(5,2) NULL,
        sourceValue decimal(5,1) NULL,
        weightedContribution decimal(9,4) NULL,
        sourceJson nvarchar(max) NOT NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_kpi_metric_results_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_kpi_metric_results_result FOREIGN KEY (kpiResultId)
          REFERENCES kpi_results (id) ON DELETE CASCADE
      );`);
    await S(
      `CREATE UNIQUE INDEX UX_kpi_metric_results_result_code ON kpi_metric_results (kpiResultId, metricCode);`,
    );
    await S(`CREATE INDEX IX_kpi_metric_results_resultId ON kpi_metric_results (kpiResultId);`);

    // ── Virtual salary LEDGER (append-only; balance = SUM(amount)) ─────────
    await S(`
      CREATE TABLE virtual_salary_ledger (
        id uniqueidentifier NOT NULL CONSTRAINT DF_virtual_salary_ledger_id DEFAULT NEWID()
          CONSTRAINT PK_virtual_salary_ledger PRIMARY KEY,
        userId uniqueidentifier NOT NULL,
        kpiPeriodId uniqueidentifier NULL,
        type nvarchar(24) NOT NULL
          CONSTRAINT CK_virtual_salary_ledger_type CHECK ([type] IN ('kpi_earning','bonus','penalty','adjustment','reversal')),
        amount decimal(18,2) NOT NULL,
        unit nvarchar(24) NOT NULL CONSTRAINT DF_virtual_salary_ledger_unit DEFAULT ('VND_VIRTUAL'),
        sourceType nvarchar(64) NOT NULL,
        sourceId nvarchar(64) NULL,
        description nvarchar(512) NOT NULL,
        createdById uniqueidentifier NULL,
        idempotencyKey nvarchar(200) NOT NULL,
        metadataJson nvarchar(max) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_virtual_salary_ledger_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_virtual_salary_ledger_amount CHECK ([amount] <> (0)),
        CONSTRAINT FK_virtual_salary_ledger_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE NO ACTION,
        CONSTRAINT FK_virtual_salary_ledger_period FOREIGN KEY (kpiPeriodId)
          REFERENCES kpi_periods (id) ON DELETE NO ACTION,
        CONSTRAINT FK_virtual_salary_ledger_createdBy FOREIGN KEY (createdById)
          REFERENCES users (id) ON DELETE NO ACTION
      );`);
    await S(
      `CREATE UNIQUE INDEX UX_virtual_salary_ledger_idempotencyKey ON virtual_salary_ledger (idempotencyKey);`,
    );
    await S(`CREATE INDEX IX_virtual_salary_ledger_user_createdAt ON virtual_salary_ledger (userId, createdAt);`);
    await S(`CREATE INDEX IX_virtual_salary_ledger_kpiPeriodId ON virtual_salary_ledger (kpiPeriodId);`);

    // ── Certificate policies (explicit versioned eligibility, spec 42/43) ──
    await S(`
      CREATE TABLE certificate_policies (
        id uniqueidentifier NOT NULL CONSTRAINT DF_certificate_policies_id DEFAULT NEWID()
          CONSTRAINT PK_certificate_policies PRIMARY KEY,
        code nvarchar(64) NOT NULL,
        version int NOT NULL,
        name nvarchar(256) NOT NULL,
        minEvaluationScore decimal(5,1) NOT NULL,
        minKpiScore decimal(5,1) NOT NULL,
        requireRecruitmentPassed bit NOT NULL CONSTRAINT DF_certificate_policies_requireRecruitment DEFAULT ((1)),
        requireCompletedAssignment bit NOT NULL CONSTRAINT DF_certificate_policies_requireAssignment DEFAULT ((1)),
        isActive bit NOT NULL CONSTRAINT DF_certificate_policies_isActive DEFAULT ((1)),
        createdAt datetime2 NOT NULL CONSTRAINT DF_certificate_policies_createdAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_certificate_policies_minEvaluation CHECK ([minEvaluationScore] BETWEEN 0 AND 100),
        CONSTRAINT CK_certificate_policies_minKpi CHECK ([minKpiScore] BETWEEN 0 AND 100)
      );`);
    await S(`CREATE UNIQUE INDEX UX_certificate_policies_code_version ON certificate_policies (code, version);`);

    // ── Certificates (issued/revoked — never physically deleted) ───────────
    await S(`
      CREATE TABLE certificates (
        id uniqueidentifier NOT NULL CONSTRAINT DF_certificates_id DEFAULT NEWID()
          CONSTRAINT PK_certificates PRIMARY KEY,
        certificateNumber nvarchar(32) NOT NULL,
        verificationCode nvarchar(64) NOT NULL,
        userId uniqueidentifier NOT NULL,
        projectId uniqueidentifier NULL,
        sessionId uniqueidentifier NULL,
        assignmentId uniqueidentifier NULL,
        evaluationId uniqueidentifier NULL,
        kpiResultId uniqueidentifier NULL,
        policyCode nvarchar(64) NOT NULL,
        policyVersion int NOT NULL,
        status nvarchar(16) NOT NULL CONSTRAINT DF_certificates_status DEFAULT ('issued')
          CONSTRAINT CK_certificates_status CHECK ([status] IN ('issued','revoked')),
        issuedAt datetime2 NOT NULL,
        issuedById uniqueidentifier NULL,
        revokedAt datetime2 NULL,
        revokedById uniqueidentifier NULL,
        revokeReason nvarchar(512) NULL,
        createdAt datetime2 NOT NULL CONSTRAINT DF_certificates_createdAt DEFAULT SYSUTCDATETIME(),
        updatedAt datetime2 NOT NULL CONSTRAINT DF_certificates_updatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_certificates_revoked CHECK (
          ([status] = 'issued' AND [revokedAt] IS NULL AND [revokedById] IS NULL)
          OR ([status] = 'revoked' AND [revokedAt] IS NOT NULL)
        ),
        CONSTRAINT FK_certificates_user FOREIGN KEY (userId)
          REFERENCES users (id) ON DELETE NO ACTION,
        CONSTRAINT FK_certificates_issuedBy FOREIGN KEY (issuedById)
          REFERENCES users (id) ON DELETE NO ACTION,
        CONSTRAINT FK_certificates_revokedBy FOREIGN KEY (revokedById)
          REFERENCES users (id) ON DELETE NO ACTION,
        CONSTRAINT FK_certificates_evaluation FOREIGN KEY (evaluationId)
          REFERENCES evaluations (id) ON DELETE NO ACTION,
        CONSTRAINT FK_certificates_kpiResult FOREIGN KEY (kpiResultId)
          REFERENCES kpi_results (id) ON DELETE NO ACTION
      );`);
    await S(`CREATE UNIQUE INDEX UX_certificates_number ON certificates (certificateNumber);`);
    await S(`CREATE UNIQUE INDEX UX_certificates_verificationCode ON certificates (verificationCode);`);
    await S(
      `CREATE UNIQUE INDEX UX_certificates_user_policy ON certificates (userId, policyCode, policyVersion);`,
    );
    await S(`CREATE INDEX IX_certificates_userId_status ON certificates (userId, status);`);

    // ── Concurrency-safe certificate numbers (spec 46 — never count()+1) ───
    await S(`CREATE SEQUENCE certificate_number_seq START WITH 1 INCREMENT BY 1;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const S = queryRunner.query.bind(queryRunner);
    // Reverse dependency order — safe full rollback.
    await S(`DROP SEQUENCE IF EXISTS certificate_number_seq;`);
    await S(`DROP TABLE IF EXISTS certificates;`);
    await S(`DROP TABLE IF EXISTS certificate_policies;`);
    await S(`DROP TABLE IF EXISTS virtual_salary_ledger;`);
    await S(`DROP TABLE IF EXISTS kpi_metric_results;`);
    await S(`DROP TABLE IF EXISTS kpi_results;`);
    await S(`DROP TABLE IF EXISTS kpi_periods;`);
    await S(`DROP TABLE IF EXISTS evaluation_revisions;`);
    await S(`DROP TABLE IF EXISTS evaluation_scores;`);
    await S(`DROP TABLE IF EXISTS evaluations;`);
    await S(`DROP TABLE IF EXISTS evaluation_criteria;`);
    await S(`DROP TABLE IF EXISTS evaluation_cycles;`);
  }
}
