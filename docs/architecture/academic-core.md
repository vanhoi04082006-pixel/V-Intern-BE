# Phase 2 — Academic Core (API contracts & domain decisions)

Status: implementation complete on `feat/full-product-sqlserver-core`. SQL Server e2e
remains **NOT VERIFIED** until a real SQL Server 2019 is available (the e2e suite is
written and fails fast with `[E2E BLOCKED]` otherwise — no substitute database).

## Scope

Classes, internship sessions (with an explicit backend state machine), projects,
relational project technologies, and the transactional intern assignment lifecycle
plus the database-driven intern workspace. Sprint/Task/Recruitment/Evaluation/KPI/
Virtual Salary/Certificates/AI are explicitly OUT OF SCOPE (later phases).

## Temporary recruitment boundary (spec 6)

The Recruitment module does not exist yet. Until it lands:

- "Eligible intern" = an **active user holding the `intern` role** (DB-resolved).
- No fake recruitment state is produced anywhere; the assignment model only requires
  a user id, so Recruitment can plug in later without schema changes.
- Documented precondition for Phase 2 API testing: use a seeded intern account
  (`npm run seed:dev` creates `waiting@vintern.edu.vn`).

## Session lifecycle state machine (spec 11)

Legal transitions (enforced server-side; anything else → `409 INVALID_SESSION_TRANSITION`):

```
upcoming  → active | cancelled
active    → ending | cancelled
ending    → completed
completed → (terminal)
cancelled → (terminal)
```

Transitions are audited (`session.status_changed` with from/to); activation emits a
user-facing activity event (`session.activated`).

## Assignment transaction (spec 20) — one `DataSource.transaction`

1. Lock + validate intern row (`pessimistic_write` → `UPDLOCK, HOLDLOCK, ROWLOCK`) — active only
2. Validate target session (must be `upcoming` or `active` → else `409 SESSION_NOT_ASSIGNABLE`)
3. Lock + validate project row (must be `active` → else `409 PROJECT_NOT_ASSIGNABLE`)
4. Capacity check under the project lock (`409 PROJECT_CAPACITY_FULL`; `capacity NULL` = unlimited, documented)
5. Active-assignment pre-check (`409 ASSIGNMENT_CONFLICT`)
6. Insert assignment — DB filtered unique index `UX_assignments_intern_active` is the hard guarantee
7. Ensure session membership (idempotent)
8. Ensure project membership (idempotent, `roleInProject='intern'`)
9. Notification (`type='assignment'`, preference-aware, category `session`)
10. Audit log (`assignment.created`) — inside the transaction
11. Activity event (`intern.assigned`) — inside the transaction

Any failure rolls back **all** writes. Unique violations (2601/2627) and deadlocks
(1205) map to `409 ASSIGNMENT_CONFLICT` — never a duplicate row, never a generic 500.

Completion (`POST /assignments/:id/complete`) runs in one transaction as well:
lock → require `active` (`409 INVALID_ASSIGNMENT_TRANSITION`) → set
`status='completed'` + `completedAt` → audit + notify intern + activity. History is
never deleted.

## Intern workspace (spec 28/29)

`GET /api/v1/intern/me/workspace` — identity is ALWAYS the authenticated principal
(no `userId` accepted). Status is ALWAYS database assignment state:

```json
{ "status": "unassigned", "assignment": null }
{ "status": "active", "assignment": { "id", "project", "session", "assignedAt" } }
```

After completion the workspace returns to `unassigned` (documented Phase 2 contract:
the workspace reflects *active* assignment state only).

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| GET/POST | `/api/v1/classes`, GET/PATCH `/api/v1/classes/:id` | `classes.view` / `classes.manage` |
| GET/POST/DELETE | `/api/v1/classes/:id/members(/:userId)` | `classes.view` / `classes.manage` |
| GET/POST | `/api/v1/sessions`, GET/PATCH `/api/v1/sessions/:id` | `sessions.view` / `sessions.manage` |
| GET/POST/DELETE | `/api/v1/sessions/:id/members(/:userId)` | `sessions.view` / `sessions.manage` |
| GET/POST/DELETE | `/api/v1/sessions/:id/instructors(/:userId)` | `sessions.view` / `sessions.manage` |
| GET/POST | `/api/v1/sessions/:id/milestones`, PATCH/DELETE `/api/v1/sessions/:id/milestones/:milestoneId` | `sessions.view` / `sessions.manage` |
| GET/POST | `/api/v1/projects`, GET/PATCH `/api/v1/projects/:id` | `projects.view` / `projects.manage` |
| GET | `/api/v1/projects/:id/members` | `projects.view` |
| GET/POST | `/api/v1/assignments`, GET `/api/v1/assignments/:id` | `assignments.view` / `assignments.manage` |
| POST | `/api/v1/assignments/:id/complete` | `assignments.manage` |
| GET | `/api/v1/intern/me/workspace` | `intern.workspace.view` |

List endpoints use the Phase 1 pagination contract
`{ data, meta: { page, pageSize, total, totalPages } }`. Project list sort is a
strict whitelist (`createdAt | code | name` × `ASC | DESC`).

## Documented decisions

- **Project technologies** (spec 16): dedicated relational join table
  `project_technologies (projectId, technology)` with composite PK — never
  comma-serialized; catalog FK linkage deferred.
- **Project archive** is terminal (`archivedAt` set once; archived projects are
  read-only, `409 PROJECT_ARCHIVED`).
- **Class status** is a validated enum without a transition machine in Phase 2
  (the machine is specified for sessions).
- **Memberships** (class/session/project) are composite-PK tables; adds are
  idempotent (duplicates prevented + skipped, mirrored by DB uniques).
- **Session instructors** are validated against DB-resolved effective permissions
  (`sessions.manage`) — the FE role value is never trusted (spec 13).
- **No TypeORM relation decorators** — Phase 1 style: bare uuid FK columns +
  explicit lookups; the migrations remain the single source of truth
  (`synchronize=false`).

## Error codes

`CLASS_NOT_FOUND`, `CLASS_CODE_TAKEN`, `CLASS_DATE_RANGE_INVALID`,
`SESSION_NOT_FOUND`, `SESSION_CODE_TAKEN`, `SESSION_DATE_RANGE_INVALID`,
`INVALID_SESSION_TRANSITION`, `SESSION_NOT_ASSIGNABLE`, `INSTRUCTOR_PERMISSION_MISSING`,
`MILESTONE_NOT_FOUND`, `PROJECT_NOT_FOUND`, `PROJECT_CODE_TAKEN`,
`PROJECT_DATE_RANGE_INVALID`, `PROJECT_ARCHIVED`, `PROJECT_NOT_ASSIGNABLE`,
`PROJECT_CAPACITY_FULL`, `ASSIGNMENT_NOT_FOUND`, `ASSIGNMENT_CONFLICT`,
`INVALID_ASSIGNMENT_TRANSITION`, `INTERN_NOT_FOUND`, `USER_NOT_FOUND`.
