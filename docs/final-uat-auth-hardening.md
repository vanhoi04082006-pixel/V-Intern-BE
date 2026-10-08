# Final UAT: refresh rotation and logout concurrency

Baseline: `31381044d9d3b1b9eeab6baae435fc6a06e6bb3e`.

## UAT-AUTH-001 — HIGH, fixed

Concurrent requests using one refresh cookie previously validated the token outside
the transaction. Eight real HTTP requests against SQL all returned 200, creating
multiple usable descendants and bypassing single-use rotation.

Refresh and logout now acquire a transaction-owned SQL Server application lock
on the refresh family. Refresh re-reads and validates the token after obtaining
the lock. Replay/expiry/account revocations commit before the 401 is thrown;
lock timeout fails closed with 503. Logout revokes all active descendants, including
when the presented cookie was rotated by an in-flight request. Independent login
families remain independent. No schema or frozen migration changes are required.

The real SQL regression expects one 200 and seven 401 REFRESH_REUSE responses,
rejects the winning descendant after replay, and checks zero active family rows.
Additional real SQL tests cover logout with an old cookie and logout racing refresh.
Unit tests cover lock timeout and already-rotated logout cookies.

Local validation: 345 unit tests / 38 suites and 120 E2E tests / 8 suites passed.
All six migrations ran on the new disposable `VIntern_E2E_UAT_20261008` database.
Local SQL is version 17; SQL Server 2019 acceptance remains dependent on the exact
final-SHA Actions run. The final product UAT gate is still in progress.

Lock semantics: [Microsoft sp_getapplock](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-getapplock-transact-sql).
