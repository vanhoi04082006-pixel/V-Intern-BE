# Phase 7 live integration fixes

## Zero KPI earnings

Generating salaries for a finalized period with both positive and zero KPI results previously attempted to insert a zero ledger movement. The frozen SQL CHECK rejects zero amounts and rolled back the whole generation batch. Zero earnings now count as skipped without creating a ledger row. Positive earnings and repeated generation remain unchanged. Unit regression and real SQL E2E cover the mixed batch and idempotency.

## UTC SQL connections

The schema uses UTC `datetime2` values and `SYSUTCDATETIME()`. TypeORM's SQL Server driver defaults `options.useUTC` to false. On a UTC+7 host this read database-generated timestamps seven hours earlier and wrote application timestamps seven hours later. Recruitment cooldown and performance period tests reproduced the defect. Application, migration tooling and E2E connections now explicitly use UTC. A SQL round-trip regression covers a fixed instant and the database UTC clock. No migration or existing business data is rewritten.

Historical databases populated with the old non-UTC application configuration require an explicit timestamp audit before deployment; this change does not guess corrections for existing rows. Verification uses fresh disposable databases and real migrations.

Reference: https://typeorm.io/docs/drivers/microsoft-sqlserver/
