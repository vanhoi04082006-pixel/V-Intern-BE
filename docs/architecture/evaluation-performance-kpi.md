# Evaluation + Performance + KPI — Phase 5 domain policies

> Status: ACTIVE (Phase 5). Deterministic, auditable, reproducible: given
> the same persisted source data and the same rule versions, Performance,
> KPI and evaluation scores ALWAYS produce the same result. No AI, no
> randomness, no frontend-supplied scores — anywhere.

## 1. Evaluation domain (human-authoritative)

### 1.1 Cycle state machine (`evaluation_cycles.status`)

```
draft → open | archived
open  → closed
closed → archived
archived → (terminal)
```

Illegal transitions → `409 INVALID_EVALUATION_CYCLE_TRANSITION`.
Evaluations can be CREATED / SUBMITTED / FINALIZED only while the cycle is
`open` (`409 EVALUATION_CYCLE_NOT_OPEN`). Only DRAFT cycles/criteria are
editable (`409 EVALUATION_CYCLE_NOT_EDITABLE`).

### 1.2 Criteria and weights (V1 template `evaluation-v1`)

Scores are 0..100 per criterion. The documented V1 template (seeded into
every new cycle by default; criteria are a per-cycle snapshot and are never
silently rewritten):

| code                    | weight | required |
| ----------------------- | ------ | -------- |
| technical_quality       | 35     | yes      |
| delivery_execution      | 30     | yes      |
| communication_teamwork  | 20     | yes      |
| growth_ownership        | 15     | yes      |

Opening a cycle REQUIRES active criteria weights to total EXACTLY 100%
(server-validated in basis points; `409 EVALUATION_WEIGHT_INVALID`).
Finalization re-validates the same invariant.

### 1.3 Overall score — THE backend formula

```
overall = round_half_up_1dp( Σ(score_i × weight_i) / Σ(weight_i of SCORED criteria) )
```

Computed in SCALED INTEGER arithmetic (`src/common/utils/score-math.ts`):
`s10 = round(score×10)`, `w100 = round(weight×100)`,
`overall_tenths = roundHalfUp(Σ(s10×w100) / Σw100)`. When every criterion
is scored and weights total 100 this is exactly `Σ(score×weight)/100`;
unscored NON-required criteria renormalize out (mirrors the KPI
missing-component policy — documented). Required criteria unscored →
submit/finalize rejected (`409 EVALUATION_CRITERIA_INCOMPLETE`).

Worked example (unit + e2e asserted):
`85, 90, 72, 80 × 35/30/20/15 → 83.15 → 83.2` (half-up).

### 1.4 Evaluation lifecycle + uniqueness

`draft → submitted → finalized` (explicit machine). DB-enforced uniqueness:
ONE evaluation per `(cycleId, internId, evaluatorId)`. Finalization:
recomputes the overall, sets `finalizedAt`, writes audit + activity and
notifies the intern — ONE transaction. Finalized evaluations are IMMUTABLE:
edits and re-finalization → `409 EVALUATION_ALREADY_FINALIZED`.

### 1.5 Privileged revision history (spec 14)

Admin-only `POST /evaluations/:id/revisions` (admin role resolved from the
DB, not from `evaluations.manage` alone). The evaluation STAYS `finalized`;
`revisionNumber++` and an immutable `evaluation_revisions` row records
previous/new overall + reason + actor. Never a silent mutation.
Example: 83.2 → (c1 85→90) → 84.9.

### 1.6 Intern self-view

Interns see their FINALIZED evaluations only (drafts/submitted are internal
instructor state); foreign or unfinished rows are 404-safe
(`EVALUATION_NOT_FOUND`) — existence is never leaked.

### 1.7 Ownership (spec 61)

Cycle scoping: `sessionId` → session instructors; `projectId` → project
mentor; both null → admin-managed. Instructors create/submit/finalize only
inside their own scope; unrelated instructors receive
`403 EVALUATION_SCOPE_FORBIDDEN`. The intern must hold an active/completed
assignment matching the cycle scope (`409 EVALUATION_INTERN_NOT_IN_SCOPE`).

## 2. Performance read model (deterministic)

A READ MODEL over DB facts (no metric is invented, no AI):

Sources: `tasks` (soft-delete excluded), `task_status_histories` (first
`done` transition = completion timestamp — NEVER `updatedAt`), finalized
`evaluations`, `sprints`.

| metric | definition |
| ------ | ---------- |
| taskCompletionRate | completed / eligible × 100; null when no eligible tasks |
| storyPointCompletionRate | completed declared SP / committed declared SP × 100; null when nothing declared; null storyPoints NEVER count as 0 points |
| onTimeCompletionRate | first-done ≤ dueDate, over completed tasks WITH a dueDate; null when none |
| overdueOpenTaskCount | open tasks (status ≠ done) with dueDate < now |
| averageEvaluationScore | mean finalized overallScore; null when none — "not measured" ≠ 0 |
| activeSprintProgress | intern's completed SP / committed SP inside ACTIVE sprint(s); null when none |
| completedTaskCount / totalTaskCount / completedStoryPoints / committedStoryPoints | raw counts |

Period boundary: **[from, to)** on `task.createdAt` (inclusive start,
exclusive end, UTC). Evaluation average filters on `finalizedAt ∈ [from,to)`.
Interns scope their own metrics; instructors need session-instructor /
project-mentor ownership (`403 PERFORMANCE_SCOPE_FORBIDDEN`); admins see all.

## 3. KPI (rule version `kpi-v1`)

### 3.1 Formula and weights

| component | weight | source |
| --------- | ------ | ------ |
| delivery  | 50 | storyPointCompletionRate ?? taskCompletionRate |
| quality   | 30 | average finalized instructor evaluation score |
| timeliness | 20 | onTimeCompletionRate |

### 3.2 Missing-component policy (spec 25)

An unavailable component is NEVER a zero. Weights renormalize over the
AVAILABLE components:

```
KPI = Σ(value_i × w_i) / Σ(w_i available)
```

Spec example (asserted in unit + e2e): delivery 80, quality 90, timeliness
unavailable → (80×50 + 90×30)/80 = 83.75 → **83.8** (half-up, integer math).
ALL components unavailable → `status = insufficient_data`, `finalScore =
NULL` — no score, no penalty.

### 3.3 Period state machine

```
draft → open
open → calculating (engine) → open (results persisted; recalc allowed pre-finalize)
open → finalized (explicit; locks everything)
finalized → closed (terminal)
```

`calculate` claims the period under a row lock (`409
KPI_CALCULATION_IN_PROGRESS` for concurrent batches, `409
KPI_PERIOD_NOT_CALCULABLE` while draft, `409 KPI_ALREADY_FINALIZED` after
finalize). Failures always release the claim back to `open`.

### 3.4 Snapshots + provenance (spec 58)

Every result persists: ruleVersion, calculatedAt, calculatedById (null =
system), per-component rows with `sourceValue`, `configuredWeight`,
`effectiveWeight` (renormalized), `weightedContribution`, and a sourceJson
provenance block. Historical results are snapshots — later task/evaluation
changes NEVER alter a persisted KPI. Recalculation (pre-finalize) upserts
the SAME `(periodId, userId)` row (DB-unique) and replaces its component
rows — never duplicates.

### 3.5 Eligibility (spec 29)

Recruitment `passed` AND assignment activity overlapping the period
(`[assignedAt, completedAt|∞) ∩ [start, end) ≠ ∅`). Non-recruited accounts
are never calculated.

### 3.6 Rounding

All aggregation is integer half-up to exactly one decimal (see
`src/kpi/kpi-formula.ts` + `src/common/utils/score-math.ts`).

## 4. API surface

Instructor/Admin: `/api/v1/evaluation-cycles` (CRUD + `:id/status` +
`:id/criteria` CRUD), `/api/v1/evaluations` (CRUD + `:id/submit` +
`:id/finalize` + `:id/revisions`), `/api/v1/performance/interns(?:userId)`,
`/api/v1/kpi-periods` (CRUD + `:id/status` + `:id/calculate` +
`:id/finalize` + `:id/results`), `/api/v1/kpi-results/:id`.
Intern: `/api/v1/intern/me/evaluations(?:id)`, `/api/v1/intern/me/performance`,
`/api/v1/intern/me/kpi(?:id)`.

Permissions: `evaluations.view|manage|view.own`, `performance.view|view.own`,
`kpi.view|manage|view.own` (manage = admin policy). Notifications:
`evaluation.finalized`, `kpi.finalized` (categories `evaluation`, `kpi`).
