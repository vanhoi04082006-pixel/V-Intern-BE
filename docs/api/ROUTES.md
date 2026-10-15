# API routes

Danh mục sinh từ OpenAPI của code hiện hành, không chứa dữ liệu hoặc credential. Xem /api/docs để thử DTO/response; controller/service kiểm tra permission và ownership. Một route có Bearer không có nghĩa được truy cập mọi bản ghi. Chia sẻ chỉ snapshot đọc, không mở manage API.

Pagination chuẩn: {data,meta:{page,pageSize,total,totalPages}}. Một số aggregate/report endpoints trả shape riêng đã có adapter; không tự unwrap mọi field data. Error: statusCode, code, message, traceId và details nếu có.

| Method | Route | Mô tả |
|---|---|---|
| GET | /api/v1/recruitment/me/interviews | Lịch sử phiên/kết quả của principal, có phân trang |
| PUT | /api/v1/recruitment/me/interviews/{id}/follow-ups/{questionId} | Trả lời câu phụ đang chờ, đúng owner/expiry; replay giống hệt là idempotent |
| GET | /api/v1/activity-events | Paginated recent activity (activity.read) |
| GET | /api/v1/ai-generations/plans | AI plan history of one session (owned scope) |
| GET | /api/v1/ai-generations/plans/{id} | One AI plan with fresh warnings (owned scope) |
| POST | /api/v1/ai-generations/plans/generate | Generate and persist an AI plan draft (sprints.manage; idempotent per session+version; review before confirm) |
| POST | /api/v1/ai-generations/sprint-plan/confirm | Confirm an instructor-reviewed draft (sprints.manage; re-validated server-side; idempotent per requestId) |
| POST | /api/v1/ai-generations/sprint-plan/draft | Generate a sprint/task draft with AI (sprints.manage; managed project+session only; persists nothing) |
| GET | /api/v1/assignments | Paginated assignments (assignments.view; filters: internId, sessionId, projectId, status; own or managed-session scope) |
| POST | /api/v1/assignments | Create assignment — ONE transaction: intern lock, session/project validation, capacity, conflict check, membership ensure, notification+audit+activity (409 ASSIGNMENT_CONFLICT / PROJECT_CAPACITY_FULL / SESSION_NOT_ASSIGNABLE / PROJECT_NOT_ASSIGNABLE) |
| GET | /api/v1/assignments/{id} | Assignment detail (assignments.view; includes project/session/intern summaries; own or managed-session scope) |
| POST | /api/v1/assignments/{id}/cancel | Cancel an active assignment (assignments.manage; session roster row removed; audited; intern notified) |
| POST | /api/v1/assignments/{id}/complete | Complete an active assignment (assignments.manage; audited; intern notified; history preserved) |
| GET | /api/v1/audit-logs | Paginated audit trail (audit.read) |
| POST | /api/v1/auth/login | Login → access token + HttpOnly refresh cookie |
| POST | /api/v1/auth/register | Public intern-only signup: fullName/email/password/acceptedTerms=true; atomic role/profile/audit, no auto-login; duplicate409, closed403, rate limit |
| POST | /api/v1/auth/logout | Revoke refresh token + clear cookie (204) |
| GET | /api/v1/auth/me | Fresh principal from DB (roles + permissions) |
| POST | /api/v1/auth/refresh | Rotate refresh token (family reuse detection) |
| GET | /api/v1/catalogs/items | Paginated items of a type (?typeCode=…) |
| POST | /api/v1/catalogs/items | Create catalog item (catalogs.manage; audited) |
| PATCH | /api/v1/catalogs/items/{id} | Update catalog item (catalogs.manage; audited) |
| GET | /api/v1/catalogs/types | Paginated catalog types (catalogs.read) |
| POST | /api/v1/catalogs/types | Create catalog type (catalogs.manage; audited) |
| GET | /api/v1/certificates | Certificate list (certificates.view; filters userId/status + pagination) |
| GET | /api/v1/certificates/{id} | One certificate (certificates.view) |
| GET | /api/v1/certificates/{id}/pdf | REAL server-side PDF (spec 51-53): deterministic pdfkit document (Vietnamese-safe DejaVu), certificate number + verification code + verify URL; ISSUED certificates only — revoked → 409 (verify endpoint communicates revocation) |
| POST | /api/v1/certificates/{id}/revoke | REVOKE (admin, spec 50): requires a reason, preserves the record with revoke metadata, notifies the intern, writes audit + activity; second revoke → 409 CERTIFICATE_ALREADY_REVOKED |
| POST | /api/v1/certificates/issue | Issue a certificate (admin): deterministic V-INTERN-COMPLETE v1 eligibility (recruitment passed + completed assignment + finalized evaluation >= 70 + finalized KPI >= 70); ineligible → 409 CERTIFICATE_NOT_ELIGIBLE with structured reasons; duplicate → 409; number from the SEQUENCE (spec 42/46/49) |
| GET | /api/v1/certificates/verify/{code} | PUBLIC verification (no auth, spec 47/48): issued → { valid: true, certificateNumber, holderName, role, projectName, issuedAt }; revoked → { valid: false, status: revoked, revokedAt }; unknown code → 404. NEVER exposes email/userId/evaluation/KPI internals |
| GET | /api/v1/classes | Paginated classes (classes.view; filters: q, status, sessionId; lead-instructor scope) |
| POST | /api/v1/classes | Create class (classes.manage; audited) |
| GET | /api/v1/classes/{id} | Class detail (classes.view; lead-instructor scope) |
| PATCH | /api/v1/classes/{id} | Update class (classes.manage; audited) |
| POST | /api/v1/classes/{id}/announcements | classes |
| GET | /api/v1/classes/{id}/lessons | classes |
| POST | /api/v1/classes/{id}/lessons | classes |
| PATCH | /api/v1/classes/{id}/lessons/{lessonId} | classes |
| GET | /api/v1/classes/{id}/lessons/{lessonId}/attendance | classes |
| PUT | /api/v1/classes/{id}/lessons/{lessonId}/attendance | classes |
| GET | /api/v1/classes/{id}/members | Class members (classes.view; lead-instructor scope) |
| POST | /api/v1/classes/{id}/members | Add members (idempotent; audited) |
| DELETE | /api/v1/classes/{id}/members/{userId} | Remove member (audited) |
| GET | /api/v1/dashboard/academic | dashboard |
| GET | /api/v1/dashboard/academic-overview | dashboard |
| GET | /api/v1/dashboard/access | dashboard |
| GET | /api/v1/dashboard/admin | dashboard |
| GET | /api/v1/dashboard/catalogs | dashboard |
| GET | /api/v1/dashboard/instructor | dashboard |
| GET | /api/v1/dashboard/sprints/{id}/burndown | dashboard |
| GET | /api/v1/dashboard/user-roles | dashboard |
| GET | /api/v1/evaluation-cycles | List evaluation cycles (evaluations.view; filters: status/sessionId/projectId) |
| POST | /api/v1/evaluation-cycles | Create a draft cycle; seeds the documented evaluation-v1 template (35/30/20/15) by default — criteria editable only while draft |
| GET | /api/v1/evaluation-cycles/{id} | One evaluation cycle (evaluations.view) |
| PATCH | /api/v1/evaluation-cycles/{id} | Update a DRAFT cycle (name/dates) — open/closed/archived cycles are immutable |
| GET | /api/v1/evaluation-cycles/{id}/criteria | Cycle criteria with weights (evaluations.view) |
| POST | /api/v1/evaluation-cycles/{id}/criteria | Add a criterion (draft cycles only; weight 0<w<=100) |
| DELETE | /api/v1/evaluation-cycles/{id}/criteria/{criterionId} | Delete a criterion (draft cycles only) |
| PATCH | /api/v1/evaluation-cycles/{id}/criteria/{criterionId} | Update a criterion (draft cycles only) |
| POST | /api/v1/evaluation-cycles/{id}/status | Explicit cycle state transition (draft→open\|archived, open→closed, closed→archived); opening requires active criteria weights to total exactly 100% |
| GET | /api/v1/evaluations | List evaluations (evaluations.view; filters cycleId/internId/evaluatorId/status) |
| POST | /api/v1/evaluations | Create a draft evaluation in an OPEN cycle; evaluator defaults to principal; intern must belong to the cycle scope; ownership enforced (spec 61) |
| GET | /api/v1/evaluations/{id} | One evaluation with criterion scores (evaluations.view) |
| PATCH | /api/v1/evaluations/{id} | Upsert criterion scores (0..criterion.maxScore) + summary on a draft/submitted evaluation; overallScore is ALWAYS recomputed server-side (spec 12) |
| GET | /api/v1/evaluations/{id}/ai-suggestions | List AI suggestion history for an evaluation (ai.evaluation.assist; ownership enforced) |
| POST | /api/v1/evaluations/{id}/ai-suggestions | Generate an AI draft suggestion for an evaluation (ai.evaluation.assist; evaluator-of-record or admin; DRAFT ONLY — advisory, non-authoritative, never applied automatically; regenerations append history) |
| GET | /api/v1/evaluations/{id}/ai-suggestions/{suggestionId} | One AI suggestion (ai.evaluation.assist; ownership enforced; 404-safe for foreign rows) |
| POST | /api/v1/evaluations/{id}/finalize | submitted → finalized: backend recomputes the weighted overall, locks the evaluation, writes audit + activity and notifies the intern (one transaction) |
| POST | /api/v1/evaluations/{id}/revisions | PRIVILEGED correction of a finalized evaluation (admin policy): stays finalized, revisionNumber++, immutable revision row with previous/new overall + reason (spec 14) |
| POST | /api/v1/evaluations/{id}/submit | draft → submitted: validates required criteria + weights == 100 (evaluator-owned) |
| GET | /api/v1/github/callback | github |
| POST | /api/v1/github/connect | github |
| DELETE | /api/v1/github/me | github |
| GET | /api/v1/github/me | github |
| GET/POST | /api/v1/admin/question-bank | Private administrator bank; bounded search/filter/pagination or create |
| GET/PUT/DELETE | /api/v1/admin/question-bank/{id} | Administrator detail/versioned edit/soft retire (DELETE requires version query) |
| GET/PUT | /api/v1/admin/ai-configuration | Admin-only validated model, timeout, retry and version; no secrets |
| GET | /api/v1/admin/system/status | Admin-only actual DB/AI metrics and integration configuration presence |
| GET | /api/v1/admin/system/repositories | Admin-only paginated repository/webhook state; no tokens |
| GET | /api/v1/performance/interns/{userId}/detail | Student profile/interview, scoped task/submission pages and six UTC monthly history buckets; performance.view + ownership |
| POST | /api/v1/github/webhook | Public transport; raw-body HMAC SHA256, UUID delivery deduplication, 1 MiB limit; PR/push source observation only |
| GET | /api/v1/groups | Paginated groups (groups.read) |
| POST | /api/v1/groups | Create group (groups.manage; audited) |
| PATCH | /api/v1/groups/{id} | Update group (groups.manage; audited) |
| GET | /api/v1/groups/{id}/members | List group members (groups.read) |
| POST | /api/v1/groups/{id}/members | Add members (idempotent; audited) |
| DELETE | /api/v1/groups/{id}/members/{userId} | Remove member (audited) |
| GET | /api/v1/groups/{id}/roles | Actual role codes granted to a group (groups.read) |
| PUT | /api/v1/groups/{id}/roles | Replace group role set (groups.manage; audited) |
| GET | /api/v1/health | Liveness + SQL Server connectivity (public) |
| GET | /api/v1/imported-reviews | imported-reviews |
| PATCH | /api/v1/imported-reviews/{id} | imported-reviews |
| GET | /api/v1/intern/me/ai-mentor/conversations | My AI mentor conversations (ai.mentor.use; identity = principal; AI-generated advisory content — non-authoritative) |
| POST | /api/v1/intern/me/ai-mentor/conversations | Create an AI mentor conversation owned by the authenticated intern |
| GET | /api/v1/intern/me/ai-mentor/conversations/{id} | One of my AI mentor conversations with ordered messages (404-safe for foreign conversations) |
| POST | /api/v1/intern/me/ai-mentor/conversations/{id}/archive | Archive my conversation (logical status — rows are retained; archived conversations reject new messages; idempotent) |
| POST | /api/v1/intern/me/ai-mentor/conversations/{id}/messages | Send a message to MY conversation — persists the user message, builds authorized workspace facts, generates the AI answer (AI-generated, advisory, non-authoritative; provider failure keeps the user message and returns a stable AI_* error) |
| GET | /api/v1/intern/me/ai-recommendations | My latest AI development recommendations (ai.recommendations.view.own; AI-generated, advisory, non-authoritative; 404 until first refresh) |
| POST | /api/v1/intern/me/ai-recommendations/refresh | Refresh my recommendations — deterministic source facts are hashed; unchanged facts reuse the existing snapshot WITHOUT a provider call; changed facts generate a new snapshot (AI-generated, advisory) |
| GET | /api/v1/intern/me/certificates | My certificates (identity = principal) |
| GET | /api/v1/intern/me/certificates/{id} | One of my certificates (404-safe for foreign rows) |
| GET | /api/v1/intern/me/certificates/{id}/pdf | Download MY certificate PDF (issued only; revoked → 409) |
| GET | /api/v1/intern/me/evaluations | My FINALIZED evaluations with scores (identity = principal; drafts/submitted are internal) |
| GET | /api/v1/intern/me/evaluations/{id} | One of my finalized evaluations (404-safe for foreign/unfinished rows) |
| GET | /api/v1/intern/me/kpi | My KPI results with their periods (identity = principal) |
| GET | /api/v1/intern/me/kpi/{id} | One of my KPI results incl. provenance (404-safe for foreign results) |
| GET | /api/v1/intern/me/performance | My deterministic performance metrics (identity = principal): real derived values only — never fake charts; null = not measured (not 0) |
| GET | /api/v1/intern/me/project | My active assignment project details and technologies; principal identity only; recruitment gate; 404 when unassigned. No broad projects.view permission required. |
| GET | /api/v1/intern/me/sprint/board | My current sprint board with ONLY my tasks and true per-column counts; principal/assignment scoped, paginated per column; 404 when no active assignment/sprint. |
| GET | /api/v1/intern/me/virtual-salary | My VIRTUAL salary balance (identity = principal): { balance, unit, virtual: true, latestEntries } — derived from the ledger; this is a virtual unit and NEVER real payroll (spec 33) |
| GET | /api/v1/intern/me/virtual-salary/ledger | My ledger entries (identity = principal; optional kpiPeriodId filter + pagination) |
| GET | /api/v1/intern/me/workspace | Current-intern workspace — identity = authenticated principal (never a FE-supplied userId); status driven by DB assignment state; Phase 3 adds REAL sprint/task data: currentSprint, taskSummary, focusedTask (null/zero when unassigned) |
| GET | /api/v1/kpi-periods | List KPI periods (kpi.view; filter: status) |
| POST | /api/v1/kpi-periods | Create a KPI period (kpi.manage = admin policy): ruleVersion is pinned to kpi-v1 |
| GET | /api/v1/kpi-periods/{id} | One KPI period (kpi.view) |
| PATCH | /api/v1/kpi-periods/{id} | Edit draft/open periods only — code + ruleVersion are immutable (spec 76) |
| POST | /api/v1/kpi-periods/{id}/calculate | Run the deterministic kpi-v1 batch (open→calculating→open): per-user results + full component provenance; concurrent request → 409 KPI_CALCULATION_IN_PROGRESS; finalized periods never recalculate (spec 27/28) |
| POST | /api/v1/kpi-periods/{id}/finalize | open → finalized: locks the period permanently and notifies interns with calculated results (spec 28) |
| GET | /api/v1/kpi-periods/{id}/results | Persisted KPI results of the period, best-first (kpi.view) |
| POST | /api/v1/kpi-periods/{id}/status | Explicit KPI period state transition (draft→open, open→finalized, finalized→closed); calculating is engine-managed; finalize from open only (spec 23) |
| GET | /api/v1/kpi-results/{id} | One KPI result with FULL component provenance (values, configured/effective weights, contributions) (kpi.view) |
| GET | /api/v1/notifications | Own notifications (paginated, optional unread filter) |
| POST | /api/v1/notifications/{id}/read | Mark one as read (ownership enforced) |
| GET | /api/v1/notifications/preferences | Effective preferences (missing row = enabled) |
| PUT | /api/v1/notifications/preferences | Upsert one preference |
| POST | /api/v1/notifications/read-all | Mark all as read |
| GET | /api/v1/notifications/unread-count | Unread badge count |
| GET | /api/v1/performance/interns | Deterministic intern performance list (performance.view): real task/story-point/evaluation metrics; instructors see only interns they own (session instructor / project mentor) — spec 61 |
| GET | /api/v1/performance/interns/{userId} | Full deterministic metrics for ONE intern (performance.view): taskCompletionRate, storyPointCompletionRate, onTimeCompletionRate (null when no due-dated completions), overdueOpenTaskCount, averageEvaluationScore (null when none) — 403 for interns you do not own |
| GET | /api/v1/performance/interns/{userId}/ai-recommendations | Latest AI recommendations for one intern (ai.recommendations.view; strict session/project mentor scope or admin; advisory, non-authoritative) |
| GET | /api/v1/permissions | Paginated permissions (permissions.read) |
| POST | /api/v1/project-changes/{id}/apply | project templates |
| GET | /api/v1/project-templates | project templates |
| POST | /api/v1/project-templates | project templates |
| GET | /api/v1/project-templates/{id} | project templates |
| PATCH | /api/v1/project-templates/{id} | project templates |
| POST | /api/v1/project-templates/{id}/start | project templates |
| GET | /api/v1/projects | Paginated projects (projects.view; filters: q, status, difficulty; sort whitelist: createdAt\|code\|name; scoped to managed + unclaimed library projects) |
| POST | /api/v1/projects | Create project (projects.manage; audited; technologies relational) |
| GET | /api/v1/projects/{id} | Project detail incl. technologies (projects.view; managed + unclaimed library scope) |
| PATCH | /api/v1/projects/{id} | Update project (projects.manage; archived is terminal → 409 PROJECT_ARCHIVED; technologies REPLACE strategy) |
| GET | /api/v1/projects/{id}/changes | project templates |
| POST | /api/v1/projects/{id}/changes | project templates |
| POST | /api/v1/projects/{id}/claim | Claim an unmentored library project (projects.manage; 409 when already claimed) |
| GET | /api/v1/projects/{id}/members | Project members (projects.view; membership is assignment-driven; managed scope) |
| GET | /api/v1/projects/{id}/sessions | Sessions running on this project, scoped to managed ones (project history across cohorts) |
| GET | /api/v1/projects/{id}/slots | Role slots with live filled counts (projects.view; managed scope) |
| PUT | /api/v1/projects/{id}/slots | Replace role slots (projects.manage; managing mentor only; audited) |
| GET | /api/v1/projects/{id}/template-context | project templates |
| GET | /api/v1/projects/filter-options | projects |
| GET | /api/v1/recruitment/candidates | Candidate recruitment status list (instructor/admin read-only) |
| GET | /api/v1/recruitment/candidates/{userId} | One candidate recruitment status (read-only) |
| GET | /api/v1/recruitment/me | My recruitment profile: status, attempts, cooldown, latest result (spec 41) |
| POST | /api/v1/recruitment/me/interviews | Start an interview session: 10 sequential questions (2 introduction + 6 technical + 2 English), backend timer, attempt+cooldown enforced |
| GET | /api/v1/recruitment/me/interviews/{id} | My interview session status (own sessions only; 404-safe) |
| PUT | /api/v1/recruitment/me/interviews/{id}/answers/{questionId} | Save/update MY answer for a session question (only while in_progress and before backend expiry — spec 16/17) |
| GET | /api/v1/recruitment/me/interviews/{id}/conversation | recruitment |
| POST | /api/v1/recruitment/me/interviews/{id}/conversation/clarify | recruitment |
| POST | /api/v1/recruitment/me/interviews/{id}/conversation/next | recruitment |
| GET | /api/v1/recruitment/me/interviews/{id}/questions | Sanitized questions of MY session: id/position/category/prompt/answered — NEVER rubric or expected answers (spec 42) |
| POST | /api/v1/recruitment/me/interviews/{id}/retry-evaluation | Retry a failed evaluation (evaluation_failed only): same snapshots, same answers, no duplicate result (spec 39/40) |
| POST | /api/v1/recruitment/me/interviews/{id}/submit | Submit the interview (idempotent): validates completeness + backend timer, then runs the AI evaluation; Backend computes overall = 0.7*technical + 0.3*soft and the pass/fail decision itself (spec 4/36) |
| GET | /api/v1/recruitment/me/result | My authoritative recruitment result (backend-computed scores + decision) |
| PATCH | /api/v1/recruitment/me/role | Select my recruitment role (frontend\|backend\|qa\|business_analyst) |
| GET | /api/v1/reference-screens | List explicitly labelled image-reference sample screens |
| GET | /api/v1/reference-screens/{key} | reference-screens |
| GET | /api/v1/reports | reports |
| POST | /api/v1/reports | reports |
| GET | /api/v1/reports/{id} | reports |
| GET | /api/v1/reports/{id}/pdf | reports |
| GET | /api/v1/reports/{id}/xlsx | reports |
| GET | /api/v1/roles | Paginated roles (roles.read) |
| GET | /api/v1/roles/{id}/permissions | Paginated actual permission grants for one role; read-only policy matrix |
| GET | /api/v1/session-sharing | session sharing |
| POST | /api/v1/session-sharing | session sharing |
| POST | /api/v1/session-sharing/{id}/decision | session sharing |
| GET | /api/v1/session-sharing/{id}/snapshot | session sharing |
| GET | /api/v1/sessions | Paginated sessions (sessions.view; filters: q, status; scoped to managed sessions) |
| POST | /api/v1/sessions | Create session (sessions.manage; audited) |
| GET | /api/v1/sessions/{id} | Session detail (sessions.view; managed scope only) |
| PATCH | /api/v1/sessions/{id} | Update session (sessions.manage; status transitions enforced by the backend state machine — 409 INVALID_SESSION_TRANSITION) |
| GET | /api/v1/sessions/{id}/github | github |
| POST | /api/v1/sessions/{id}/github/invite | github |
| POST | /api/v1/sessions/{id}/github/provision | github |
| POST | /api/v1/sessions/{id}/github/webhook | Lead repository owner reconfigures its application webhook; sessions.manage |
| GET | /api/v1/sessions/{id}/github/activity | Scoped repository activity, page/pageSize; CI events are advisory |
| GET | /api/v1/sessions/{id}/instructors | Session instructors (sessions.view; managed scope only) |
| POST | /api/v1/sessions/{id}/instructors | Add instructors (sessions.manage; DB-resolved permission check on each target — 403 INSTRUCTOR_PERMISSION_MISSING) |
| DELETE | /api/v1/sessions/{id}/instructors/{userId} | Remove instructor (audited) |
| GET | /api/v1/sessions/{id}/members | Session members (sessions.view; managed scope only) |
| POST | /api/v1/sessions/{id}/members | Add members (idempotent; audited) |
| DELETE | /api/v1/sessions/{id}/members/{userId} | Remove member (audited) |
| GET | /api/v1/sessions/{id}/milestones | Session milestones (sessions.view; ordered by sortOrder; managed scope only) |
| POST | /api/v1/sessions/{id}/milestones | Create milestone (sessions.manage; audited) |
| DELETE | /api/v1/sessions/{id}/milestones/{milestoneId} | Delete milestone (sessions.manage; audited) |
| PATCH | /api/v1/sessions/{id}/milestones/{milestoneId} | Update milestone (sessions.manage; audited) |
| GET | /api/v1/sessions/instructor-options | Search/paginate qualified active instructors; public identity fields only, effective sessions.manage grants including groups |
| GET | /api/v1/sessions/member-options | sessions |
| GET | /api/v1/sessions/overview | Session management overview (sessions.view; bounded aggregate queries; scoped; no N+1) |
| GET | /api/v1/settings | All system settings (settings.read) |
| PATCH | /api/v1/settings | Upsert one setting (settings.update; audited) |
| GET | /api/v1/sprints | Paginated sprints (sprints.view; filters: projectId, sessionId, status; managed scope only) |
| POST | /api/v1/sprints | Create sprint (sprints.manage; planned status; ONE tx with audit; 409 PROJECT_NOT_ASSIGNABLE / SPRINT_CODE_TAKEN / 404 PROJECT_NOT_FOUND / SESSION_NOT_FOUND) |
| GET | /api/v1/sprints/{id} | Sprint detail (sprints.view; includes project/session summaries; managed scope only) |
| PATCH | /api/v1/sprints/{id} | Update sprint metadata (sprints.manage; name/description/goal/dates; terminal sprints frozen → 409 INVALID_SPRINT_TRANSITION; 400 INVALID_SPRINT_DATES) |
| GET | /api/v1/sprints/{id}/board | Sprint board — REAL grouping by actual task status (sprints.view; columns carry true counts, never hardcoded; ordered priority→dueDate→createdAt) |
| GET | /api/v1/sprints/{id}/completion | Sprint completion summary (sprints.view; total/done/open tasks + committed/completed story points aggregated from the DB; NULL when no task declares points) |
| POST | /api/v1/sprints/{id}/status | Sprint status transition (sprints.manage; legal: planned→active\|cancelled, active→completed\|cancelled; 409 INVALID_SPRINT_TRANSITION / SPRINT_ACTIVE_EXISTS / SPRINT_HAS_OPEN_TASKS unless allowOpenTasks=true; activation notifies project interns) |
| GET | /api/v1/submissions/{id}/code-reviews | code review |
| POST | /api/v1/submissions/{id}/code-reviews | code review |
| POST | /api/v1/submissions/{id}/review | task submissions |
| POST | /api/v1/submissions/{id}/withdraw | task submissions |
| GET | /api/v1/tasks | Paginated tasks (broad callers: filters search/projectId/sprintId/assigneeId/status/priority/due range + sort whitelist; everyone else is ALWAYS scoped to own tasks; mine=true → self) |
| POST | /api/v1/tasks | Create task (tasks.manage; ONE tx: project lock+active check, sprint/project match, assignee active-assignment check, SEQUENCE code, history seed, notification+activity+audit; 409 PROJECT_NOT_ASSIGNABLE / SPRINT_PROJECT_MISMATCH / INVALID_ASSIGNEE / TASK_CODE_CONFLICT) |
| DELETE | /api/v1/tasks/{id} | Soft-delete task (tasks.manage; deletedAt set, history preserved, audited) |
| GET | /api/v1/tasks/{id} | Task detail (assignee OR tasks.view/tasks.manage; 403 TASK_ACCESS_DENIED otherwise) |
| PATCH | /api/v1/tasks/{id} | Update task (tasks.manage; metadata + sprint move + assignee change + optional status transition incl. rework review→doing; history + notifications + audit in ONE tx; 409 SPRINT_PROJECT_MISMATCH / INVALID_ASSIGNEE / INVALID_TASK_TRANSITION / TASK_VERSION_CONFLICT) |
| GET | /api/v1/tasks/{id}/comments | Task comments (paginated, oldest first; assignee OR tasks.view/tasks.manage) |
| POST | /api/v1/tasks/{id}/comments | Add task comment (assignee OR tasks.manage holders; content 1..2000; comments on inaccessible tasks rejected 403 TASK_ACCESS_DENIED) |
| GET | /api/v1/tasks/{id}/history | Task status history (append-only, oldest first; assignee OR tasks.view/tasks.manage) |
| PATCH | /api/v1/tasks/{id}/my | Intern updates OWN task (tasks.update.own; identity = authenticated principal; ONLY status todo→doing / doing→review + progress; 403 TASK_NOT_OWNED / ASSIGNMENT_NOT_ACTIVE; 409 INVALID_TASK_TRANSITION) |
| GET | /api/v1/tasks/{id}/spec | project templates |
| GET | /api/v1/tasks/{id}/spec/source | Authorized persisted specification snapshot, unchanged by dependency status; export this object for runner catalog hashing |
| GET | /api/v1/tasks/{id}/submissions | task submissions |
| POST | /api/v1/tasks/{id}/submissions | task submissions |
| GET | /api/v1/users | Paginated user list (users.read) |
| POST | /api/v1/users | Create user (users.create; audited) |
| GET | /api/v1/users/{id} | Get one user (users.read) |
| PATCH | /api/v1/users/{id} | Update profile fields (users.update; audited) |
| PATCH | /api/v1/users/{id}/status | Set account status (users.status; audited) |
| GET | /api/v1/virtual-salary | Ledger list (admin; filters userId/type/kpiPeriodId + pagination) |
| POST | /api/v1/virtual-salary/adjustments | Ledger adjustment (admin): bonus (+), penalty (−), signed adjustment, or reversal of an existing row — always reason + audit + notification; no hidden balance edits exist anywhere (spec 37/38) |
| POST | /api/v1/virtual-salary/generate/{kpiPeriodId} | Generate virtual salary from a FINALIZED KPI period (admin): base from the virtual_salary.base_amount setting (missing → 409 VIRTUAL_SALARY_CONFIG_MISSING); UNIQUE idempotencyKey — regenerating never duplicates rows (spec 34/36) |
| GET | /api/v1/virtual-salary/users/{userId}/balance | Ledger-derived balance for one user (admin): { balance, unit, virtual: true, earnedThisPeriod, latestEntries } — SUM(ledger.amount), never a stored value (spec 40) |
