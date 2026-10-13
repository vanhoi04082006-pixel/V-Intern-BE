# Safe integration — instructor project-first workflow

Updated: 2026-10-13, Asia/Bangkok. This document supersedes the old planning target in instructor-workflow-merge-preparation.md. No push, Pull Request, deployment or merge into main has been performed.

## Approved target and durable branches

The user explicitly selected origin/main for BOTH repositories. feat/instructor-workflow-redesign is a separate old workstream, not the PR target.

| Repository | Durable worktree | Integration branch | Source checkpoint | Fresh origin/main |
|---|---|---|---|---|
| FE | E:\Projects\V-INTERN\integration-worktrees\fe | integration/instructor-project-first | dcea1abfeccd40a5d5a0e17dc461d09cfb557a34 | 48617b032ac4c9a0b98d98fced56dd377ffbafbb |
| BE | E:\Projects\V-INTERN\integration-worktrees\be | integration/instructor-project-first | 4ae12bafab21901414319202abb8e4eeea6d19b1 | 6b61b820572bb607b10c139f7b57625dcf5db35b |

Normal fetch of main completed for each repository. Main is the exact merge-base/ancestor of each source checkpoint: FE 0 left / 22 right; BE 0 left / 31 right. New integration branches were created from main, then fast-forwarded to the full source checkpoint. All 13 checkpoint commits AND their earlier dependency/P0 commits are retained with original SHAs. No cherry-pick, duplicate commit, history rewrite, force push or main branch update. BE's amended source lineage and old tracking lineage are preserved; no attempt to force the source over its divergent remote branch.

GitHub branch API reports protected:false for both main branches. The effective branch-rules endpoint returned HTTP403 with a plan/feature availability message; rulesets cannot be independently certified from that endpoint. No protection settings were changed. Future PR review should enforce test gates even though protection was not enabled.

Both worktrees' common Git directories are in the original repositories ON E:, not Temp. Dependencies were installed with npm ci --no-audit --no-fund --ignore-scripts in each durable worktree. Tests/builds use these local dependencies. No node_modules junction to Temp. The original working files and indexes remain untouched.

## Source and snapshot integrity

Post-checkpoint snapshot E:\Projects\V-INTERN\handoff-snapshots\20261013-checkpoint-commits was independently verified: completed/verified summary, exact source HEADs, manifest SHA256, bundle SHA256, git bundle verify, every source/backup file hash and full tracked/nonignored-untracked coverage (469 FE / 357 BE files). No implementation file is missing. FE local AGENTS.md/CLAUDE.md and BE temporary run-m1-e2e.cjs remain protected in the snapshot; they are not hidden runtime prerequisites.

A separate byte-verified backup of both dirty original workstreams was created BEFORE overlap review:
E:\Projects\V-INTERN\integration-evidence\20261013\fe|be\original-source
with SHA256 manifests, original status, tracked binary patch and staged patch. It covers 472 FE / 373 BE tracked and nonignored-untracked files, including binary assets. Ignored env files, credentials, caches and dependencies are excluded.

At creation, each durable tracked tree was exactly equal to its source checkpoint. Product source/tests/migrations remain unchanged by integration; the only later integration commits are handoff/PR preparation documentation. Full PR delta includes earlier prerequisites: 82 FE files and 122 BE files before integration documentation, rather than only the last 13 commits.

## The 30 FE + 4 BE overlapping paths

These are overlaps with the ORIGINAL DIRTY WORKSTREAM, not conflicts with the approved target main. Main integration had ZERO textual Git conflicts. No dirty-original change was silently selected via ours/theirs. Raw original/checkpoint/base copies, LF-normalized three-way previews and complete per-path diffs are retained in integration-evidence/20261013/{fe,be}/comparisons; normalized-overlaps.json identifies exact matches.

Decision: this PR contains the completed, independently reviewed instructor workflow. Separate original UI redesign/manual recruitment work remains in its original dirty checkout and verified backup, not silently imported into this PR. Valid deferred enhancements below need their own dependency/security tests and workstream integration; backup preservation is NOT a claim that those behaviors were merged. No original file was overwritten or deleted.

| FE path (relative) | Comparison and integration decision |
|---|---|
| src/app/instructor/page.tsx | Retain InstructorHome. Original InstructorDashboard restores Class-oriented home. |
| src/app/instructor/projects/page.tsx | Retain database ProjectLibrary; original combines old template consumer and AcademicList. |
| src/app/instructor/reports/page.tsx | Retain project/session search-param scoped ReportsWorkspace. |
| src/components/product/academic-insights.tsx | Exact bytes match; original work is already included. |
| src/components/product/academic-picker.tsx | Retain project-scoped query and UUID normalization. Original compact expand/search UI deferred separately. |
| src/components/product/admin-management.tsx | Separate large admin redesign/dependencies deferred. Keep existing Can permission gates; original removes these gates. |
| src/components/product/class-attendance-summary.ts | Exact match; historical Class behavior preserved, no instructor entry. |
| src/components/product/class-operations.tsx | Exact match; historical module retained. |
| src/components/product/evaluation-management.tsx | Keep real review behavior and AI permission gate. Original redesign adds human recruitment-review dependencies but removes Can; human-review feature preserved separately, not discarded or declared merged. |
| src/components/product/identity.tsx | Exact match; already included. |
| src/components/product/imported-reviews.tsx | Exact match; real review consumer retained. |
| src/components/product/instructor-picker.tsx | Original compact UI enhancement deferred; existing picker behavior preserved. |
| src/components/product/kanban-dnd.tsx | Exact match; already included. |
| src/components/product/member-performance.tsx | Keep scoped detail/server search/Top10 and unchanged ranking. Original changes to Top5, scoring-band/recommendation UI and optional metrics deferred. |
| src/components/product/primitives.tsx | Keep nullable metrics and no fabricated trend. Original SparkBars generates bars from a value hash, not historical measurements. Styling-only changes deferred. |
| src/components/product/project-changes.tsx | Exact match; already included. |
| src/components/product/shell.tsx | Keep permission-aware real navigation/identity and Project-first entries. Original redesign/reference-screen dependencies restore Class entry. |
| src/components/product/sprint-overview.tsx | Keep actual current-sprint count/fallback and honest scope caption; original hardcodes activeCount=0. |
| src/components/product/task-spec.tsx | Keep requirements/error retry/DoD documentation. Original rubric-version display enhancement deferred, complete original saved. |
| src/lib/api/__tests__/reports.test.ts | Exact match; already included. |
| src/lib/api/academic-overview.ts | Exact match; already included. |
| src/lib/api/academic.ts | Keep role slots/candidate server filters/session transition/assignment roles, lowercase UUID and null metrics. Original expanded historical Class/project statuses/body fields deferred; original would otherwise remove new contracts. |
| src/lib/api/class-lessons.ts | Exact match; historical consumer retained. |
| src/lib/api/dashboard.ts | Exact match; already included. |
| src/lib/api/imported-reviews.ts | Exact match; already included. |
| src/lib/api/management.ts | Keep scoped member-detail query. Original optional overdue/on-time fields deferred with their separate dashboard consumers. |
| src/lib/api/reports.ts | Current implementation includes original valid export behavior plus project/session filters; retain scoped contract. |
| src/lib/api/templates.ts | Keep versioned paginated template/session contract. Original legacy array/startTemplate API conflicts with current library consumers; no second template system introduced. |
| src/lib/api/work.ts | Nullable parser syntax differs but equivalent behavior retained. |
| src/lib/auth/api-client.ts | Keep workflow error classification and exact normalized download MIME checks. Original XLSX support already present; weaker startsWith MIME check not imported. |

| BE path (relative) | Comparison and integration decision |
|---|---|
| package-lock.json | Retain lock matching package.json. Original removes @types/exceljs stub from lock while manifest still declares it. |
| src/recruitment/dto/recruitment.dto.ts | Keep QueryCandidatesDto. Original ReviewRecruitmentDto belongs to separate manual-review feature/dependencies; preserved in original backup. |
| src/recruitment/interview.service.ts | Exact match; original transcript behavior already included. |
| src/recruitment/recruitment.controller.ts | Keep server-side candidate filters. Original human-review endpoints/own-question permission change deferred with evaluation service/DTO/tests/FE consumers; do not replace candidate query with generic pagination. |

## Gates and acceptance

Results and logs are recorded in the current progress handoff and E:\Projects\V-INTERN\integration-evidence\20261013. No assertion/test was removed and no timeout was raised. Early concurrent-run timeout failures are retained beside sequential rechecks.

Live Gemini: BLOCKED — EXTERNAL PROVIDER, inherited from the controlled 2026-10-13 10:15 attempt: HTTP503 / AI_PROVIDER_UNAVAILABLE, run59CDF2E0-43AE-4BDE-BA7B-EFB240C52C40, batch691BF4AB-38B3-4B57-97CD-ED8D00682BE1, latency5085ms. No new generation request during Git integration. SQL test-provider acceptance is not live Gemini success.

Class regression: /instructor/classes redirects to /instructor/projects; active instructor route uses InstructorHome and real Project Library; active shell has no Class/Attendance. Quick Setup and mock QA/PR components have no active instructor route imports. Historical presentation modules/tests and Class APIs/schema remain intentionally retained, not rendered by the active workflow.

## Main-target migration requirements

The OLD plan listed only THREE migrations relative to feat/instructor-workflow-redesign. The actual approved origin/main requires FIFTEEN pending migrations if its database has only the main baseline. Use database migration history; never assume all are pending or rerun applied migrations.

In timestamp order:
1. 1760390400000 AddRecruitmentReviewProvenance
2. 1760476800000 CreateTaskSubmissions
3. 1760563200000 CreateProjectTemplates
4. 1760649600000 CreateReferenceScreens
5. 1760736000000 ExpandAcademicStates
6. 1760822400000 AddClassSchedule
7. 1760908800000 AddRoleManagement
8. 1760995200000 CreateImportedReviews
9. 1761081600000 CreateClassLessons
10. 1761168000000 CreateReportSnapshots
11. 1761254400000 CreateProjectRoleSlots
12. 1761340800000 CreateAiGenerationBatches
13. 1761427200000 AddTemplateLibraryColumns
14. 1761513600000 AddTemplateRunRequest
15. 1761600000000 AddAiPlanLifecycle

Keep all 21 migration sources unchanged. synchronize:false. No Class-table drop. Disposable migration validation uses compatibility_level150; engine version is separately reported, not inferred from compatibility level. No migration was applied to a manual/production DB.

Actual environment: engine17.0.1000.7, SQLServer2025. The app account cannot CREATE DATABASE and has no configured admin credential, so a brand-new empty DB run is BLOCKED by SQL privileges. The existing approved disposable VIntern_M5_E2E received seven pending historical migrations via transaction/history (1760304000000,1760649600000,1760736000000,1760822400000,1760908800000,1760995200000,1761081600000); now21applied/0pending. Only that disposable DB was changed to compatibility150, then workflow/security rerun. Compatibility150 acceptance is not a claim of testing the native SQLServer2019 engine or all21 migrations from an empty DB.

## PR drafts, staging and rollback

FE draft: Instructor Project-first workflow with scoped delivery, performance and reports. Project Library → versioned Session setup → eligible roster/role validation → asynchronous real AI draft editing/confirm → owned delivery → scoped performance/report exports. Remove obsolete instructor entry points. Includes P0 permission/download contracts and regression tests. Depends on paired BE API and pending schema migrations. Explicitly disclose live Gemini503 and separately preserved original workstreams.

BE draft: Versioned templates and transactional instructor Session/AI lifecycle. Includes eligibility/concurrency locks, async reservation/error handling, atomic idempotent publication, owned Sprint/Task queries, batched performance and scoped persisted reports, P0 security fixes and SQL tests. Full diff also contains historical feature dependencies listed above; reviewers must review the full main-to-integration diff, not only checkpoint commits.

After user approval: re-fetch origin/main and recalculate ancestry/diff before any push/PR. Do not force-push source branch. Push NEW integration branches normally, then create FE and BE PRs targeting main. This document does not authorize either operation.

Staging order (future approved operation):
1. Back up staging DB and verify restoration; record healthy paired FE/BE artifacts/configuration.
2. Inspect pending migration history, review backfill/constraint uniqueness and lock window, run timestamp-ordered pending migrations only.
3. Deploy BE; verify auth/P0/ownership and template/session/report APIs.
4. Deploy FE with matching API base. Verify Project Library → Session/assignment → Start → real Gemini plan edit/Confirm/replay/persistence/isolation; delivery filters, performance/report exports and Class redirect.
5. Keep production rollout blocked until live Gemini acceptance is completed and owner approves.

Rollback: redeploy last TESTED paired artifacts; retain additive schema/data, do not automatically run destructive down migrations. Revert review-branch changes using new commits if needed, never reset/rewrite original or source histories. Preserve published delivery/AI provenance. Original dirty workstreams should be separately reviewed/checkpointed by their owner before a later reconciliation; no file deletion to obtain a clean Git status.
