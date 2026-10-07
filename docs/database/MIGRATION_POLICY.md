# Database Migration Policy — V-Intern Backend

> Status: **ACTIVE since Phase 3.5** (first successful real SQL Server 2019
> verification run). This document is the contract; CI enforces it.

## 1. Verified deployment baseline (frozen migrations)

The first real SQL Server 2019 verification (GitHub Actions `backend-ci`,
SQL Server 2019 container, empty `VIntern_E2E` database) is the **deployment
baseline**. From that point forward these migrations are **FROZEN**:

| Phase | Migration                                | Frozen |
| ----- | ---------------------------------------- | ------ |
| 1     | `1759872000000-InitPlatformCore`         | YES    |
| 2     | `1759958400000-CreateAcademicCoreTables` | YES    |
| 3     | `1760044800000-CreateSprintTaskCoreTables` | YES  |

**Frozen means:** never edit these files again — not to fix bugs, not to
"improve" types, not to add indexes. Their behavior against real SQL Server
is now a verified fact; changing them would invalidate that fact.

**Pre-freeze correction (documented per §2 of the release-gate task):**
During the FIRST real SQL Server 2019 run (CI, 2026-10-07) the original
`1759958400000-CreateAcademicCoreTables` was rejected by SQL Server error
1785 ("may cause cycles or multiple cascade paths") because `assignments`
declared two FKs to `users` (`internId` CASCADE + `assignedById` SET NULL).
Smallest safe repair applied BEFORE first deployment: `FK_assignments_assignedBy`
→ `ON DELETE NO ACTION` (full rationale in the migration's REPAIR RECORD
comment). No other object was altered. With the first green CI run this
baseline becomes frozen.

If a frozen migration is ever found defective on a NEW SQL Server
environment, the repair is: a NEW corrective migration (or, only before the
first production deployment and only with the user's explicit approval, a
documented re-baseline). Never a silent edit.

## 2. Schema changes

- **Every schema change is a NEW migration file** (up + down).
- `synchronize: false` is a hard invariant — TypeORM must never be allowed
  to alter schema automatically, in any environment.
- **Never `db push`** (not in dev, not in staging, not in production). The
  CLI migration commands are the only schema mechanism:
  - `npm run migration:run`
  - `npm run migration:revert`
  - `npm run migration:show`
- `migration:generate` may only be used to SCAFFOLD a diff against the
  entities; the generated file must be reviewed, hand-named (timestamped
  prefix preserved), and its down() written manually before commit.

## 3. up()/down() expectations

- `up()`: create objects in dependency order; named constraints/indexes
  only (reviewable, drop-safe); SQL Server types (nvarchar for all
  Vietnamese business text, datetime2, uniqueidentifier, bit, int).
- `down()`: exact reverse; must leave NO object behind. CI proves this on
  every run: `migration:revert` → `audit:schema -- --phase3=absent` →
  `migration:run` → `audit:schema`.
- Enum-like columns: `nvarchar` + named `CHECK` constraints.
- Invariants that bound concurrency (one active assignment per intern,
  one active sprint per project): **filtered unique indexes in the DB**,
  never only application checks.

## 4. Testing against SQL Server

- Integration authority: GitHub Actions `backend-ci` (SQL Server 2019
  container `mcr.microsoft.com/mssql/server:2019-latest`).
- Every run starts from an EMPTY disposable database `VIntern_E2E`
  (created by `src/scripts/create-e2e-database.ts`, which refuses
  production-like names) and applies ALL migrations — this is the
  fresh-install reproducibility proof on every push/PR.
- Real-SQL-Server e2e includes concurrency (same-intern assignment race,
  capacity race, sprint-activation race, task version conflict, task-code
  sequence race), direct filtered-index violation writes, and
  controlled-failure transaction rollback proofs.
- SQLite / PostgreSQL / in-memory substitutes are FORBIDDEN for release
  verification — they prove nothing about SQL Server behavior.

## 5. Disposable E2E database

- Names must contain an `E2E`/`TEST`/`CI` token and must never look
  production-like. The guard lives in the e2e suites AND the creation
  script (defense in depth).
- Test databases are never backed up, never restored from production,
  never persisted after the CI job.

## 6. Rollback policy

- `migration:revert` reverts exactly ONE migration (the latest applied).
- Rollback is only ever run against disposable E2E databases in CI.
- **Never roll back a production database** as a routine operation: a
  rollback of a data-bearing migration can destroy business data. In
  production, forward-fix with a new migration instead.
- If a migration must be reverted in production (incident): take a full
  database backup first, verify the down() path against a restored copy
  BEFORE touching live data, and record the incident.

## 7. Production migration procedure

1. Announce a maintenance window (or verify the migration is online-safe).
2. **Full database backup immediately before `migration:run`.**
3. Run `npm run migration:run` with production credentials.
4. Run `npm run audit:schema` — must PASS before traffic resumes.
5. Record migration names + timestamps in the release notes.

## 8. Zero-downtime considerations (future breaking migrations)

For future phases, breaking changes must be decomposed into expand/
migrate/contract steps:

- **Expand**: additive migration (nullable columns, new tables, new
  indexes). Deploy; old code still works.
- **Migrate**: dual-write/backfill in code (batched, idempotent).
- **Contract**: after the old path is fully retired, a migration drops the
  legacy objects. Never in the same release as the expand step.

Large index builds on live tables: use `ONLINE = ON` where the SQL Server
edition supports it; otherwise schedule in the maintenance window.

## 9. CI enforcement summary

`backend-ci` fails if: any migration fails on a fresh SQL Server 2019
database; any required table/sequence/filtered index/CHECK is missing;
any column type drifts from the contract (nvarchar/datetime2/
uniqueidentifier/bit/int); bootstrap is not idempotent; the API health or
Swagger endpoints fail; any e2e suite (including concurrency/rollback)
fails; the Phase 3 rollback leaves Phase 1/2 damaged; or the reapply
fails.


## Phase 4 addition (2026-10)

- `1760131200000-CreateRecruitmentAiCoreTables` adds the recruitment + AI
  interview schema (recruitment_profiles, interview_questions,
  interview_sessions, interview_session_questions, interview_answers,
  recruitment_results, ai_runs).
- Phase 1/2/3 migrations remain FROZEN and untouched. Phase 4 was designed
  with the documented multi-cascade-path lessons (users→sessions,
  sessions→answers, profiles→results second paths are NO ACTION by design).
- From the first green Phase 4 CI run, this migration is FROZEN too — all
  later changes are NEW migrations.
