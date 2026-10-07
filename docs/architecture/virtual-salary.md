# Virtual Salary — Phase 5 domain policies

> Status: ACTIVE (Phase 5). LEDGER-BASED. There is NO balance column
> anywhere in the database: the authoritative balance is ALWAYS
> `SUM(virtual_salary_ledger.amount)` for the account. Historical ledger
> rows are never updated or deleted; corrections are NEW reversing
> entries. This is a VIRTUAL unit — it is never legal payroll.

## 1. Units and base configuration

- `virtual_salary.unit` system setting (default `VND_VIRTUAL`) — an
  explicit VIRTUAL-credit identifier; APIs expose `virtual: true` on every
  balance response.
- `virtual_salary.base_amount` system setting — the ONLY source of the
  base. Missing/invalid → generation fails `409 VIRTUAL_SALARY_CONFIG_MISSING`.
  The backend NEVER invents a base amount (spec 34). CI/e2e seed the
  setting explicitly.

## 2. Generation from finalized KPI (spec 35/36)

```
earned = round_half_up_int( base_amount × (finalKpiScore / 100) )
```

Example (e2e-asserted): base 10,000,000 × 83.8% → **8,380,000**.

Requirements:
- The KPI period must be `finalized` (`409 KPI_PERIOD_NOT_FINALIZED`);
  only `calculated` results with a non-null score participate
  (`insufficient_data` results never earn).
- Idempotency is DB-enforced: each earning carries the UNIQUE
  `idempotencyKey` `kpi-period:{periodId}:user:{userId}:kpi-earning:v1`.
  Regeneration skips existing keys — double requests NEVER duplicate
  money (spec 36/70).
- Ledger row: `type = 'kpi_earning'`, `sourceType = 'kpi_result'`,
  `sourceId = result.id`, `kpiPeriodId` set, metadata carries
  ruleVersion + score + baseAmount.

## 3. Adjustments (spec 37/38)

Admin-only (`virtual_salary.manage`). Signed decimal amounts, zero forbidden:

| type | stored sign | rule |
| ---- | ----------- | ---- |
| bonus | positive | amount > 0 |
| penalty | NEGATIVE | amount > 0 (stored as −amount) |
| adjustment | signed | amount ≠ 0 (either sign) |
| reversal | −source | references an existing ledger row; amount derived; a second reversal of the same row → `409 VIRTUAL_SALARY_ALREADY_REVERSED` |

Every adjustment requires a reason (audit), writes an audit row, and
notifies the affected intern. There is no hidden balance edit path — the
error surface is `VIRTUAL_SALARY_INVALID_ADJUSTMENT`.

## 4. Balance and reads (spec 40)

`GET /virtual-salary/users/:userId/balance` (admin) and
`GET /intern/me/virtual-salary` (self) return:

```json
{ "balance": 8680000, "unit": "VND_VIRTUAL", "virtual": true,
  "earnedThisPeriod": 8380000, "latestEntries": [ ... ] }
```

All values derived from the ledger at request time. Ledger reads support
pagination + `kpiPeriodId`/`type`/`userId` filters.

Worked e2e flow: earning 8,380,000 → bonus +500,000 → penalty −200,000 →
balance 8,680,000 → reversal −500,000 → balance 8,180,000.

## 5. API surface

Admin: `POST /api/v1/virtual-salary/generate/:kpiPeriodId`,
`POST /api/v1/virtual-salary/adjustments`,
`GET /api/v1/virtual-salary`, `GET /api/v1/virtual-salary/users/:userId/balance`.
Intern: `GET /api/v1/intern/me/virtual-salary`,
`GET /api/v1/intern/me/virtual-salary/ledger`.

Permissions: `virtual_salary.view|manage` (admin),
`virtual_salary.view.own` (intern). Notification category: `salary`.
