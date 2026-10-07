# Phase 3 — Sprint / Task Core (contracts)

Status: **READY FOR REVIEW** (SQL Server e2e written but NOT VERIFIED — no SQL Server in the sandbox; the suite fail-fasts with `[E2E BLOCKED]`, never a fake PASS).

Builds on `InitPlatformCore1759872000000` + `CreateAcademicCoreTables1759958400000` (both untouched). New migration: `CreateSprintTaskCoreTables1760044800000` — tables `sprints`, `tasks`, `task_comments`, `task_status_histories` + `task_code_seq` SEQUENCE. Full `down` path included.

---

## 1. Sprint lifecycle

State machine (`src/sprints/sprint-status.machine.ts`), DB CHECK-enforced:

```
planned  → active | cancelled
active   → completed | cancelled
completed → (terminal)
cancelled → (terminal)
```

Illegal transitions → `409 INVALID_SPRINT_TRANSITION` (details carry `from`/`to`/legal list).

### One-active invariant (spec 4)

A project has AT MOST ONE `active` sprint:

- Service pre-check under a pessimistic row lock → friendlier `409 SPRINT_ACTIVE_EXISTS` (details: `activeSprintId`).
- Hard guarantee: **filtered unique index** `UX_sprints_project_active ON sprints(projectId) WHERE [status] = 'active'` — a bypassed/raced writer still cannot create a second active sprint; the service maps the unique violation to the same 409.

### Completion policy (spec 29)

`active → completed` is rejected with `409 SPRINT_HAS_OPEN_TASKS` while open tasks exist (`status != 'done'`, not deleted). An explicit `allowOpenTasks: true` in the transition body overrides — and the override is **audited** (`sprint.status_changed` detail carries `"allowOpenTasks":true`). Existing unfinished tasks are never deleted; they simply outlive the sprint.

### Activation side effects (ONE transaction)

`planned → active` writes: status change → audit → activity (`sprint.activated`) → preference-aware notifications to every intern with an `active` assignment on the project (actor excluded; category `task`; missing preference row = enabled).

---

## 2. Task workflow

Status vocabulary is `todo / doing / review / done` everywhere (DB CHECK + machine + API — no `to_do`/`in_progress` synonyms).

```
todo   → doing
doing  → review
review → done | doing   (doing = rework, tasks.manage ONLY)
done   → (terminal)
```

- Illegal transition → `409 INVALID_TASK_TRANSITION`.
- **Intern** (own task, `tasks.update.own`): ONLY `todo→doing` and `doing→review`. Approval and rework are manage-only.
- `review → done` forces `progress = 100`; `done` is terminal (no further progress changes → 409).

### Ownership (spec 8/9/27/28)

| Actor | May do | Rejected with |
|---|---|---|
| `tasks.manage` holder | all legal transitions, metadata, sprint move, assignee change, soft delete | — |
| Intern (assignee) | `PATCH /tasks/:id/my` — status (legal subset) + progress ONLY | `403 TASK_NOT_OWNED` if not assignee |
| Intern | mutation requires an **active assignment** on the task's project | `403 ASSIGNMENT_NOT_ACTIVE` (task preserved, never deleted) |
| Anyone else | view/detail/comments/history | `403 TASK_ACCESS_DENIED` |

The assignment boundary is **DB-resolved**: an assignee must hold an `active` assignment on the task's project (`409 INVALID_ASSIGNEE`); a sprint must belong to the same project (`409 SPRINT_PROJECT_MISMATCH`). Role names are never trusted.

### Task codes (spec 11)

`{PROJECT_CODE}-{SEQ}` (e.g. `VIN-103`) from the SQL Server **SEQUENCE** `task_code_seq` — never `count()+1`. SEQUENCE values are concurrency-safe, never reused; a rolled-back transaction leaves a harmless gap. A rare unique race retries with a fresh value (max 3) → `409 TASK_CODE_CONFLICT`.

### Status history (spec 12)

Every real transition inserts a `task_status_histories` row (`fromStatus` nullable — creation seeds `null→todo`) in the SAME transaction as the task update. Progress-only updates write NO history. `GET /tasks/:id/history` returns the append-only trail oldest-first.

### Concurrency (spec 25)

- Transactions lock the task row (`pessimistic_write`) so transitions serialize.
- `tasks.version` (`@VersionColumn`) adds an optimistic predicate; a losing concurrent writer raises `OptimisticLockVersionMismatchError`, mapped to `409 TASK_VERSION_CONFLICT`.

### Notifications (spec 14/15) — exactly these events

| Event | Notified |
|---|---|
| task created with assignee / assignee changed | new assignee (actor excluded) |
| `→ review` | task creator (actor excluded) |
| `→ done` | assignee + creator (actor excluded, deduped) |
| rework `review → doing` | assignee |

Progress-slider updates and comments NEVER notify. All notifications honor per-user preferences (category `task`, missing row = enabled).

### Activity (spec 18)

`sprint.activated`, `task.assigned` (create/reassign), `task.review_submitted`, `task.completed` — nothing noisier.

### Audit (spec 17)

`sprint.created/updated/status_changed`, `task.created/updated/status_changed/assignee_changed/progress_updated/deleted`. GETs are never audited.

---

## 3. API inventory

Sprints (`sprints.view` / `sprints.manage`):

| Method | Route | Notes |
|---|---|---|
| GET | `/api/v1/sprints` | filters `projectId, sessionId, status`; pagination contract `{data, meta}` |
| POST | `/api/v1/sprints` | planned; 404 `PROJECT_NOT_FOUND`; 409 `PROJECT_NOT_ASSIGNABLE`/`SPRINT_CODE_TAKEN`; 404 `SESSION_NOT_FOUND` |
| GET | `/api/v1/sprints/:id` | project/session summaries |
| PATCH | `/api/v1/sprints/:id` | metadata; terminal frozen → 409; 400 `INVALID_SPRINT_DATES` |
| POST | `/api/v1/sprints/:id/status` | machine-enforced transition + `allowOpenTasks` override |
| GET | `/api/v1/sprints/:id/board` | REAL grouping by actual status, true counts (no hardcoded columns) |
| GET | `/api/v1/sprints/:id/completion` | total/done/open + committed/completed story points from DB (NULL when none declared) |

Tasks:

| Method | Route | Permission | Notes |
|---|---|---|---|
| GET | `/api/v1/tasks` | — (service-level) | filters `search, projectId, sprintId, assigneeId, status, priority, dueFrom, dueTo, mine` + sort whitelist `createdAt/dueDate/priority`; **non-broad callers are ALWAYS scoped to own tasks** |
| POST | `/api/v1/tasks` | `tasks.manage` | one tx: project lock, sprint/assignee validation, code, history seed, notification/activity/audit |
| GET | `/api/v1/tasks/:id` | — (service-level) | assignee OR `tasks.view`/`tasks.manage` |
| PATCH | `/api/v1/tasks/:id` | `tasks.manage` | metadata + status transition incl. rework |
| PATCH | `/api/v1/tasks/:id/my` | `tasks.update.own` | own-task safe endpoint (status subset + progress) |
| DELETE | `/api/v1/tasks/:id` | `tasks.manage` | SOFT delete (`deletedAt`), history preserved, audited |
| GET/POST | `/api/v1/tasks/:id/comments` | — (service-level) | assignee OR manage; content 1..2000 |
| GET | `/api/v1/tasks/:id/history` | — (service-level) | append-only, oldest first |

### Intern workspace extension (spec 23)

`GET /api/v1/intern/me/workspace` (identity = authenticated principal) now also returns REAL Phase 3 data:

```jsonc
{
  "status": "active",
  "assignment": { "...": "unchanged Phase 2 shape" },
  "currentSprint": { "id": "...", "code": "SP-VIN-01", "name": "...", "status": "active", "startDate": "...", "endDate": "..." }, // null when none
  "taskSummary": { "todo": 1, "doing": 1, "review": 1, "done": 0, "total": 3 },        // zeros when none
  "focusedTask": { "id": "...", "code": "VIN-102", "status": "doing", "priority": "high", "dueDate": null, "progress": 50 } // null when none
}
```

Focused-task rule: `doing > review > todo`, then `dueDate` ASC (nulls last), then `updatedAt` ASC. No fake KPI/evaluation/AI data — unassigned interns get `null`/zeros with a stable contract.

---

## 4. Permissions (idempotent bootstrap)

Added codes (existing IDs never rewritten, reruns never duplicate grants):

- `sprints.view`, `sprints.manage`
- `tasks.view`, `tasks.manage`
- `tasks.view.own`, `tasks.update.own`

Mapping: admin → everything (`grantAll`); instructor → the four manage/view codes; intern → `tasks.view.own` + `tasks.update.own` (+ unchanged `intern.workspace.view`). Intern NEVER receives `tasks.manage`/`sprints.manage`.

---

## 5. Verification status (honest)

| Gate | Status |
|---|---|
| `npm run lint` | PASS (0 errors; 6 pre-existing intentional script warnings) |
| `npm run test` | PASS — 181 unit tests (85 pre-Phase 3 + 96 new: machines, sprints service, tasks service, RBAC Phase 3 catalog) |
| `npm run build` | PASS |
| `git diff --check` | clean |
| `npm run migration:show` / e2e | **BLOCKED** — no SQL Server in the sandbox; suites are written and fail-fast with `[E2E BLOCKED]`; integration status stays NOT VERIFIED until run against a disposable SQL Server 2019 (`E2E_DB_NAME` guard) |
