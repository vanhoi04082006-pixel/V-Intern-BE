# AI Recommendations — Architecture (Phase 6)

> Status: **ACTIVE (Phase 6)**. Recommendations explain deterministic
> metrics; they are advisory snapshots, never system changes.

## 1. Fact source (spec 30)

The Backend computes the recommendation input with the SAME deterministic
Phase-5 read model used by the performance/KPI APIs:

```json
{
  "intern": { "displayName": "…", "recruitmentRole": "…" },
  "metrics": {
    "completedTaskCount": 3, "totalTaskCount": 4,
    "taskCompletionRate": 75.0,
    "storyPointCompletionRate": 60.0,
    "onTimeCompletionRate": 66.7,
    "averageEvaluationScore": 83.8,
    "overdueOpenTaskCount": 1,
    "completedStoryPoints": 12, "committedStoryPoints": 20,
    "activeSprintProgress": 45.0
  },
  "kpi": { "periodCode": "KPI-2026-01", "ruleVersion": "kpi-v1",
           "status": "finalized", "finalScore": 83.8 },
  "latestEvaluationCriteria": [ { "code": "technical_quality", "score": 80, "weight": 35 } ],
  "taskStatusCounts": { "todo": 0, "doing": 0, "review": 0, "done": 4 }
}
```

Missing facts stay `null` (unavailable ≠ 0). The model NEVER computes a
metric from raw data and NEVER cites a metric it was not given (spec 22/31).

## 2. Output contract (spec 29/31)

```json
{
  "recommendations": [
    { "type": "time_management", "priority": "high",
      "title": "…", "reason": "…", "actions": ["…"],
      "evidenceMetricCodes": ["onTimeCompletionRate", "overdueOpenTaskCount"] }
  ],
  "summary": "…"
}
```

- `type` ∈ fixed enum: skill_focus, delivery_improvement,
  quality_improvement, time_management, communication, next_task_focus,
  sprint_focus, career_growth.
- `evidenceMetricCodes` MUST reference only supplied metric codes — an
  unknown/made-up code (e.g. `madeUpMetric`) rejects the WHOLE output with
  `AI_INVALID_RESPONSE`; nothing partial is persisted (spec 50).

## 3. Snapshots, source hash, reuse (spec 32/34/35)

- Every generated recommendation is persisted as an
  `ai_recommendation_snapshots` row: source facts JSON + validated
  recommendations JSON + `sourceHash` + promptVersion + aiRunId.
- `sourceHash = sha256(stableStringify({ schemaVersion: 1, facts }))` —
  canonical key-sorted serialization; the schema version is INSIDE the
  hash so a future shape change can never silently reuse old snapshots.
- **Reuse rule**: refresh computes the current facts hash; if it equals the
  latest snapshot's hash, the EXISTING snapshot is returned (`reused:
  true`) and the provider is NOT called — identical input never triggers a
  duplicate provider call (spec 35).
- Snapshots are immutable; a changed reality produces a NEW row (history
  preserved, nothing overwritten).

## 4. API (spec 33)

| Route | Permission | Notes |
| --- | --- | --- |
| `GET /api/v1/intern/me/ai-recommendations` | `ai.recommendations.view.own` | latest own snapshot (404 `AI_RECOMMENDATION_NOT_AVAILABLE` before first refresh) |
| `POST /api/v1/intern/me/ai-recommendations/refresh` | `ai.recommendations.view.own` | throttled generate-or-reuse |
| `GET /api/v1/performance/interns/:userId/ai-recommendations` | `ai.recommendations.view` | instructor scoped read |

Instructor scope (spec 64): session instructor of the intern's session or
project mentor of their project (or admin). Role alone is insufficient →
`403 PERFORMANCE_SCOPE_FORBIDDEN`.

Rate limit: `THROTTLE_AI_RECOMMENDATION_PER_MIN` (default 4/min); the
hash-reuse rule makes refreshes with unchanged facts cost only DB reads.

## 5. Failure behavior

Provider timeout/unavailable/invalid → failed AIRun recorded, NO snapshot
persisted, controlled `503` with the stable AI_* code. The previous valid
snapshot (if any) remains readable — no destructive updates (spec 15/45).

## 6. Prompt version (spec 51)

`performance-recommendation-v1` — never shared with the recruitment or
mentor prompts. Persisted on every run and snapshot row.

## 7. Audit / activity

`ai_recommendation.generated` (actor, target user, sourceHash, aiRunId).
No per-refresh ActivityEvents (spec 66 — noise avoidance).
