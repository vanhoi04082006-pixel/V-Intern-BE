# Danh mục endpoint theo module

Sinh từ OpenAPI của API local chính đang chạy lúc **2026-10-24T11:59:24.423Z**, code Backend G2 bb67573a38880239d13cea6d0b8dfdb662fa2891. Có **273 operations** trong **44 nhóm**. Đây là số method/path, không phải số luồng đã nghiệm thu. Nguồn schema được giữ trong evidence project-local.

Đọc [hướng dẫn API](README.md) trước; schema DTO không thay validation/policy/ownership trong service. [Kho tri thức](../KNOWLEDGE-LIBRARY.md) giải thích API K02 và phân biệt draft/publish/retrieval. Một endpoint có Bearer không tự cấp quyền đọc mọi bản ghi.

## Tìm nhanh

- [AdminSystem](#adminsystem) — 4 operations
- [AiRuntime](#airuntime) — 2 operations
- [GithubWebhook](#githubwebhook) — 1 operations
- [QuestionBank](#questionbank) — 5 operations
- [agents](#agents) — 5 operations
- [ai-generations](#ai-generations) — 5 operations
- [ai-mentor](#ai-mentor) — 5 operations
- [ai-recommendations](#ai-recommendations) — 3 operations
- [assignments](#assignments) — 5 operations
- [audit](#audit) — 2 operations
- [auth](#auth) — 5 operations
- [career-roles](#career-roles) — 8 operations
- [catalogs](#catalogs) — 5 operations
- [certificates](#certificates) — 6 operations
- [classes](#classes) — 13 operations
- [code review](#code-review) — 2 operations
- [dashboard](#dashboard) — 8 operations
- [evaluation-ai-assistance](#evaluation-ai-assistance) — 3 operations
- [evaluation-cycles](#evaluation-cycles) — 9 operations
- [evaluations](#evaluations) — 7 operations
- [github](#github) — 11 operations
- [groups](#groups) — 8 operations
- [health](#health) — 1 operations
- [imported-reviews](#imported-reviews) — 2 operations
- [intern](#intern) — 13 operations
- [knowledge](#knowledge) — 10 operations
- [kpi-periods](#kpi-periods) — 8 operations
- [kpi-results](#kpi-results) — 1 operations
- [notifications](#notifications) — 6 operations
- [performance](#performance) — 3 operations
- [project templates](#project-templates) — 17 operations
- [projects](#projects) — 10 operations
- [rbac](#rbac) — 3 operations
- [recruitment](#recruitment) — 16 operations
- [reference-screens](#reference-screens) — 2 operations
- [reports](#reports) — 5 operations
- [session sharing](#session-sharing) — 4 operations
- [sessions](#sessions) — 19 operations
- [settings](#settings) — 2 operations
- [sprints](#sprints) — 7 operations
- [task submissions](#task-submissions) — 4 operations
- [tasks](#tasks) — 9 operations
- [users](#users) — 5 operations
- [virtual-salary](#virtual-salary) — 4 operations

## AdminSystem

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/admin/system/status` | AdminSystemController_status_v1 | — |
| GET | `/api/v1/admin/system/repositories` | AdminSystemController_repositories_v1 | — |
| GET | `/api/v1/admin/system/contracts` | AdminSystemController_contracts_v1 | — |
| POST | `/api/v1/admin/system/contracts/validate` | AdminSystemController_validate_v1 | [ContractDraftDto](SCHEMAS.md#contractdraftdto) |

## AiRuntime

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/admin/ai-configuration` | AiRuntimeController_get_v1 | — |
| PUT | `/api/v1/admin/ai-configuration` | AiRuntimeController_update_v1 | — |

## GithubWebhook

| Method | Route | Thao tác | Body |
|---|---|---|---|
| POST | `/api/v1/github/webhook` | GithubWebhookController_receive_v1 | — |

## QuestionBank

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/admin/question-bank` | QuestionBankController_list_v1 | — |
| POST | `/api/v1/admin/question-bank` | QuestionBankController_create_v1 | [QuestionContentDto](SCHEMAS.md#questioncontentdto) |
| GET | `/api/v1/admin/question-bank/{id}` | QuestionBankController_get_v1 | — |
| PUT | `/api/v1/admin/question-bank/{id}` | QuestionBankController_update_v1 | [UpdateQuestionDto](SCHEMAS.md#updatequestiondto) |
| DELETE | `/api/v1/admin/question-bank/{id}` | QuestionBankController_retire_v1 | — |

## agents

| Method | Route | Thao tác | Body |
|---|---|---|---|
| POST | `/api/v1/admin/agents/knowledge-runs` | AgentsController_create_v1 | [CreateKnowledgeAgentDto](SCHEMAS.md#createknowledgeagentdto) |
| GET | `/api/v1/admin/agents/knowledge-runs/{id}` | AgentsController_get_v1 | — |
| POST | `/api/v1/admin/agents/knowledge-runs/{id}/cancel` | AgentsController_cancel_v1 | — |
| POST | `/api/v1/admin/agents/knowledge-runs/{id}/resume` | AgentsController_resume_v1 | — |
| GET | `/api/v1/admin/agents/business-runs` | BusinessAgentMonitorController_list_v1 | — |

## ai-generations

| Method | Route | Thao tác | Body |
|---|---|---|---|
| POST | `/api/v1/ai-generations/sprint-plan/draft` | Generate a sprint/task draft with AI (sprints.manage; managed project+session only; persists nothing) | [DraftSprintPlanDto](SCHEMAS.md#draftsprintplandto) |
| POST | `/api/v1/ai-generations/sprint-plan/confirm` | Confirm an instructor-reviewed draft (sprints.manage; re-validated server-side; idempotent per requestId) | [ConfirmSprintPlanDto](SCHEMAS.md#confirmsprintplandto) |
| POST | `/api/v1/ai-generations/plans/generate` | Generate and persist an AI plan draft (sprints.manage; idempotent per session+version; review before confirm) | [GeneratePlanDto](SCHEMAS.md#generateplandto) |
| GET | `/api/v1/ai-generations/plans` | AI plan history of one session (owned scope) | — |
| GET | `/api/v1/ai-generations/plans/{id}` | One AI plan with fresh warnings (owned scope) | — |

## ai-mentor

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/intern/me/ai-mentor/conversations` | My AI mentor conversations (ai.mentor.use; identity = principal; AI-generated advisory content — non-authoritative) | — |
| POST | `/api/v1/intern/me/ai-mentor/conversations` | Create an AI mentor conversation owned by the authenticated intern | [CreateAiMentorConversationDto](SCHEMAS.md#createaimentorconversationdto) |
| GET | `/api/v1/intern/me/ai-mentor/conversations/{id}` | One of my AI mentor conversations with ordered messages (404-safe for foreign conversations) | — |
| POST | `/api/v1/intern/me/ai-mentor/conversations/{id}/messages` | Send a message to MY conversation — persists the user message, builds authorized workspace facts, generates the AI answer (AI-generated, advisory, non-authoritative; provider failure keeps the user message and returns a stable AI_* error) | [SendAiMentorMessageDto](SCHEMAS.md#sendaimentormessagedto) |
| POST | `/api/v1/intern/me/ai-mentor/conversations/{id}/archive` | Archive my conversation (logical status — rows are retained; archived conversations reject new messages; idempotent) | — |

## ai-recommendations

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/intern/me/ai-recommendations` | My latest AI development recommendations (ai.recommendations.view.own; AI-generated, advisory, non-authoritative; 404 until first refresh) | — |
| POST | `/api/v1/intern/me/ai-recommendations/refresh` | Refresh my recommendations — deterministic source facts are hashed; unchanged facts reuse the existing snapshot WITHOUT a provider call; changed facts generate a new snapshot (AI-generated, advisory) | — |
| GET | `/api/v1/performance/interns/{userId}/ai-recommendations` | Latest AI recommendations for one intern (ai.recommendations.view; strict session/project mentor scope or admin; advisory, non-authoritative) | — |

## assignments

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/assignments` | Paginated assignments (assignments.view; filters: internId, sessionId, projectId, status; own or managed-session scope) | — |
| POST | `/api/v1/assignments` | Create assignment — ONE transaction: intern lock, session/project validation, capacity, conflict check, membership ensure, notification+audit+activity (409 ASSIGNMENT_CONFLICT / PROJECT_CAPACITY_FULL / SESSION_NOT_ASSIGNABLE / PROJECT_NOT_ASSIGNABLE) | [CreateAssignmentDto](SCHEMAS.md#createassignmentdto) |
| GET | `/api/v1/assignments/{id}` | Assignment detail (assignments.view; includes project/session/intern summaries; own or managed-session scope) | — |
| POST | `/api/v1/assignments/{id}/complete` | Complete an active assignment (assignments.manage; audited; intern notified; history preserved) | — |
| POST | `/api/v1/assignments/{id}/cancel` | Cancel an active assignment (assignments.manage; session roster row removed; audited; intern notified) | — |

## audit

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/audit-logs` | Paginated audit trail (audit.read) | — |
| GET | `/api/v1/activity-events` | Paginated recent activity (activity.read) | — |

## auth

| Method | Route | Thao tác | Body |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Create an intern-only account; login separately to start recruitment | [RegisterDto](SCHEMAS.md#registerdto) |
| POST | `/api/v1/auth/login` | Login → access token + HttpOnly refresh cookie | [LoginDto](SCHEMAS.md#logindto) |
| POST | `/api/v1/auth/refresh` | Rotate refresh token (family reuse detection) | — |
| POST | `/api/v1/auth/logout` | Revoke refresh token + clear cookie (204) | — |
| GET | `/api/v1/auth/me` | Fresh principal from DB (roles + permissions) | — |

## career-roles

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/admin/career-roles` | CareerRolesAdminController_list_v1 | — |
| POST | `/api/v1/admin/career-roles` | CareerRolesAdminController_create_v1 | [CreateCareerRoleDto](SCHEMAS.md#createcareerroledto) |
| GET | `/api/v1/admin/career-roles/{code}/revisions` | CareerRolesAdminController_revisions_v1 | — |
| GET | `/api/v1/admin/career-roles/{code}` | CareerRolesAdminController_get_v1 | — |
| PUT | `/api/v1/admin/career-roles/{code}` | CareerRolesAdminController_update_v1 | [UpdateCareerRoleDto](SCHEMAS.md#updatecareerroledto) |
| POST | `/api/v1/admin/career-roles/{code}/archive` | CareerRolesAdminController_archive_v1 | [CareerRoleVersionDto](SCHEMAS.md#careerroleversiondto) |
| GET | `/api/v1/career-roles` | CareerRolesCatalogController_list_v1 | — |
| GET | `/api/v1/career-roles/reference` | CareerRolesCatalogController_references_v1 | — |

## catalogs

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/catalogs/types` | Paginated catalog types (catalogs.read) | — |
| POST | `/api/v1/catalogs/types` | Create catalog type (catalogs.manage; audited) | [CreateCatalogTypeDto](SCHEMAS.md#createcatalogtypedto) |
| GET | `/api/v1/catalogs/items` | Paginated items of a type (?typeCode=…) | — |
| POST | `/api/v1/catalogs/items` | Create catalog item (catalogs.manage; audited) | [CreateCatalogItemDto](SCHEMAS.md#createcatalogitemdto) |
| PATCH | `/api/v1/catalogs/items/{id}` | Update catalog item (catalogs.manage; audited) | [UpdateCatalogItemDto](SCHEMAS.md#updatecatalogitemdto) |

## certificates

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/certificates` | Certificate list (certificates.view; filters userId/status + pagination) | — |
| POST | `/api/v1/certificates/issue` | Issue a certificate (admin): deterministic V-INTERN-COMPLETE v1 eligibility (recruitment passed + completed assignment + finalized evaluation >= 70 + finalized KPI >= 70); ineligible → 409 CERTIFICATE_NOT_ELIGIBLE with structured reasons; duplicate → 409; number from the SEQUENCE (spec 42/46/49) | [IssueCertificateDto](SCHEMAS.md#issuecertificatedto) |
| GET | `/api/v1/certificates/verify/{code}` | PUBLIC verification (no auth, spec 47/48): issued → { valid: true, certificateNumber, holderName, role, projectName, issuedAt }; revoked → { valid: false, status: revoked, revokedAt }; unknown code → 404. NEVER exposes email/userId/evaluation/KPI internals | — |
| GET | `/api/v1/certificates/{id}` | One certificate (certificates.view) | — |
| POST | `/api/v1/certificates/{id}/revoke` | REVOKE (admin, spec 50): requires a reason, preserves the record with revoke metadata, notifies the intern, writes audit + activity; second revoke → 409 CERTIFICATE_ALREADY_REVOKED | [RevokeCertificateDto](SCHEMAS.md#revokecertificatedto) |
| GET | `/api/v1/certificates/{id}/pdf` | REAL server-side PDF (spec 51-53): deterministic pdfkit document (Vietnamese-safe DejaVu), certificate number + verification code + verify URL; ISSUED certificates only — revoked → 409 (verify endpoint communicates revocation) | — |

## classes

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/classes/{id}/lessons` | ClassesController_listLessons_v1 | — |
| POST | `/api/v1/classes/{id}/lessons` | ClassesController_createLesson_v1 | [CreateClassLessonDto](SCHEMAS.md#createclasslessondto) |
| PATCH | `/api/v1/classes/{id}/lessons/{lessonId}` | ClassesController_updateLesson_v1 | [UpdateClassLessonDto](SCHEMAS.md#updateclasslessondto) |
| GET | `/api/v1/classes/{id}/lessons/{lessonId}/attendance` | ClassesController_lessonAttendance_v1 | — |
| PUT | `/api/v1/classes/{id}/lessons/{lessonId}/attendance` | ClassesController_saveLessonAttendance_v1 | [SaveAttendanceDto](SCHEMAS.md#saveattendancedto) |
| POST | `/api/v1/classes/{id}/announcements` | ClassesController_announce_v1 | [ClassAnnouncementDto](SCHEMAS.md#classannouncementdto) |
| GET | `/api/v1/classes` | Paginated classes (classes.view; filters: q, status, sessionId; lead-instructor scope) | — |
| POST | `/api/v1/classes` | Create class (classes.manage; audited) | [CreateClassDto](SCHEMAS.md#createclassdto) |
| GET | `/api/v1/classes/{id}` | Class detail (classes.view; lead-instructor scope) | — |
| PATCH | `/api/v1/classes/{id}` | Update class (classes.manage; audited) | [UpdateClassDto](SCHEMAS.md#updateclassdto) |
| GET | `/api/v1/classes/{id}/members` | Class members (classes.view; lead-instructor scope) | — |
| POST | `/api/v1/classes/{id}/members` | Add members (idempotent; audited) | [AddClassMembersDto](SCHEMAS.md#addclassmembersdto) |
| DELETE | `/api/v1/classes/{id}/members/{userId}` | Remove member (audited) | — |

## code review

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/submissions/{id}/code-reviews` | CodeReviewController_list_v1 | — |
| POST | `/api/v1/submissions/{id}/code-reviews` | CodeReviewController_run_v1 | — |

## dashboard

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/dashboard/catalogs` | DashboardController_catalogs_v1 | — |
| GET | `/api/v1/dashboard/access` | DashboardController_access_v1 | — |
| GET | `/api/v1/dashboard/user-roles` | DashboardController_userRoles_v1 | — |
| GET | `/api/v1/dashboard/academic` | DashboardController_academic_v1 | — |
| GET | `/api/v1/dashboard/academic-overview` | DashboardController_academicOverview_v1 | — |
| GET | `/api/v1/dashboard/sprints/{id}/burndown` | DashboardController_burndown_v1 | — |
| GET | `/api/v1/dashboard/admin` | DashboardController_admin_v1 | — |
| GET | `/api/v1/dashboard/instructor` | DashboardController_instructor_v1 | — |

## evaluation-ai-assistance

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/evaluations/{id}/ai-suggestions` | List AI suggestion history for an evaluation (ai.evaluation.assist; ownership enforced) | — |
| POST | `/api/v1/evaluations/{id}/ai-suggestions` | Generate an AI draft suggestion for an evaluation (ai.evaluation.assist; evaluator-of-record or admin; DRAFT ONLY — advisory, non-authoritative, never applied automatically; regenerations append history) | — |
| GET | `/api/v1/evaluations/{id}/ai-suggestions/{suggestionId}` | One AI suggestion (ai.evaluation.assist; ownership enforced; 404-safe for foreign rows) | — |

## evaluation-cycles

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/evaluation-cycles` | List evaluation cycles (evaluations.view; filters: status/sessionId/projectId) | — |
| POST | `/api/v1/evaluation-cycles` | Create a draft cycle; seeds the documented evaluation-v1 template (35/30/20/15) by default — criteria editable only while draft | [CreateEvaluationCycleDto](SCHEMAS.md#createevaluationcycledto) |
| GET | `/api/v1/evaluation-cycles/{id}` | One evaluation cycle (evaluations.view) | — |
| PATCH | `/api/v1/evaluation-cycles/{id}` | Update a DRAFT cycle (name/dates) — open/closed/archived cycles are immutable | [UpdateEvaluationCycleDto](SCHEMAS.md#updateevaluationcycledto) |
| POST | `/api/v1/evaluation-cycles/{id}/status` | Explicit cycle state transition (draft→open\|archived, open→closed, closed→archived); opening requires active criteria weights to total exactly 100% | [ChangeEvaluationCycleStatusDto](SCHEMAS.md#changeevaluationcyclestatusdto) |
| GET | `/api/v1/evaluation-cycles/{id}/criteria` | Cycle criteria with weights (evaluations.view) | — |
| POST | `/api/v1/evaluation-cycles/{id}/criteria` | Add a criterion (draft cycles only; weight 0<w<=100) | [CreateEvaluationCriterionDto](SCHEMAS.md#createevaluationcriteriondto) |
| PATCH | `/api/v1/evaluation-cycles/{id}/criteria/{criterionId}` | Update a criterion (draft cycles only) | [UpdateEvaluationCriterionDto](SCHEMAS.md#updateevaluationcriteriondto) |
| DELETE | `/api/v1/evaluation-cycles/{id}/criteria/{criterionId}` | Delete a criterion (draft cycles only) | — |

## evaluations

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/evaluations` | List evaluations (evaluations.view; filters cycleId/internId/evaluatorId/status) | — |
| POST | `/api/v1/evaluations` | Create a draft evaluation in an OPEN cycle; evaluator defaults to principal; intern must belong to the cycle scope; ownership enforced (spec 61) | [CreateEvaluationDto](SCHEMAS.md#createevaluationdto) |
| GET | `/api/v1/evaluations/{id}` | One evaluation with criterion scores (evaluations.view) | — |
| PATCH | `/api/v1/evaluations/{id}` | Upsert criterion scores (0..criterion.maxScore) + summary on a draft/submitted evaluation; overallScore is ALWAYS recomputed server-side (spec 12) | [UpdateEvaluationDto](SCHEMAS.md#updateevaluationdto) |
| POST | `/api/v1/evaluations/{id}/submit` | draft → submitted: validates required criteria + weights == 100 (evaluator-owned) | — |
| POST | `/api/v1/evaluations/{id}/finalize` | submitted → finalized: backend recomputes the weighted overall, locks the evaluation, writes audit + activity and notifies the intern (one transaction) | — |
| POST | `/api/v1/evaluations/{id}/revisions` | PRIVILEGED correction of a finalized evaluation (admin policy): stays finalized, revisionNumber++, immutable revision row with previous/new overall + reason (spec 14) | [ReviseEvaluationDto](SCHEMAS.md#reviseevaluationdto) |

## github

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/github/me` | GithubController_status_v1 | — |
| DELETE | `/api/v1/github/me` | GithubController_disconnect_v1 | — |
| GET | `/api/v1/github/repository-account` | GithubController_repositoryAccountStatus_v1 | — |
| POST | `/api/v1/github/repository-account` | GithubController_selectRepositoryAccount_v1 | — |
| POST | `/api/v1/github/connect` | GithubController_connect_v1 | — |
| GET | `/api/v1/github/callback` | GithubController_callback_v1 | — |
| GET | `/api/v1/sessions/{id}/github` | GithubController_statusRepo_v1 | — |
| POST | `/api/v1/sessions/{id}/github/provision` | GithubController_provision_v1 | — |
| POST | `/api/v1/sessions/{id}/github/invite` | GithubController_invite_v1 | — |
| POST | `/api/v1/sessions/{id}/github/webhook` | GithubController_configureWebhook_v1 | — |
| GET | `/api/v1/sessions/{id}/github/activity` | GithubController_githubActivity_v1 | — |

## groups

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/groups` | Paginated groups (groups.read) | — |
| POST | `/api/v1/groups` | Create group (groups.manage; audited) | [CreateGroupDto](SCHEMAS.md#creategroupdto) |
| PATCH | `/api/v1/groups/{id}` | Update group (groups.manage; audited) | [UpdateGroupDto](SCHEMAS.md#updategroupdto) |
| GET | `/api/v1/groups/{id}/members` | List group members (groups.read) | — |
| POST | `/api/v1/groups/{id}/members` | Add members (idempotent; audited) | [AddGroupMembersDto](SCHEMAS.md#addgroupmembersdto) |
| DELETE | `/api/v1/groups/{id}/members/{userId}` | Remove member (audited) | — |
| GET | `/api/v1/groups/{id}/roles` | Actual role codes granted to a group (groups.read) | — |
| PUT | `/api/v1/groups/{id}/roles` | Replace group role set (groups.manage; audited) | [SetGroupRolesDto](SCHEMAS.md#setgrouprolesdto) |

## health

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/health` | Liveness + SQL Server connectivity (public) | — |

## imported-reviews

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/imported-reviews` | ImportedReviewsController_list_v1 | — |
| PATCH | `/api/v1/imported-reviews/{id}` | ImportedReviewsController_update_v1 | [UpdateImportedReviewDto](SCHEMAS.md#updateimportedreviewdto) |

## intern

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/intern/me/project` | My active assignment project details and technologies; principal identity only; recruitment gate; 404 when unassigned. No broad projects.view permission required. | — |
| GET | `/api/v1/intern/me/sprint/board` | My current sprint board with ONLY my tasks and true per-column counts; principal/assignment scoped, paginated per column; 404 when no active assignment/sprint. | — |
| GET | `/api/v1/intern/me/workspace` | Current-intern workspace — identity = authenticated principal (never a FE-supplied userId); status driven by DB assignment state; Phase 3 adds REAL sprint/task data: currentSprint, taskSummary, focusedTask (null/zero when unassigned) | — |
| GET | `/api/v1/intern/me/evaluations` | My FINALIZED evaluations with scores (identity = principal; drafts/submitted are internal) | — |
| GET | `/api/v1/intern/me/evaluations/{id}` | One of my finalized evaluations (404-safe for foreign/unfinished rows) | — |
| GET | `/api/v1/intern/me/performance` | My deterministic performance metrics (identity = principal): real derived values only — never fake charts; null = not measured (not 0) | — |
| GET | `/api/v1/intern/me/kpi` | My KPI results with their periods (identity = principal) | — |
| GET | `/api/v1/intern/me/kpi/{id}` | One of my KPI results incl. provenance (404-safe for foreign results) | — |
| GET | `/api/v1/intern/me/virtual-salary` | My VIRTUAL salary balance (identity = principal): { balance, unit, virtual: true, latestEntries } — derived from the ledger; this is a virtual unit and NEVER real payroll (spec 33) | — |
| GET | `/api/v1/intern/me/virtual-salary/ledger` | My ledger entries (identity = principal; optional kpiPeriodId filter + pagination) | — |
| GET | `/api/v1/intern/me/certificates` | My certificates (identity = principal) | — |
| GET | `/api/v1/intern/me/certificates/{id}` | One of my certificates (404-safe for foreign rows) | — |
| GET | `/api/v1/intern/me/certificates/{id}/pdf` | Download MY certificate PDF (issued only; revoked → 409) | — |

## knowledge

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/admin/knowledge` | KnowledgeController_list_v1 | — |
| POST | `/api/v1/admin/knowledge` | KnowledgeController_create_v1 | [CreateKnowledgeDto](SCHEMAS.md#createknowledgedto) |
| GET | `/api/v1/admin/knowledge/{code}/revisions` | KnowledgeController_history_v1 | — |
| GET | `/api/v1/admin/knowledge/{code}/publication-check` | KnowledgeController_check_v1 | — |
| GET | `/api/v1/admin/knowledge/{code}` | KnowledgeController_get_v1 | — |
| PUT | `/api/v1/admin/knowledge/{code}` | KnowledgeController_update_v1 | [UpdateKnowledgeDto](SCHEMAS.md#updateknowledgedto) |
| POST | `/api/v1/admin/knowledge/import/dry-run` | KnowledgeController_dryRun_v1 | [KnowledgeImportDryRunDto](SCHEMAS.md#knowledgeimportdryrundto) |
| POST | `/api/v1/admin/knowledge/{code}/publish` | KnowledgeController_publish_v1 | [KnowledgeVersionDto](SCHEMAS.md#knowledgeversiondto) |
| POST | `/api/v1/admin/knowledge/{code}/archive` | KnowledgeController_archive_v1 | [KnowledgeVersionDto](SCHEMAS.md#knowledgeversiondto) |
| POST | `/api/v1/admin/knowledge/{code}/restore` | KnowledgeController_restore_v1 | [RestoreKnowledgeDto](SCHEMAS.md#restoreknowledgedto) |

## kpi-periods

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/kpi-periods` | List KPI periods (kpi.view; filter: status) | — |
| POST | `/api/v1/kpi-periods` | Create a KPI period (kpi.manage = admin policy): ruleVersion is pinned to kpi-v1 | [CreateKpiPeriodDto](SCHEMAS.md#createkpiperioddto) |
| GET | `/api/v1/kpi-periods/{id}` | One KPI period (kpi.view) | — |
| PATCH | `/api/v1/kpi-periods/{id}` | Edit draft/open periods only — code + ruleVersion are immutable (spec 76) | [UpdateKpiPeriodDto](SCHEMAS.md#updatekpiperioddto) |
| POST | `/api/v1/kpi-periods/{id}/status` | Explicit KPI period state transition (draft→open, open→finalized, finalized→closed); calculating is engine-managed; finalize from open only (spec 23) | [TransitionKpiPeriodDto](SCHEMAS.md#transitionkpiperioddto) |
| POST | `/api/v1/kpi-periods/{id}/calculate` | Run the deterministic kpi-v1 batch (open→calculating→open): per-user results + full component provenance; concurrent request → 409 KPI_CALCULATION_IN_PROGRESS; finalized periods never recalculate (spec 27/28) | — |
| POST | `/api/v1/kpi-periods/{id}/finalize` | open → finalized: locks the period permanently and notifies interns with calculated results (spec 28) | — |
| GET | `/api/v1/kpi-periods/{id}/results` | Persisted KPI results of the period, best-first (kpi.view) | — |

## kpi-results

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/kpi-results/{id}` | One KPI result with FULL component provenance (values, configured/effective weights, contributions) (kpi.view) | — |

## notifications

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/notifications` | Own notifications (paginated, optional unread filter) | — |
| GET | `/api/v1/notifications/unread-count` | Unread badge count | — |
| GET | `/api/v1/notifications/preferences` | Effective preferences (missing row = enabled) | — |
| PUT | `/api/v1/notifications/preferences` | Upsert one preference | [SetPreferenceDto](SCHEMAS.md#setpreferencedto) |
| POST | `/api/v1/notifications/{id}/read` | Mark one as read (ownership enforced) | — |
| POST | `/api/v1/notifications/read-all` | Mark all as read | — |

## performance

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/performance/interns` | Deterministic intern performance list (performance.view): real task/story-point/evaluation metrics; instructors see only interns they own (session instructor / project mentor) — spec 61 | — |
| GET | `/api/v1/performance/interns/{userId}` | Full deterministic metrics for ONE intern (performance.view): taskCompletionRate, storyPointCompletionRate, onTimeCompletionRate (null when no due-dated completions), overdueOpenTaskCount, averageEvaluationScore (null when none) — 403 for interns you do not own | — |
| GET | `/api/v1/performance/interns/{userId}/detail` | PerformanceController_studentDetail_v1 | — |

## project templates

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/intern/me/projects/{id}/learning-package` | TemplatesController_ownPackage_v1 | — |
| GET | `/api/v1/project-templates/{id}/revisions` | TemplatesController_history_v1 | — |
| GET | `/api/v1/project-templates/{id}/revisions/{version}` | TemplatesController_revision_v1 | — |
| GET | `/api/v1/project-templates/{id}/revisions/{version}/assessment` | TemplatesController_revisionAssessment_v1 | — |
| GET | `/api/v1/project-templates/{id}/assessment` | TemplatesController_assessment_v1 | — |
| GET | `/api/v1/projects/{id}/template-assessment` | TemplatesController_projectAssessment_v1 | — |
| GET | `/api/v1/project-templates` | TemplatesController_list_v1 | — |
| POST | `/api/v1/project-templates` | TemplatesController_create_v1 | [CreateTemplateDto](SCHEMAS.md#createtemplatedto) |
| GET | `/api/v1/project-templates/{id}` | TemplatesController_get_v1 | — |
| PATCH | `/api/v1/project-templates/{id}` | TemplatesController_update_v1 | [UpdateTemplateDto](SCHEMAS.md#updatetemplatedto) |
| POST | `/api/v1/project-templates/{id}/start` | TemplatesController_start_v1 | [StartTemplateDto](SCHEMAS.md#starttemplatedto) |
| GET | `/api/v1/tasks/{id}/spec` | TemplatesController_spec_v1 | — |
| GET | `/api/v1/tasks/{id}/spec/source` | TemplatesController_sourceSpec_v1 | — |
| GET | `/api/v1/projects/{id}/template-context` | TemplatesController_context_v1 | — |
| GET | `/api/v1/projects/{id}/changes` | TemplatesController_changes_v1 | — |
| POST | `/api/v1/projects/{id}/changes` | TemplatesController_propose_v1 | [ChangeRequestDto](SCHEMAS.md#changerequestdto) |
| POST | `/api/v1/project-changes/{id}/apply` | TemplatesController_apply_v1 | — |

## projects

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/projects` | Paginated projects (projects.view; filters: q, status, difficulty; sort whitelist: createdAt\|code\|name; scoped to managed + unclaimed library projects) | — |
| POST | `/api/v1/projects` | Create project (projects.manage; audited; technologies relational) | [CreateProjectDto](SCHEMAS.md#createprojectdto) |
| GET | `/api/v1/projects/filter-options` | ProjectsController_filterOptions_v1 | — |
| GET | `/api/v1/projects/{id}` | Project detail incl. technologies (projects.view; managed + unclaimed library scope) | — |
| PATCH | `/api/v1/projects/{id}` | Update project (projects.manage; archived is terminal → 409 PROJECT_ARCHIVED; technologies REPLACE strategy) | [UpdateProjectDto](SCHEMAS.md#updateprojectdto) |
| GET | `/api/v1/projects/{id}/members` | Project members (projects.view; membership is assignment-driven; managed scope) | — |
| GET | `/api/v1/projects/{id}/sessions` | Sessions running on this project, scoped to managed ones (project history across cohorts) | — |
| POST | `/api/v1/projects/{id}/claim` | Claim an unmentored library project (projects.manage; 409 when already claimed) | — |
| GET | `/api/v1/projects/{id}/slots` | Role slots with live filled counts (projects.view; managed scope) | — |
| PUT | `/api/v1/projects/{id}/slots` | Replace role slots (projects.manage; managing mentor only; audited) | [SetProjectSlotsDto](SCHEMAS.md#setprojectslotsdto) |

## rbac

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/roles` | Paginated roles (roles.read) | — |
| GET | `/api/v1/permissions` | Paginated permissions (permissions.read) | — |
| GET | `/api/v1/roles/{id}/permissions` | Paginated actual permission grants for one role; read-only policy matrix | — |

## recruitment

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/recruitment/me` | My recruitment profile: status, attempts, cooldown, latest result (spec 41) | — |
| GET | `/api/v1/recruitment/me/interviews` | My interview attempts and persisted results, newest attempt first | — |
| POST | `/api/v1/recruitment/me/interviews` | Start an interview session: 10 sequential questions (2 introduction + 6 technical + 2 English), backend timer, attempt+cooldown enforced | — |
| PATCH | `/api/v1/recruitment/me/role` | Select a career code from the published recruiting catalog | [SelectRoleDto](SCHEMAS.md#selectroledto) |
| GET | `/api/v1/recruitment/me/interviews/{id}` | My interview session status (own sessions only; 404-safe) | — |
| GET | `/api/v1/recruitment/me/interviews/{id}/questions` | Sanitized questions of MY session: id/position/category/prompt/answered — NEVER rubric or expected answers (spec 42) | — |
| GET | `/api/v1/recruitment/me/interviews/{id}/conversation` | RecruitmentController_conversationView_v1 | — |
| POST | `/api/v1/recruitment/me/interviews/{id}/conversation/clarify` | RecruitmentController_clarifyConversation_v1 | — |
| POST | `/api/v1/recruitment/me/interviews/{id}/conversation/next` | RecruitmentController_nextConversation_v1 | — |
| PUT | `/api/v1/recruitment/me/interviews/{id}/answers/{questionId}` | Save/update MY answer for a session question (only while in_progress and before backend expiry — spec 16/17) | [SaveAnswerDto](SCHEMAS.md#saveanswerdto) |
| PUT | `/api/v1/recruitment/me/interviews/{id}/follow-ups/{questionId}` | RecruitmentController_answerFollowUp_v1 | [SaveAnswerDto](SCHEMAS.md#saveanswerdto) |
| POST | `/api/v1/recruitment/me/interviews/{id}/submit` | Submit the interview (idempotent): validates completeness + backend timer, then runs the AI evaluation; Backend computes overall = 0.7*technical + 0.3*soft and the pass/fail decision itself (spec 4/36) | — |
| POST | `/api/v1/recruitment/me/interviews/{id}/retry-evaluation` | Retry a failed evaluation (evaluation_failed only): same snapshots, same answers, no duplicate result (spec 39/40) | — |
| GET | `/api/v1/recruitment/me/result` | My authoritative recruitment result (backend-computed scores + decision) | — |
| GET | `/api/v1/recruitment/candidates` | Candidate recruitment status list (instructor/admin read-only) | — |
| GET | `/api/v1/recruitment/candidates/{userId}` | One candidate recruitment status (read-only) | — |

## reference-screens

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/reference-screens` | List explicitly labelled image-reference sample screens | — |
| GET | `/api/v1/reference-screens/{key}` | ReferenceController_get_v1 | — |

## reports

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/reports` | ReportsController_list_v1 | — |
| POST | `/api/v1/reports` | ReportsController_create_v1 | [CreateReportDto](SCHEMAS.md#createreportdto) |
| GET | `/api/v1/reports/{id}` | ReportsController_get_v1 | — |
| GET | `/api/v1/reports/{id}/pdf` | ReportsController_download_v1 | — |
| GET | `/api/v1/reports/{id}/xlsx` | ReportsController_downloadExcel_v1 | — |

## session sharing

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/session-sharing` | SharingController_list_v1 | — |
| POST | `/api/v1/session-sharing` | SharingController_request_v1 | [RequestAccessDto](SCHEMAS.md#requestaccessdto) |
| POST | `/api/v1/session-sharing/{id}/decision` | SharingController_decide_v1 | [DecideAccessDto](SCHEMAS.md#decideaccessdto) |
| GET | `/api/v1/session-sharing/{id}/snapshot` | SharingController_snapshot_v1 | — |

## sessions

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/sessions` | Paginated sessions (sessions.view; filters: q, status; scoped to managed sessions) | — |
| POST | `/api/v1/sessions` | Create session (sessions.manage; audited) | [CreateSessionDto](SCHEMAS.md#createsessiondto) |
| GET | `/api/v1/sessions/overview` | Session management overview (sessions.view; bounded aggregate queries; scoped; no N+1) | — |
| GET | `/api/v1/sessions/instructor-options` | Search/paginate qualified active instructors; public identity fields only, effective sessions.manage grants including groups | — |
| GET | `/api/v1/sessions/member-options` | SessionsController_memberOptions_v1 | — |
| GET | `/api/v1/sessions/{id}` | Session detail (sessions.view; managed scope only) | — |
| PATCH | `/api/v1/sessions/{id}` | Update session (sessions.manage; status transitions enforced by the backend state machine — 409 INVALID_SESSION_TRANSITION) | [UpdateSessionDto](SCHEMAS.md#updatesessiondto) |
| GET | `/api/v1/sessions/{id}/work` | Session work page with dependency, latest submission and AI/human review facts; managed task scope | — |
| GET | `/api/v1/sessions/{id}/timeline` | SessionsController_timeline_v1 | — |
| GET | `/api/v1/sessions/{id}/members` | Session members (sessions.view; managed scope only) | — |
| POST | `/api/v1/sessions/{id}/members` | Add members (idempotent; audited) | [AddSessionMembersDto](SCHEMAS.md#addsessionmembersdto) |
| DELETE | `/api/v1/sessions/{id}/members/{userId}` | Remove member (audited) | — |
| GET | `/api/v1/sessions/{id}/instructors` | Session instructors (sessions.view; managed scope only) | — |
| POST | `/api/v1/sessions/{id}/instructors` | Add instructors (sessions.manage; DB-resolved permission check on each target — 403 INSTRUCTOR_PERMISSION_MISSING) | [AddSessionInstructorsDto](SCHEMAS.md#addsessioninstructorsdto) |
| DELETE | `/api/v1/sessions/{id}/instructors/{userId}` | Remove instructor (audited) | — |
| GET | `/api/v1/sessions/{id}/milestones` | Session milestones (sessions.view; ordered by sortOrder; managed scope only) | — |
| POST | `/api/v1/sessions/{id}/milestones` | Create milestone (sessions.manage; audited) | [CreateMilestoneDto](SCHEMAS.md#createmilestonedto) |
| PATCH | `/api/v1/sessions/{id}/milestones/{milestoneId}` | Update milestone (sessions.manage; audited) | [UpdateMilestoneDto](SCHEMAS.md#updatemilestonedto) |
| DELETE | `/api/v1/sessions/{id}/milestones/{milestoneId}` | Delete milestone (sessions.manage; audited) | — |

## settings

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/settings` | All system settings (settings.read) | — |
| PATCH | `/api/v1/settings` | Upsert one setting (settings.update; audited) | [UpdateSettingDto](SCHEMAS.md#updatesettingdto) |

## sprints

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/sprints` | Paginated sprints (sprints.view; filters: projectId, sessionId, status; managed scope only) | — |
| POST | `/api/v1/sprints` | Create sprint (sprints.manage; planned status; ONE tx with audit; 409 PROJECT_NOT_ASSIGNABLE / SPRINT_CODE_TAKEN / 404 PROJECT_NOT_FOUND / SESSION_NOT_FOUND) | [CreateSprintDto](SCHEMAS.md#createsprintdto) |
| GET | `/api/v1/sprints/{id}` | Sprint detail (sprints.view; includes project/session summaries; managed scope only) | — |
| PATCH | `/api/v1/sprints/{id}` | Update sprint metadata (sprints.manage; name/description/goal/dates; terminal sprints frozen → 409 INVALID_SPRINT_TRANSITION; 400 INVALID_SPRINT_DATES) | [UpdateSprintDto](SCHEMAS.md#updatesprintdto) |
| POST | `/api/v1/sprints/{id}/status` | Sprint status transition (sprints.manage; legal: planned→active\|cancelled, active→completed\|cancelled; 409 INVALID_SPRINT_TRANSITION / SPRINT_ACTIVE_EXISTS / SPRINT_HAS_OPEN_TASKS unless allowOpenTasks=true; activation notifies project interns) | [TransitionSprintDto](SCHEMAS.md#transitionsprintdto) |
| GET | `/api/v1/sprints/{id}/board` | Sprint board — REAL grouping by actual task status (sprints.view; columns carry true counts, never hardcoded; ordered priority→dueDate→createdAt) | — |
| GET | `/api/v1/sprints/{id}/completion` | Sprint completion summary (sprints.view; total/done/open tasks + committed/completed story points aggregated from the DB; NULL when no task declares points) | — |

## task submissions

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/tasks/{id}/submissions` | SubmissionsController_list_v1 | — |
| POST | `/api/v1/tasks/{id}/submissions` | SubmissionsController_submit_v1 | [SubmitTaskDto](SCHEMAS.md#submittaskdto) |
| POST | `/api/v1/submissions/{id}/withdraw` | SubmissionsController_withdraw_v1 | — |
| POST | `/api/v1/submissions/{id}/review` | SubmissionsController_review_v1 | [ReviewSubmissionDto](SCHEMAS.md#reviewsubmissiondto) |

## tasks

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/tasks` | Paginated tasks (broad callers: filters search/projectId/sprintId/assigneeId/status/priority/due range + sort whitelist; everyone else is ALWAYS scoped to own tasks; mine=true → self) | — |
| POST | `/api/v1/tasks` | Create task (tasks.manage; ONE tx: project lock+active check, sprint/project match, assignee active-assignment check, SEQUENCE code, history seed, notification+activity+audit; 409 PROJECT_NOT_ASSIGNABLE / SPRINT_PROJECT_MISMATCH / INVALID_ASSIGNEE / TASK_CODE_CONFLICT) | [CreateTaskDto](SCHEMAS.md#createtaskdto) |
| GET | `/api/v1/tasks/{id}` | Task detail (assignee OR tasks.view/tasks.manage; 403 TASK_ACCESS_DENIED otherwise) | — |
| PATCH | `/api/v1/tasks/{id}` | Update task (tasks.manage; metadata + sprint move + assignee change + optional status transition incl. rework review→doing; history + notifications + audit in ONE tx; 409 SPRINT_PROJECT_MISMATCH / INVALID_ASSIGNEE / INVALID_TASK_TRANSITION / TASK_VERSION_CONFLICT) | [UpdateTaskDto](SCHEMAS.md#updatetaskdto) |
| DELETE | `/api/v1/tasks/{id}` | Soft-delete task (tasks.manage; deletedAt set, history preserved, audited) | — |
| PATCH | `/api/v1/tasks/{id}/my` | Intern updates OWN task (tasks.update.own; identity = authenticated principal; ONLY status todo→doing / doing→review + progress; 403 TASK_NOT_OWNED / ASSIGNMENT_NOT_ACTIVE; 409 INVALID_TASK_TRANSITION) | [UpdateMyTaskDto](SCHEMAS.md#updatemytaskdto) |
| GET | `/api/v1/tasks/{id}/comments` | Task comments (paginated, oldest first; assignee OR tasks.view/tasks.manage) | — |
| POST | `/api/v1/tasks/{id}/comments` | Add task comment (assignee OR tasks.manage holders; content 1..2000; comments on inaccessible tasks rejected 403 TASK_ACCESS_DENIED) | [CreateTaskCommentDto](SCHEMAS.md#createtaskcommentdto) |
| GET | `/api/v1/tasks/{id}/history` | Task status history (append-only, oldest first; assignee OR tasks.view/tasks.manage) | — |

## users

| Method | Route | Thao tác | Body |
|---|---|---|---|
| GET | `/api/v1/users` | Paginated user list (users.read) | — |
| POST | `/api/v1/users` | Create user (users.create; audited) | [CreateUserDto](SCHEMAS.md#createuserdto) |
| GET | `/api/v1/users/{id}` | Get one user (users.read) | — |
| PATCH | `/api/v1/users/{id}` | Update profile fields (users.update; audited) | [UpdateUserDto](SCHEMAS.md#updateuserdto) |
| PATCH | `/api/v1/users/{id}/status` | Set account status (users.status; audited) | [SetUserStatusDto](SCHEMAS.md#setuserstatusdto) |

## virtual-salary

| Method | Route | Thao tác | Body |
|---|---|---|---|
| POST | `/api/v1/virtual-salary/generate/{kpiPeriodId}` | Generate virtual salary from a FINALIZED KPI period (admin): base from the virtual_salary.base_amount setting (missing → 409 VIRTUAL_SALARY_CONFIG_MISSING); UNIQUE idempotencyKey — regenerating never duplicates rows (spec 34/36) | — |
| POST | `/api/v1/virtual-salary/adjustments` | Ledger adjustment (admin): bonus (+), penalty (−), signed adjustment, or reversal of an existing row — always reason + audit + notification; no hidden balance edits exist anywhere (spec 37/38) | [CreateSalaryAdjustmentDto](SCHEMAS.md#createsalaryadjustmentdto) |
| GET | `/api/v1/virtual-salary` | Ledger list (admin; filters userId/type/kpiPeriodId + pagination) | — |
| GET | `/api/v1/virtual-salary/users/{userId}/balance` | Ledger-derived balance for one user (admin): { balance, unit, virtual: true, earnedThisPeriod, latestEntries } — SUM(ledger.amount), never a stored value (spec 40) | — |
