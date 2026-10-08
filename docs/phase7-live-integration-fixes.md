# Phase 7 live integration fixes

## Zero KPI earnings

Generating salaries for a finalized period with both positive and zero KPI results previously attempted to insert a zero ledger movement. The frozen SQL CHECK rejects zero amounts and rolled back the whole generation batch. Zero earnings now count as skipped without creating a ledger row. Positive earnings and repeated generation remain unchanged. Unit regression and real SQL E2E cover the mixed batch and idempotency.

## UTC SQL connections

The schema uses UTC `datetime2` values and `SYSUTCDATETIME()`. TypeORM's SQL Server driver defaults `options.useUTC` to false. On a UTC+7 host this read database-generated timestamps seven hours earlier and wrote application timestamps seven hours later. Recruitment cooldown and performance period tests reproduced the defect. Application, migration tooling and E2E connections now explicitly use UTC. A SQL round-trip regression covers a fixed instant and the database UTC clock. No migration or existing business data is rewritten.

Historical databases populated with the old non-UTC application configuration require an explicit timestamp audit before deployment; this change does not guess corrections for existing rows. Verification uses fresh disposable databases and real migrations.

Reference: https://typeorm.io/docs/drivers/microsoft-sqlserver/

## Management integration and access control

Task updates accept an optional positive `expectedVersion`. After locking the row, both own-task and management updates reject a stale version with `409 TASK_VERSION_CONFLICT` before changing data. Existing clients without the field retain their contract. Unit regressions and real SQL E2E prove stale progress and title cannot overwrite a newer update.

Evaluation cycle, criterion and evaluation reads now enforce the same project-mentor/session-instructor scope as performance. Cycle creation and cycle/criterion mutations also check this scope; Admin retains authorized global access. Typed query DTOs restore validation, numeric pagination transformation and defaults that TypeScript intersection query types did not expose to Nest's runtime validation. This also fixes groups and filtered catalog pagination observed in the real browser.

User detail now uses the existing public response mapper, excluding `passwordHash`. Read-only role-permission and group-role lookup endpoints expose actual stored grants for the Admin UI under their existing permissions. The paginated instructor directory exposes only active users with effective `sessions.manage` (direct or inherited) and only public ID, name and email, allowing real lead/mentor selection. No domain, schema, policy mutation endpoint or migration is added.

Validation: 343 unit tests and 117 real SQL E2E pass; lint has zero errors and 15 pre-existing script console warnings; build and diff check pass. Real browser journeys reproduced the pagination defects and exercise the management lookups. The salary E2E batch-count assertion now obtains the eligible/payable count from SQL because other suites can create eligible interns in the same disposable database; exact per-user earnings, balances and idempotency assertions are preserved.

## Effective Admin role filter

`GET /users?roleCode=...` now filters on the server before pagination using parameterized EXISTS for direct user roles and roles inherited from groups. The typed code validator rejects malformed codes. Real SQL regression first reproduced the missing-contract 400, then verifies no match before membership and exactly the inherited user after membership; public fields remain free of password hashes. Full 117 E2E and 343 unit tests pass. No role-assignment write contract is invented.
