# AI Evaluation Assistance — Architecture (Phase 6)

> Status: **ACTIVE (Phase 6)**. The Instructor remains the ONLY authority
> over evaluations (Phase 5); AI assistance is workspace tooling.

## 1. Authority boundary (spec 20/24/47)

- The AI generates **draft suggestions** grounded in deterministic DB facts.
- Suggestions are persisted ONLY in `evaluation_ai_suggestions`
  (append-only; each generation is a NEW row — history preserved).
- **Nothing** in this module writes `evaluation_scores`, `evaluations`,
  `evaluation_revisions`, or any KPI/salary/certificate table.
- There is deliberately NO "apply" endpoint (spec 26): the instructor
  copies/edits values through the NORMAL authorized evaluation API
  (`PATCH /api/v1/evaluations/:id`), which re-runs the full Phase-5
  validation and recomputes the weighted overall server-side.
- Finalization always uses the Phase-5 deterministic formula. If the AI
  suggests criterion A = 95 and the instructor saves 80, the final
  evaluation uses 80 (verified by E2E).

## 2. Suggestion schema (spec 23)

```json
{
  "criterionSuggestions": [
    { "criterionCode": "technical_quality", "suggestedScore": 82.5,
      "evidence": ["taskCompletionRate=75.0"], "comment": "…" }
  ],
  "strengths": ["…"], "improvementAreas": ["…"],
  "summary": "…", "confidence": 0.72
}
```

Validation (whole-payload rejection → `AI_INVALID_RESPONSE`):
- `criterionCode` MUST be a criterion of the evaluation's OWN cycle — an
  unknown code rejects everything (spec 23/50);
- `suggestedScore` finite 0..100 within the matched criterion maxScore
  (a score the instructor could not legally enter is rejected, not clamped);
- strings bounded; `confidence` ∈ [0,1]; duplicates rejected.

## 3. Authorized input (spec 21/22)

The provider receives ONE object `{ "evaluationContext": … }`:

- the evaluation (cycle code/name, status, existing scores, existing summary)
- the cycle's REAL criteria (code/name/weight/maxScore/description)
- intern safe identity (displayName, recruitment role)
- **backend-computed deterministic metrics** (taskCompletionRate,
  storyPointCompletionRate, onTimeCompletionRate, overdueOpenTaskCount,
  story point totals, averageEvaluationScore, activeSprintProgress)
- up to 5 open tasks (code/title/status/storyPoints/overdue)
- up to 3 previous FINALIZED evaluations of THIS intern (cycle code +
  overall only)

NOT included: other interns' data, hidden rubrics, unrelated
conversations, instructor-private material outside this evaluation.

The AI must not calculate metrics from raw data — the Backend supplies
every number (spec 22); the model explains them.

## 4. API (spec 26)

| Route | Permission | Notes |
| --- | --- | --- |
| `POST /api/v1/evaluations/:id/ai-suggestions` | `ai.evaluation.assist` | generate new suggestion version (throttled) |
| `GET /api/v1/evaluations/:id/ai-suggestions` | `ai.evaluation.assist` | history (newest first) |
| `GET /api/v1/evaluations/:id/ai-suggestions/:suggestionId` | `ai.evaluation.assist` | one suggestion |

- Status gate: generation is allowed while authoring (`draft`/`submitted`);
  a `finalized` evaluation answers `409 EVALUATION_ALREADY_FINALIZED`
  (Phase-5 stable code — corrections go through the privileged revision
  path, not AI).
- Ownership (spec 27/48/64): evaluator-of-record or admin, PLUS the
  Phase-5 scope rule (session instructor / project mentor). An unrelated
  instructor → `403 AI_EVALUATION_NOT_ALLOWED`. Interns hold no
  `ai.evaluation.assist` permission → guard-level 403.
- Rate limit: `THROTTLE_AI_EVALUATION_ASSIST_PER_MIN` (default 4/min).

## 5. Failure behavior (spec 15/45)

Provider timeout/unavailable/invalid → the failed AIRun is recorded,
NO suggestion row is written, and the API returns controlled `503` with
the stable code. No partial persistence, no fake suggestion.

## 6. Prompt version (spec 51)

`evaluation-assistance-v1` — independent of the recruitment prompt.
Changing core behavior ships `evaluation-assistance-v2`. The active
version is persisted on every AIRun and every suggestion row.

## 7. Audit

`ai_evaluation.suggestion_generated` (actor, evaluation, suggestion id,
aiRunId — no prompt, no message text). No notifications (spec 67).
