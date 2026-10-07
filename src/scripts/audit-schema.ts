import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * PHASE 3.5 (spec 14/15/16) — READ-ONLY SQL Server schema audit.
 *
 * Verifies, against real SQL Server metadata (sys.* views), that:
 * - all required tables exist (Phase 1: 16, Phase 2: 10, Phase 3: 4);
 * - the task_code_seq SEQUENCE exists (Phase 3) and is absent after a
 *   Phase 3 rollback (--phase3=absent);
 * - the DB-enforced filtered unique indexes exist and really ARE filtered:
 *     UX_assignments_intern_active  (Phase 2 — one active assignment/intern)
 *     UX_sprints_project_active     (Phase 3 — one active sprint/project)
 * - the named CHECK constraints exist (status enums, dates, capacity,
 *   storyPoints >= 0, progress 0..100);
 * - critical columns use the contracted SQL Server types
 *   (nvarchar for business text — NEVER bare varchar/char/text;
 *    datetime2, uniqueidentifier, bit, int as intended);
 * - with --phase3=absent: Phase 3 objects are GONE while Phase 1/2 remain
 *   intact (used by CI after `migration:revert` to prove the rollback
 *   damaged nothing).
 *
 * The script performs ZERO writes.
 * Exit: 0 = every check passed, 1 = at least one failure.
 */

const PHASE1_TABLES = [
  'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
  'user_groups', 'group_members', 'group_roles', 'refresh_tokens',
  'catalog_types', 'catalog_items', 'system_settings', 'audit_logs',
  'activity_events', 'notifications', 'notification_preferences',
];

const PHASE2_TABLES = [
  'internship_sessions', 'session_members', 'session_instructors',
  'session_milestones', 'classes', 'class_members', 'projects',
  'project_members', 'project_technologies', 'assignments',
];

const PHASE3_TABLES = ['sprints', 'tasks', 'task_comments', 'task_status_histories'];

/** Named CHECK constraints (spec 14). */
const PHASE2_CHECKS = [
  'CK_internship_sessions_status', 'CK_internship_sessions_dates',
  'CK_session_milestones_status', 'CK_classes_status', 'CK_projects_status',
  'CK_projects_capacity', 'CK_projects_difficulty', 'CK_assignments_status',
];
const PHASE3_CHECKS = [
  'CK_sprints_status', 'CK_sprints_dates', 'CK_tasks_status',
  'CK_tasks_priority', 'CK_tasks_storyPoints', 'CK_tasks_progress',
];

/** DB-enforced filtered unique indexes (spec 14/26). */
const PHASE2_FILTERED_INDEXES = [
  { name: 'UX_assignments_intern_active', table: 'assignments' },
];
const PHASE3_FILTERED_INDEXES = [
  { name: 'UX_sprints_project_active', table: 'sprints' },
];

/** Critical column type contract (spec 15) — verified against sys.types. */
const TYPE_CONTRACT: Array<{
  table: string; column: string; type: string; nullable?: boolean;
}> = [
  { table: 'users', column: 'id', type: 'uniqueidentifier' },
  { table: 'users', column: 'email', type: 'nvarchar' },
  { table: 'users', column: 'passwordHash', type: 'nvarchar' },
  { table: 'users', column: 'status', type: 'nvarchar' },
  { table: 'users', column: 'createdAt', type: 'datetime2' },
  { table: 'audit_logs', column: 'action', type: 'nvarchar' },
  { table: 'audit_logs', column: 'createdAt', type: 'datetime2' },
  { table: 'activity_events', column: 'summary', type: 'nvarchar' },
  { table: 'notifications', column: 'title', type: 'nvarchar' },
  { table: 'notifications', column: 'readAt', type: 'datetime2', nullable: true },
  { table: 'assignments', column: 'id', type: 'uniqueidentifier' },
  { table: 'assignments', column: 'internId', type: 'uniqueidentifier' },
  { table: 'assignments', column: 'assignedAt', type: 'datetime2' },
  { table: 'assignments', column: 'completedAt', type: 'datetime2', nullable: true },
  { table: 'sprints', column: 'projectId', type: 'uniqueidentifier' },
  { table: 'sprints', column: 'startDate', type: 'datetime2' },
  { table: 'sprints', column: 'status', type: 'nvarchar' },
  { table: 'tasks', column: 'id', type: 'uniqueidentifier' },
  { table: 'tasks', column: 'code', type: 'nvarchar' },
  { table: 'tasks', column: 'title', type: 'nvarchar' },
  { table: 'tasks', column: 'storyPoints', type: 'int', nullable: true },
  { table: 'tasks', column: 'progress', type: 'int' },
  { table: 'tasks', column: 'version', type: 'int' },
  { table: 'tasks', column: 'dueDate', type: 'datetime2', nullable: true },
  { table: 'task_status_histories', column: 'taskId', type: 'uniqueidentifier' },
  { table: 'task_status_histories', column: 'createdAt', type: 'datetime2' },
  { table: 'task_comments', column: 'content', type: 'nvarchar' },
];

interface Check {
  (ok: boolean, label: string): void;
}

async function main(): Promise<void> {
  const phase3Arg = process.argv.find((a) => a.startsWith('--phase3='));
  const phase3 = phase3Arg ? phase3Arg.split('=')[1] : 'present';
  if (phase3 !== 'present' && phase3 !== 'absent') {
    console.error('[audit-schema] usage: audit-schema [--phase3=present|absent]');
    process.exit(2);
  }

  const dbName = (process.env.DB_NAME ?? process.env.E2E_DB_NAME ?? '').trim();
  if (!dbName) {
    console.error('[audit-schema] DB_NAME (or E2E_DB_NAME) is required.');
    process.exit(2);
  }

  const ds = new DataSource({
    type: 'mssql',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 1433),
    database: dbName,
    username: process.env.DB_USERNAME ?? 'vintern_app',
    password: process.env.DB_PASSWORD ?? '',
    options: {
      encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false',
      trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') !== 'false',
    },
    logging: false,
  });

  let failures = 0;
  const check: Check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures += 1;
  };

  try {
    await ds.initialize();
    console.log(`[audit-schema] database=${dbName} phase3=${phase3} (read-only)`);

    // ── Tables ─────────────────────────────────────────────────────────
    const tableRows = (await ds.query(
      `SELECT name FROM sys.tables WHERE is_ms_shipped = 0;`,
    )) as Array<{ name: string }>;
    const present = new Set(tableRows.map((r) => r.name));

    for (const t of PHASE1_TABLES) check(present.has(t), `table ${t} (Phase 1)`);
    for (const t of PHASE2_TABLES) check(present.has(t), `table ${t} (Phase 2)`);
    for (const t of PHASE3_TABLES) {
      if (phase3 === 'absent') check(!present.has(t), `table ${t} ABSENT after Phase 3 rollback`);
      else check(present.has(t), `table ${t} (Phase 3)`);
    }

    // ── SEQUENCE ───────────────────────────────────────────────────────
    const seqRows = (await ds.query(
      `SELECT name FROM sys.sequences WHERE name = N'task_code_seq';`,
    )) as Array<{ name: string }>;
    if (phase3 === 'absent') check(seqRows.length === 0, 'sequence task_code_seq ABSENT after rollback');
    else check(seqRows.length === 1, 'sequence task_code_seq exists (Phase 3)');

    // ── Filtered unique indexes (spec 14/26) ───────────────────────────
    const indexRows = (await ds.query(
      `SELECT i.name, OBJECT_NAME(i.object_id) AS tableName,
              i.is_unique, i.has_filter, i.filter_definition
         FROM sys.indexes i
        WHERE i.name IN (N'UX_assignments_intern_active', N'UX_sprints_project_active')
          AND i.is_unique = 1;`,
    )) as Array<{
      name: string; tableName: string; is_unique: boolean;
      has_filter: boolean; filter_definition: string | null;
    }>;
    const indexByName = new Map(indexRows.map((r) => [r.name, r]));

    for (const spec of PHASE2_FILTERED_INDEXES) {
      const found = indexByName.get(spec.name);
      check(
        Boolean(found) && found!.tableName === spec.table && found!.has_filter &&
          (found!.filter_definition ?? '').toLowerCase().includes('status'),
        `filtered unique index ${spec.name} on ${spec.table} (Phase 2 invariant, DB-enforced)`,
      );
    }
    for (const spec of PHASE3_FILTERED_INDEXES) {
      const found = indexByName.get(spec.name);
      if (phase3 === 'absent') {
        check(!found, `filtered index ${spec.name} ABSENT after Phase 3 rollback`);
      } else {
        check(
          Boolean(found) && found!.tableName === spec.table && found!.has_filter &&
            (found!.filter_definition ?? '').toLowerCase().includes('active'),
          `filtered unique index ${spec.name} on ${spec.table} (Phase 3 invariant, DB-enforced)`,
        );
      }
    }

    // ── CHECK constraints (spec 14) ────────────────────────────────────
    const checkRows = (await ds.query(
      `SELECT name FROM sys.check_constraints WHERE is_ms_shipped = 0
        AND name IN (${[...PHASE2_CHECKS, ...PHASE3_CHECKS].map((n) => `N'${n}'`).join(',')});`,
    )) as Array<{ name: string }>;
    const checkNames = new Set(checkRows.map((r) => r.name));
    for (const name of PHASE2_CHECKS) check(checkNames.has(name), `CHECK constraint ${name}`);
    for (const name of PHASE3_CHECKS) {
      if (phase3 === 'absent') check(!checkNames.has(name), `CHECK ${name} ABSENT after rollback`);
      else check(checkNames.has(name), `CHECK constraint ${name}`);
    }

    // ── Column type contract (spec 15) ─────────────────────────────────
    const allTables = [...PHASE1_TABLES, ...PHASE2_TABLES, ...PHASE3_TABLES];
    const colRows = (await ds.query(
      `SELECT t.name AS tableName, c.name AS columnName, ty.name AS typeName, c.is_nullable
         FROM sys.columns c
         JOIN sys.tables t ON t.object_id = c.object_id
         JOIN sys.types ty ON ty.user_type_id = c.user_type_id
        WHERE t.name IN (${allTables.map((n) => `N'${n}'`).join(',')});`,
    )) as Array<{
      tableName: string; columnName: string; typeName: string; is_nullable: boolean;
    }>;
    const colKey = (t: string, c: string) => `${t}.${c}`;
    const colMap = new Map(colRows.map((r) => [colKey(r.tableName, r.columnName), r]));

    for (const spec of TYPE_CONTRACT) {
      if (phase3 === 'absent' && PHASE3_TABLES.includes(spec.table)) continue;
      const found = colMap.get(colKey(spec.table, spec.column));
      const exists = Boolean(found);
      const typeOk = exists && found!.typeName === spec.type;
      const nullOk = spec.nullable === undefined || (exists && found!.is_nullable === spec.nullable);
      check(
        exists && typeOk && nullOk,
        `${spec.table}.${spec.column} → ${spec.type}` +
          (spec.nullable !== undefined ? (spec.nullable ? ' NULL' : ' NOT NULL') : '') +
          (!exists ? ' (missing)' : !typeOk ? ` (actual: ${found!.typeName})` : ''),
      );
    }

    // ── Zero bare varchar/char/text on business tables (spec 15) ───────
    const bareText = colRows.filter((r) => ['varchar', 'char', 'text'].includes(r.typeName));
    check(
      bareText.length === 0,
      bareText.length === 0
        ? 'zero varchar/char/text columns (all business text is nvarchar — Vietnamese-safe)'
        : `bare varchar/char/text columns found: ${bareText
            .map((r) => `${r.tableName}.${r.columnName}`)
            .join(', ')}`,
    );

    console.log(
      `[audit-schema] summary: failures=${failures} → ${failures === 0 ? 'PASS' : 'FAIL'}`,
    );
    process.exit(failures === 0 ? 0 : 1);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[audit-schema] FAILED: ${message.split('\n')[0]}`);
    process.exit(1);
  } finally {
    await ds.destroy().catch(() => undefined);
  }
}

void main();
