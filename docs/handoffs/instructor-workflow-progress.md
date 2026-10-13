# Instructor project-first workflow — local continuation handoff

Updated: 2026-10-13, durable integration. Local filesystem is authoritative. This new section supersedes older target/runtime/next-action statements. Earlier checkpoints below remain historical evidence.

## Safe integration — 2026-10-13

- User approved PR target **origin/main** for both repositories. New durable worktrees: FE `E:\Projects\V-INTERN\integration-worktrees\fe`, BE `E:\Projects\V-INTERN\integration-worktrees\be`; each uses branch `integration/instructor-project-first` in its own repository. Original dirty roots and Temp sources remain unchanged.
- Fresh main: FE `48617b032ac4c9a0b98d98fced56dd377ffbafbb`, BE `6b61b820572bb607b10c139f7b57625dcf5db35b`. Both are source ancestors. Integration branches were created at main then fast-forwarded to FE `dcea1abfeccd40a5d5a0e17dc461d09cfb557a34` / BE `4ae12bafab21901414319202abb8e4eeea6d19b1`. All13checkpoint commits plus dependencies/P0 retained with original SHAs. No cherry-pick/rebase/reset/history rewrite/main merge/push/PR.
- Snapshot `E:\Projects\V-INTERN\handoff-snapshots\20261013-checkpoint-commits` independently VERIFIED:469FE+357BE checksums, complete inventory, source HEADs and bundles. Original dirty workstreams separately copied and byte-verified (472FE/373BE files) under `E:\Projects\V-INTERN\integration-evidence\20261013`, including binary assets, manifests and patches; secrets/ignored env/dependencies excluded.
- Zero textual conflicts with approved main. All30FE+4BE overlaps compared separately against dirty original sources; path-by-path decisions in `instructor-workflow-safe-integration.md`. Identical work is already included; separate admin/reference UI, manual recruitment review and compact-picker/optional-metric enhancements are preserved in originals/backups for their own workstream, NOT claimed merged. No blind ours/theirs or original overwrite. Product source/tests/migrations exactly match checkpoint; integration commits add documentation only.
- Durable common Git directories and fresh node_modules are on E:, with no Temp runtime/dependency junction. Original ignored BE env is loaded into test processes only; no secret copied/committed. Direct committed Jest commands work without the Temp runner.
- Gates freshly run on durable source: FE build/typecheck/lint PASS0warnings; Vitest53suites/409tests PASS. BE build PASS, lint PASS0errors/15existing script warnings; Jest42suites/394tests PASS. SQLworkflow5suites/31tests PASS; default-throttle P0security5/5 PASS. Early concurrent runs had one FE registration timeout and one SQL reused-key timeout; unchanged isolated/sequential rechecks passed. Both failed and successful logs retained; no assertions removed or timeouts raised.
- Migration verification: app login cannot CREATE DATABASE (permission denied); no admin credentials configured. Used approved existing disposable `VIntern_M5_E2E` instead, applied only7pending historical migrations transactionally; now21applied/0pending, Class tables intact. Engine is SQLServer17.0.1000.7 (NOT native SQL2019). Disposable DB compatibility changed from170 to150 for SQL2019-language/query regression, then gates rerun; exact final results/logs in integration evidence. Fresh-empty-database migration execution and native SQL2019 engine verification remain NOT RUN due database-create privileges/environment.
- Actual origin/main schema delta is FIFTEEN migrations, not the THREE in the old feature-baseline plan. See timestamp-ordered list and staging/rollback procedure in the safe-integration document. No applied migration source changed, no manual/production DB touched, no synchronize/drop/Class data deletion.
- Class regression: active home/Library/navigation remain Project-first; /instructor/classes redirects to /instructor/projects. Historical mock presentation components/tests remain unreachable from active instructor routes. No active Quick Setup/mock QA/PR entry restored.
- Live Gemini remains **BLOCKED — EXTERNAL PROVIDER**, last real attempt2026-10-13 10:15 HTTP503/AI_PROVIDER_UNAVAILABLE. No fresh retry during Git integration; no fake provider acceptance. Existing Temp preview3003/8083 still present; not restarted/relabelled as durable-source UAT. Manual3001/8080 untouched.
- GitHub main branch API reports protected:false for both repositories; effective branch-rule inspection403 (feature/plan availability). No protection settings changed.
- PR readiness: durable source ready for owner review/PR preparation, **not production acceptance/merge approval**. Separate original-workstream enhancements are deferred explicitly; Gemini acceptance and fresh/native-SQL2019 migration verification remain limitations. No push/PR until user authorizes. Final documentation HEADs and clean status recorded in external final integration snapshot summary.

### Next exact action

1. Read `instructor-workflow-safe-integration.md` (approved target,34-path decisions,15migration prerequisites, PR drafts and rollback). Work only in durable integration checkouts, not dirty originals/Temp.
2. Review final source HEADs/status and evidence in `E:\Projects\V-INTERN\integration-evidence\20261013` and final integration snapshot summary. After user approves push/PR, fetch main again and recalculate ancestry, then push NEW integration branches normally and create paired PRs to main. Never force the amended source branch.
3. When Gemini has a recovery signal, build/start an isolated durable-source preview on approved nonmanual ports; send only the already-approved synthetic UAT payload. At most one controlled generation attempt; verify Ready→edit description/criteria/assignee/deadline→Confirm→replay→SQLpersist/isolation. Do not claim the older Temp preview is durable-source acceptance.
4. Before staging, obtain a disposable empty DB/native SQL2019 environment for full ordered migration execution, then verify backup/restore, pending migration history and paired deployment. Do not run destructive down migrations or erase historical Class data.

### Durable test commands

Use Node on `C:\nvm4w\nodejs`; run FE `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`. Run BE `npm run build`, `npm run lint`, `npm test -- --silent`. For SQL, set `DOTENV_CONFIG_PATH=E:\Projects\V-INTERN\V-INTERN-BE\.env`, `E2E_DB_NAME=VIntern_M5_E2E`, `DB_NAME=VIntern_M5_E2E`; run `node -r dotenv/config node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand start-session session-overview template-library candidate-assignment project-slots` with process-only `THROTTLE_AI_GENERATION_PER_MIN=100`, then remove that override and run the same Jest command with `security-hotfix`. Run heavy gates sequentially. Do not print env contents.

## Secure implementation / checkpoint commits — 2026-10-13 10:19

### Snapshot verification and source protection

- Pre-checkpoint snapshot `E:\Projects\V-INTERN\handoff-snapshots\20261013-final-independent-review` is **VERIFIED** by this run, not merely present. Verified469FE+356BE file checksums against both source and backup, full tracked/nonignored-untracked inventory coverage, bundle SHA256 and `git bundle verify`; source HEADs matched the recorded checkpoint HEADs. No missing/changed files were found before staging.
- After all12code commits, rechecked source bytes against that snapshot: zero existing source-file byte changes. Checkpointing changed history/index only. The new integration-preparation document and this updated handoff are deliberate documentation changes afterward. The old snapshot remains immutable.
- Post-checkpoint snapshot target `E:\Projects\V-INTERN\handoff-snapshots\20261013-checkpoint-commits` captures the final documentation commit as well as all code commits. Treat it as VERIFIED only when its `snapshot-summary.json` records verified repositories and matches manifest/bundle checks. That external manifest records the exact final BE documentation HEAD without an impossible self-referencing commit SHA inside this committed document.
- Snapshot includes all tracked files, modified/untracked implementation, tests/migrations/binary files, local-only artifacts, Git refs/commit graph, manifest/checksums, patches and selected test evidence. Ignored .env/secrets, dependencies, build caches and database files are excluded. No Temp source removed.
- Original FE `E:\Projects\V-INTERN\V-INTERN FE`: HEADd9be3eb,44modified/54untracked. Original BE `E:\Projects\V-INTERN\V-INTERN-BE`: HEAD44f5690,19modified/31untracked. Read-only throughout. No reset/clean/stash/rebase/checkout/merge/push/force push, no original source overwrite and no main/RC1/tag edit.

### Exact implementation and code checkpoints

FE `C:\Users\buiva\AppData\Local\Temp\opencode\impl-fe`, branch `feat/project-first-workflow`, code/final FE HEAD **`dcea1abfeccd40a5d5a0e17dc461d09cfb557a34`**. BE `C:\Users\buiva\AppData\Local\Temp\opencode\impl-be`, same branch, code HEAD immediately before the documentation-only checkpoint **`5b7d2781372ecea994d0bd660b8eb952c2291bd8`**. Final BE HEAD is the documentation commit containing this section; obtain its exact SHA from final snapshot-summary.json or `git log -1` in impl-be. No product source differs between code HEAD and documentation HEAD.

| Repository | Checkpoint commit | Domain |
|---|---|---|
| FE | `6338418a6e1e0c4c9349b750250d061d91d573e6` | Restore existing shared consumers and API/download contracts |
| FE | `bd6a6dc5bf5e80933f89b8b8acd6079ecf78bafc` | Setup/member permissions, AI draft editor and async race guards |
| FE | `d3c1426a1f7dc82a98cfc517218e21070ced3de1` | Scoped Session overview/detail/roster/snapshot/progress |
| FE | `fea117f28af74d6dc758ea6387f8d749940844c7` | Cross-session Sprint/Task filters and detail routes |
| FE | `80d0b0c12c431e938744c809e2f2590cfa27cb80` | Scoped Performance/Reports workspace |
| FE | `dcea1abfeccd40a5d5a0e17dc461d09cfb557a34` | Project Library entry point and obsolete UI navigation removal |
| BE | `44fbb107d1673e7a0b328d619898da31f17fa0e1` | Template create concurrency and ownership |
| BE | `b13f2265ab1f485f6b5e668018d2129a6fb1d451` | Session/Assignment transactional lifecycle and overview contracts |
| BE | `2e9b7db090827f266c441e700c168966571ddc21` | Gemini response-body deadline |
| BE | `9f34a9455c602381ce83211f0504c0c597b339c4` | Scoped bounded Performance/Reports queries |
| BE | `8dcbc59615eca64714038b49e5a7234672d3b597` | Cross-session delivery API filters and SQL tests |
| BE | `5b7d2781372ecea994d0bd660b8eb952c2291bd8` | Atomic reviewed AI publication/lifecycle/idempotency and regressions |

- Each BE staged tree was exported independently and Nest-build checked before commit; each FE staged tree was exported and TypeScript checked before commit. Staged file lists matched explicit domain allowlists and pre-checkpoint source hashes. High-confidence secret scans over all95candidate files found no token/private key. Mixed previous-agent provenance was preserved, including restored shared consumers copied earlier from the original FE root.
- No blind `git add .`. No source edits were made merely to split commits. Earlier historical commits, P0 fixes and amended BE history remain ancestors. `ff23d87` and tracking `19d0227` have identical trees but distinct commits; no history rewrite was used.
- Remaining local-only untracked files after documentation checkpoint: FE `AGENTS.md` and `CLAUDE.md` (generated agent guidance); BE `run-m1-e2e.cjs` (previous agent's explicitly temporary runner). Preserved and included in both applicable snapshots, not deleted. Product code/tests/docs are committed; tracked diff and indexes are empty. Direct committed-file E2E commands are in the merge-preparation document, so the runner is not a hidden test prerequisite.

### Regression gates after code checkpoints

- FE lint PASS0warnings, standalone typecheck PASS, full Vitest **53suites/409tests PASS**, optimized production build PASS (Next16.3.8). Existing jsdom unsupported navigation notices remain non-failing.
- BE build PASS, lint PASS0errors/15existing script warnings, full Jest **42suites/394tests PASS**.
- SQL isolated `VIntern_M5_E2E`: combined workflow **5suites/31tests PASS**; P0 **5/5 PASS** with default throttle. Evidence `checkpoint-sql.log` / `checkpoint-p0.log` (ignored local logs, copied into final snapshot evidence). No tests/assertions removed or weakened.
- The final documentation checkpoint changes Markdown only; `git diff --cached --check`/final Git checks cover it. No migrations changed/applied to manual or production. Browser DB still21applied migrations, verified read-only. No Class/history deletion or synchronize.

### One controlled live Gemini attempt this turn

- A15s-bounded authenticated metadata probe of the existing configured `gemini-flash-latest` returned **HTTP200**, with `generateContent` supported. The API key was never printed or committed; configured provider/model/timeout were unchanged. Only the nonsensitive model identifier is recorded. This was the recovery signal permitting one generation retry; metadata availability is not generation acceptance.
- At **2026-10-13 10:15:24 Asia/Bangkok**, one **Tạo lại** request on the already-authorized synthetic fixture Session triggered real Gemini through the existing bounded provider pipeline. It failed at10:15:29 with **HTTP503 / AI_PROVIDER_UNAVAILABLE**, latency5085ms, AI run **`59CDF2E0-43AE-4BDE-BA7B-EFB240C52C40`**, batch **`691BF4AB-38B3-4B57-97CD-ED8D00682BE1`**. No second generation request was attempted; no unusual timeout/model/provider change or fake response.
- Live acceptance remains **BLOCKED — EXTERNAL PROVIDER**. Ready→Plan Editor edits→Confirm→replay could not run. SQL read-only check: UAT Session `a03e2d75-9b50-47eb-9ee9-bf2136573aa8` has0Sprints/0Tasks; comparison Session `51afa087-5a63-40ab-8e00-72cf8b99999f` remains2Sprints/8Tasks. Existing deterministic SQL test-provider evidence is not claimed as live success.
- Screenshot `C:\Users\buiva\.codex\visualizations\2026\10\12\01a12ff7-547e-76e0-8a1a-e22e59fea73a\checkpoint-gemini-acceptance.jpg`, visually checked. Failed Session tab retained for handoff.

### Class regression and current preview

- After checkpoint build, browser `/instructor/classes` again redirected to `/instructor/projects` and loaded the real template. Sidebar has no Class/Attendance. Instructor home was verified Project-first with no Quick Setup/mock QA/PR cards. Existing route/build inventory resolves changed navigation links; historical Class modules/APIs/data remain.
- Restarted only verified own preview PIDs23160/20436 after final build. Current FE3003 PID**9904**, BE8083 PID**8136**, DB`VIntern_M2_BROWSER`; process metadata includes FE/BE code HEADs in `C:\Users\buiva\AppData\Local\Temp\opencode\continuation-uat\runtime-state.json`. Logs `frontend-checkpoint.*.log` / `backend-checkpoint.*.log`. Always recheck listener/PID/command; never kill manual3001/8080 or allNode processes. No .env edit.

### Merge preparation and next exact action

- **NOT READY for merge/deploy:** live AI acceptance remains externally blocked and original dirty workstreams require separate preservation/reconciliation. No merge/push was performed. Precise sources/target assumptions, all checkpoint SHAs,30FE+4BE overlapping paths, additive migration order, rollback strategy and commands are in **`docs/handoffs/instructor-workflow-merge-preparation.md`**.
- Planning target is each original's current `feat/instructor-workflow-redesign` feature branch; both committed target HEADs are source ancestors. It is a planning assumption, not an approved final release destination. Never fast-forward an original dirty checkout. Future authorized integration belongs in a new durable checkout, after the original workstream owner has preserved its changes.
- Next exact action: preserve/verify the final snapshot and resume real AI acceptance only after a fresh provider recovery signal. Use the same UAT setup URL in the review checkpoint below; one controlled retry in a future authorized turn, then real draft edits/Confirm/replay and SQL isolation. Existing fixture-to-Gemini consent persists. Do not fix HTTP503 with speculative application changes or claim DONE without real provider evidence.
- If preparing an integration next, first identify the approved target branch and separately checkpoint the original dirty workstreams; do not rebase/force-push the BE tracking divergence. Do not remove Temp worktrees after snapshot.

## Retained independent review checkpoint — 2026-10-13 09:49

## Current final independent review checkpoint — 2026-10-13

### Local state and provenance

- FE: `C:\Users\buiva\AppData\Local\Temp\opencode\impl-fe`, `feat/project-first-workflow`, HEAD `dff6c9fe93017f67b30a381a9ff130415d6cb439`; 29 modified / 32 untracked files at this checkpoint. BE: `C:\Users\buiva\AppData\Local\Temp\opencode\impl-be`, same branch, HEAD `ff23d87d8206a643a325b8b929bed3ab1dc92213`; 29 modified / 5 untracked files. Indexes empty. Counts include earlier agents' implementation and the new review fixes; do not stage indiscriminately.
- Compared both combined working implementations with P0 baselines FE `5a1342a` and BE `68af4df`, including subsequent committed changes and untracked implementation. P0 ancestry and amended BE tracking divergence preserved. No reset/rebase/force push or checkout.
- Original roots remain FE `E:\Projects\V-INTERN\V-INTERN FE` 44 modified / 54 untracked and BE `E:\Projects\V-INTERN\V-INTERN-BE` 19 modified / 31 untracked. They were only read. No original file was overwritten, moved, staged or deleted.
- All source edits in this review are in the implementation worktrees. New BE unit regression file `src/ai-generation/ai-generation.service.spec.ts`; new FE regression file `src/components/sessions/__tests__/reports-workspace.test.tsx`. Earlier untracked and dirty files are preserved.

### Independent review coverage and findings fixed

Separate reviewers inspected BE, FE and AI implementations. A final read-only reviewer checked the resulting fixes and reported no remaining high-confidence HIGH/MEDIUM correctness/security finding in the inspected paths; no additional tests or provider calls were made by that final reviewer. Scope: template library/detail/version pin/snapshot/create; recruitment search/role/availability; assignment lifecycle/capacity/concurrency; session update/Start/ownership/overview; AI reservation/retry/regenerate/late completion/Confirm; cross-session sprint/task; performance aggregation and SQL bounds; report scope/exports; FE async state/permissions; obsolete instructor routes. Also reviewed the combined salary-idempotency changes, three additive migrations/data-source and seed script. This is scoped review, not formal merge approval or a claim of mathematical absence of bugs.

| Severity | File / function | Evidence and fix |
|---|---|---|
| HIGH | `templates/templates.service.ts` `start` | Concurrent keyed creation could commit losing project's/session's earlier writes through an in-transaction unique catch. Serialize requester/template and remove the losing-run catch. SQL triple concurrent create now creates exactly one Session/Project/run. |
| HIGH | `sessions/sessions.service.ts` `update`; `assignments/assignments.service.ts` lifecycle | Readiness/state mutation and assignment removal were not serialized. Session-first transactional locks now cover Start/create/complete/cancel; update audit/activity commit atomically. Template Session cancellation after Start returns409 `SESSION_NOT_SETUP`, with assignment and roster intact. Legacy cancellation remains supported. |
| HIGH | `templates/templates.service.ts` `projectContext/changes/propose/apply` | Historical permission-only endpoints allowed foreign instructor access. SQL regression first reproduced foreign GET200. Scope checks now enforce mentor/session ownership for reads and transactional management for mutations; foreign calls403 and legitimate owner positive paths pass. No new auth flow or permissions granted. |
| MEDIUM | `templates/templates.service.ts` `get` | Shared template detail exposed other instructors' run IDs. Definition remains shared; run metadata is now session-ownership scoped. Foreign-run regression passes. |
| MEDIUM | Template start / Session `assertStartReady` | Historic `roles`-only templates created no slots and allowed an empty Start. Derive one required slot per declared legacy role without rewriting snapshots; real assignment/Start SQL journey passes. |
| MEDIUM | `ai-generation/ai-generation.service.ts` `runDetachedGeneration` | Detached completion could resurrect stale failed generation or offer a draft for outdated state/dates/team/version. Finalization now re-reads under Session lock and only updates a still-generating row. Stale context fails honestly; audit outage no longer demotes an already-ready draft. Unit regressions pass. |
| MEDIUM | AI `generatePlan/runDetachedGeneration` | Confirm old draft A while new generation B runs could make B ready after publish. Prioritize confirmed drafts and invalidate late result after another publication. Regression passes. |
| MEDIUM | AI `lockRequest/confirm/generatePlan` | Global actor/request uniqueness raced across different Session locks; raw SQL500 possible. SQL2019 transactional `sp_getapplock` before Session lock now serializes the global key; cross-session concurrent request regression returns201+409 and one batch. Generation keys cannot masquerade as Confirm replay. |
| MEDIUM | AI `assertManaged/assertLockedOwnership/roleFitWarnings` | Normalize UUID comparison; recheck mentor/session ownership under transaction locks before reserve/publish. Mixed-case and revoked ownership regressions pass. |
| MEDIUM | `ai/providers/gemini.provider.ts` `generateStructured` | Timeout cleared at HTTP headers, leaving response-body consumption unbounded. Keep abort deadline through body read; watchdog regression passes. Provider failures are not converted to fake successful drafts. |
| MEDIUM | `performance/performance.service.ts` | Some identity/ownership reads exceeded SQL2100 parameter limit despite fact chunks. Reuse bounded chunks across these reads and single-member history/sprints; 2101-intern regression passes. Calculator/ranking unchanged. |
| MEDIUM | FE `MemberSelector` | Deferred interview A could display under B; removal preflight error escaped handling. Request revision rejects old detail results; preflight is inside guarded action. Fail-first regressions pass. |
| MEDIUM | FE `ReportsWorkspace` / `AiPlanPanel` | Pending save/generation/Confirm could update a different selected scope. Report scope revisions and keyed AI workspace + unmount guard prevent obsolete success/error/callback updates. Deferred-response regressions pass. |
| MEDIUM | FE TemplateDetail / SessionSetup / MemberSelector | Missing permission gates exposed unauthorized controls. Existing `Can` gates use exact backend grants, including all three template-start grants; missing-grant regressions pass. Backend remains authority. |

No CRITICAL finding established. Cosmetic/unused historic components were not deleted speculatively. Review fixes were targeted; no new product phase or ranking formula.

### Tests actually run for this review

- FE: lint PASS (0 warnings); standalone typecheck PASS; optimized Next16 production build PASS; full Vitest **53 suites / 409 tests PASS** on 2026-10-13. Existing jsdom unsupported link navigation notices do not fail tests.
- BE: final build PASS; lint PASS (0 errors, 15 existing console warnings in scripts); full Jest **42 suites / 394 tests PASS** after final ownership fixes.
- SQL `VIntern_M5_E2E`: one combined workflow invocation **5 suites / 31 tests PASS**: Start/AI/Reports8, overview6, library8, candidates4, role slots5. Includes concurrent publish replay/rollback, global request key race, library duplicate creation, foreign blueprint/run/context/change scope, legacy-role team and active cancellation, and real PDF/XLSX signatures. AI provider here is explicitly deterministic TEST infrastructure, not Gemini acceptance.
- SQL P0 security: **5/5 PASS**, default throttle, after ownership fixes.
- Red evidence: stale AI finalization/audit and stalled body regressions failed before fixes; independent FE race/permissions/scope regressions failed before fixes; new foreign template-context regression received200 where403 expected before fix. A transient test run during concurrent source edits was not treated as final evidence. Initial BE lint failed one unused fixture binding; fixed it and reran final gates.
- Both `git diff --check` PASS after removal of whitespace introduced by review edits. No tests skipped/deleted or assertions weakened. Existing additive migrations only; no new migration, down, drops, synchronize or production/manual DB changes.
- Review SQL logs (ignored local evidence): `review-sql.log`, `review-p0.log`, `review-library-red.log`, `review-library-green.log` in impl-be.

### Live Gemini status — BLOCKED — EXTERNAL PROVIDER

- Exactly one controlled retry was submitted in this review on 2026-10-12 22:12 Asia/Bangkok, after TCP443 connectivity succeeded. Existing explicit fixture-to-Gemini consent was honored without asking again.
- Gemini model `gemini-flash-latest`, AI run `897B69DD-FF61-4C88-A1F1-EE1599847162`, latency4495ms, failed `AI_PROVIDER_UNAVAILABLE`; backend provenance log states **HTTP503**. Batch `D20AC490-2604-4A3B-A166-C35732310B5A` failed. Read-only DB verification on 2026-10-13 confirms these persisted facts and zero Sprints in UAT Session.
- Session `a03e2d75-9b50-47eb-9ee9-bf2136573aa8`, project `ae7816d2-ab2d-4388-873f-297381b8dfc1` still have no published delivery. Existing comparison Session `51afa087-5a63-40ab-8e00-72cf8b99999f` remains2Sprints/8Tasks. No fake draft seeded. New live Ready→edit→Confirm→replay remains NOT RUN because the provider failed. No endless retry or timeout increase.
- All other milestone states in historical table below remain DONE with preserved historical browser evidence plus current regression gates. AI live milestone remains BLOCKED; overall live acceptance incomplete.

### Class removal and current runtime

- Browser on final build 2026-10-13 verified direct `/instructor/classes` redirects to `/instructor/projects`, Library loads real template, sidebar has no Class/Attendance, dashboard starts from Project Library and has no Quick Setup/mock QA/PR cards. Source route inventory confirms no other direct instructor Class route.
- Old `InstructorDashboard`, `SetupWizard`, `ClassOperations` and academic Class modules have no instructor-page consumer. Definitions/history/APIs remain for valid consumers; no Class schema/data deleted. Real task review/evaluation preserved.
- Screenshot `C:\Users\buiva\.codex\visualizations\2026\10\12\01a12ff7-547e-76e0-8a1a-e22e59fea73a\instructor-final-review.jpg`, visually checked. First Library load during preview startup had transient connectivity error; ordinary retry loaded database template correctly.
- Previous preview and manual listeners were absent when continuing on2026-10-13 (no kill was issued). Restarted ONLY own isolated preview from final builds: FE3003 PID23160, BE8083 PID20436, database `VIntern_M2_BROWSER`. Verify PID/command/listener before any stop; never kill all Node processes or restart manual3001/8080. M2_BROWSER21applied migrations verified read-only.
- Runtime metadata `C:\Users\buiva\AppData\Local\Temp\opencode\continuation-uat\runtime-state.json`; `backend-review.*.log` / `frontend-review.*.log`. Environment overrides are process-only; no .env edit.

### Safe handoff / merge readiness / exact next task

- **NOT READY for merge:** required live Gemini draft/edit/Confirm acceptance remains blocked externally. No merge/push was requested or performed. No commits/staging, no secret commits. FE ahead2 and BE amended divergence are preserved intentionally.
- Durable snapshot target: `E:\Projects\V-INTERN\handoff-snapshots\20261013-final-independent-review`. Capture verifies every copied file's SHA256, rechecks status stability and verifies each Git bundle. Source copies include every tracked/nonignored untracked implementation file, binary dirty patch, Git bundle of all refs, status, manifest and selected test logs. Ignored credentials/.env, dependencies, build caches and database files are excluded intentionally. Do not claim this is a production DB backup. Check `snapshot-summary.json` for verified completion; a folder alone is not success.
- Next exact task: after external provider recovery, open `http://localhost:3003/instructor/sessions/a03e2d75-9b50-47eb-9ee9-bf2136573aa8/setup?project=ae7816d2-ab2d-4388-873f-297381b8dfc1`; one controlled **Tạo lại** with existing consent; verify real Generating→Ready, edit description/criteria/assignee/deadline in `src/components/sessions/plan-editor.tsx`, Confirm and replay, verify actual new Session Sprint/Task/spec rows and old Session isolation. Investigate BE `AiGenerationService.confirm` line332 / `generatePlan`521 / `runDetachedGeneration`610 only if an application failure occurs. Update this handoff and AI milestone only with real evidence.
- Resume test commands at end of historical checkpoint still apply; use `--runTestsByPath` for Jest29 focused unit tests (not plural `--testPathPatterns`). SQL fixtures retain historical rows; do not clean/drop them.

## Historical continuation checkpoint — 2026-10-12 21:38:35

## Exact repositories and Git safety

- Continue FE in `C:\Users\buiva\AppData\Local\Temp\opencode\impl-fe`, branch `feat/project-first-workflow`, HEAD `dff6c9fe93017f67b30a381a9ff130415d6cb439`.
- Continue BE in `C:\Users\buiva\AppData\Local\Temp\opencode\impl-be`, branch `feat/project-first-workflow`, HEAD `ff23d87d8206a643a325b8b929bed3ab1dc92213`.
- Original FE `E:\Projects\V-INTERN\V-INTERN FE`: branch `feat/instructor-workflow-redesign`, HEAD `d9be3ebc44e683baa8044efff53c732bdbeb57c6`; 44 modified / 54 untracked files at final verification. Original BE `E:\Projects\V-INTERN\V-INTERN-BE`: same branch, HEAD `44f5690f185b6458e0a523dce38937ea58661d2a`; 19 modified / 31 untracked. These original roots were only read; preserve them.
- Documentation worktree `C:\Users\buiva\AppData\Local\Temp\opencode\phase2-be`, HEAD `c642009`: Phase 2 architecture, contracts, ERD, retention/security/performance plans and ADRs were read here. No destructive checkout was used.
- P0 commits FE `5a1342a`, BE `68af4df` are already in implementation history. No cherry-pick needed.
- FE implementation has local commits ahead of tracking. BE local amended HEAD diverges from tracking `19d0227` (equivalent amended task-filter commit). Do not reset/rebase/force push to resolve this.
- No commits, staging, branch changes, pushes, tags, reset, clean, stash, merge or worktree deletion were performed. Both indexes remain empty; every existing dirty/untracked file is preserved. Do not stage whole repos indiscriminately.
- Manual FE3001 PID16724 and BE8080 PID17568 remained running and unchanged. Original implementation BE8082 was not killed. No manual/production database changes.

## Previous agent work found and protected

Committed previous work: real template library/detail/version/snapshot; setup-mode template start; independent project/session per run; candidate search/availability; assignment cancellation and role slots; session Start guards; detached AI plan lifecycle/history; Confirm UI; session filters; partial UUID normalization.

FE initially modified: instructor sessions list/detail routes and `src/components/sessions/ai-plan.tsx`. Initially untracked: `AGENTS.md`, `CLAUDE.md`, sessions `session-list.tsx`, `session-overview.tsx`, `__tests__/overview.test.tsx`, API `sessions.ts`, `delivery.ts`, `__tests__/sessions.test.ts`.
BE initially modified: sessions controller/service and sprints service. Initially untracked: `run-m1-e2e.cjs`, `test/session-overview.e2e-spec.ts`. Continuation built on these files; never discard their previous portions.

## Current milestone evidence

DONE means implementation and appropriate current test evidence. It does not mean deployed to a manual or production environment.

| Milestone | FE | BE | DB | Tests / evidence | Status |
|---|---|---|---|---|---|
| Foundation / contract fixes | Missing dependencies restored; UUID/picker and download contracts fixed | P0 preserved; UUID comparisons fixed | Existing schema retained | Builds, lint, 398 FE / 378 BE tests; P0 SQL 5/5 | DONE |
| Project Template Library | Real library/detail/search/filter/pagination | Existing template endpoints reused | Existing project_templates / versions | Library SQL 6/6; browser library/detail | DONE |
| Create Session | Template form and setup context | Idempotent independent project/session creation | Pinned template version/snapshot | Library SQL 6/6; new browser session created | DONE |
| Eligible Intern Selector | Server search/role/availability/detail; compatible slot options only; add/remove | PASS, role, capacity/conflict, template project/session pair validation | Existing unique active-assignment constraint | Candidate SQL 4/4; slots 5/5; browser wrong-role rejection + valid assignments | DONE |
| Start Session | Busy guard, readiness, transition and polling | Snapshot/team/PASS/active-account/role rechecks | Existing lifecycle | Start SQL 6/6; browser session became active | DONE |
| AI Sprint / Task Planning | Draft editor/review/confirm, recovery and polling | Atomic scoped/idempotent publish; error taxonomy retained | Specs, criteria, deadlines, history/audit persist in same transaction | SQL 6/6 incl concurrent replay, edited draft, rollback, Reports. New live Gemini attempts failed externally | BLOCKED |
| Session Management | Lists/details/roster/snapshot/timeline/progress | Bounded overview/detail aggregates, no deleted-task inflation | No new migration | Overview SQL 6/6; browser historical session 2 sprints / 8 tasks; FE totals >100 regression | DONE |
| Cross-session Sprint / Task | Common project/session/status/assignee/search/deadline filters; instructor detail pages | Server filters and scoped member-options | Existing schema | Overview SQL 6/6; browser 1 sprint / 2 Backend tasks under November filters | DONE |
| Performance | Search, scoped member detail, Top10 using existing comparator | Batch fact loading, deterministic calculator, session isolation and input DTO | Existing facts | Calculator/scope regressions; browser 8 tasks, 4 per member; unmeasured scores remain null | DONE |
| Reports | Scope→snapshot→detail→PDF/XLSX/CSV | Scoped snapshot list/create/replay; export endpoints reused; removes per-member metric queries | Existing report_snapshots migration | SQL actual PDF/XLSX signatures; browser created report and downloaded all 3 formats | DONE |
| Remove obsolete UI | New project-first home; Class nav removed; legacy Class route redirects; Quick Setup entry removed | Real reviews and historical APIs retained | Class/history tables retained | Build/tests; browser nav/home verified | DONE |

Overall live end-to-end acceptance is NOT complete: new Gemini draft → edit → Confirm still awaits a successful external provider response. SQL integration tests explicitly use a named deterministic test provider; they are not evidence of live Gemini success.

## Continuation implementation

BE important changed files/functions:
- `src/ai-generation/ai-generation.service.ts`: `confirm` locks session and publishes all rows, task specs/criteria, status history, audit and idempotency together. Stored-plan ownership/version/state, dates, assignee, descriptions and criteria validated. Concurrent new request keys return original summary. Invalid last task rolls back earlier sprint/task writes. `generatePlan` reserves under session lock, reuses generating/ready/confirmed work, supports explicit regenerate. Detached failures preserve safe classified provider codes.
- `src/ai-generation/dto/ai-generation.dtos.ts`, `sprint-plan.schema.ts/spec.ts`: regenerate intent and bounded acceptance criteria.
- `src/assignments/assignments.service.ts/spec.ts`: recruited-role mismatch, template project/session mismatch and template role validation.
- `src/sessions/sessions.service.ts/controller.ts`, `dto/session.dtos.ts`: bounded overview/detail, pinned snapshot, full counters, soft-delete exclusion, project filtering through template_runs, scoped paginated public roster identity options; fail-closed corrupt snapshot and Start eligibility checks.
- `src/performance/performance.service.ts`, `performance-scope.spec.ts`, controller and new `performance-query.dto.ts`: no per-intern DB queries in list; unchanged calculator; correct UUID and session boundaries including legacy null-session sprints; server search/validated filters.
- Reports service/DTO: project/session filters and reuse batched metrics. Sprints DTO/controller/service: project/session/status/assignee/search/end-date filters and stable pagination. Tasks service/spec: case-insensitive project identity comparison.
- Tests `start-session.e2e-spec.ts`, `session-overview.e2e-spec.ts`, `candidate-assignment.e2e-spec.ts`, recruitment fixture helper. Candidate fixture names are unique per run so retained old test data does not corrupt exact search totals. Only the expanded SQL publish+exports journey has a separate bounded 30s timeout; no assertions were removed or tests disabled.

FE important additions/changes:
- New sessions `plan-editor.tsx`, `delivery-overview.tsx`, `reports-workspace.tsx`, `instructor-home.tsx`; completed previous `session-list.tsx`, `session-overview.tsx` and API `sessions.ts`, `delivery.ts`.
- `ai-plan.tsx`: edited draft confirmation, explicit regenerate, active-empty recovery and polling. `use-resource.ts` optional refresh key preserves same-resource data while polling; scope changes still clear old data.
- Instructor task/sprint detail routes reuse existing real TaskDetail/SprintOverview; new `product/task-spec.tsx` displays persisted acceptance criteria. Existing review workflows preserved.
- Home/nav/classes route and legacy dashboard Quick Setup entry now route through Project Library. Historical Class code/data retained.
- `member-performance.tsx`, API management, performance/reports routes: initial session/project scope, server search, scoped detail, Top10 limit. Ranking comparator remains average finalized evaluation score DESC, userId tie-break, as the previous Top5 implementation; calculator/formula unchanged.
- `academic-picker.tsx`, API academic: no empty/inapplicable projectId query params; canonical UUIDs avoid duplicate selected options. Session task table uses actual roster names.
- `lib/auth/api-client.ts`, `lib/api/reports.ts`: dedicated XLSX response type; exact MIME validation preserves PDF restrictions and rejects JSON disguised as a download. Four fail-first download regressions added.

Selective missing files copied from original dirty FE root, without overwriting any implementation file: product academic-insights, class-operations, identity, imported-reviews, project-changes, sprint-overview, class-attendance-summary, kanban-dnd; API academic-overview, class-lessons, dashboard, imported-reviews, reports and reports API test. Shared primitive/API exports restored for already-committed consumers. MetricCard has no fabricated trend chart. Original source copies remain untouched.

## Final tests actually run

- FE optimized Next16 production build PASS (includes TypeScript). Standalone typecheck PASS. Lint PASS with zero warnings. Full Vitest: 52 suites / 398 tests PASS. jsdom emits its pre-existing unsupported link-navigation notices, without failing tests.
- BE build PASS; lint PASS with 15 existing console warnings in scripts; full Jest: 41 suites / 378 tests PASS.
- SQL `VIntern_M5_E2E`: Start/AI/Performance/Reports journey 6/6 PASS, including same-plan concurrent new-key replay, in-flight generation dedupe, edited criteria/specs, invalid task rollback to zero delivery rows, classified provider failure, report replay/scope and actual PDF/XLSX file signatures.
- SQL session overview/member/delivery filters 6/6 PASS; template library 6/6 PASS; candidate assignment 4/4 PASS; role slots 5/5 PASS. These are separate verified runs, not a claim of one combined clean run.
- P0 security SQL suite rerun with default throttle: 5/5 PASS.
- Earlier failures were reproduced and fixed: duplicate publish; snapshot null; deleted task inflation; N+1; cross-session/legacy performance; UUID casing; incompatible role UI; missing provider error code; nullable published description; XLSX rejected by PDF-only client. Candidate historical-data collision and SQL journey timeout were fixed in fixtures/test bounds, without deleting historic fixtures or weakening assertions.
- `git diff --check` PASS in both implementation worktrees; no staged content.

## Database and browser UAT

- Disposable databases only: `VIntern_M5_E2E` and existing `VIntern_M2_BROWSER`. M2_BROWSER has all 21 migrations applied, verified read-only. Existing additive evaluation/task-submission/report migrations were applied only when pending on E2E DB through migration history. No new migration authored. `synchronize:false`; no drops or manual DB experiments.
- Two new synthetic roster fixtures were added only to M2_BROWSER: `continuation.fe.20261012@vintern.test`, `continuation.be.20261012@vintern.test`. Names are explicitly “Continuation Frontend Fixture” / “Continuation Backend Fixture”. PASS recruitment profiles are test preconditions; no interview scores were fabricated (result count zero). Earlier browse fixtures/assignments were retained.
- New browser UAT session `a03e2d75-9b50-47eb-9ee9-bf2136573aa8`, project `ae7816d2-ab2d-4388-873f-297381b8dfc1`, template `46032eb8-6b70-4fbb-a6f6-48d12e0fe610`, name “Continuation UAT 2026-10-12”. Both correct roles assigned; wrong-role attempt rejected; Start reached active. All three new live AI attempts failed: HTTP503, 120s timeout, then provider network failure even with an isolated 600s UAT timeout. No delivery rows were created in this session. Final server returns to normal configured timeout; no env file edited.
- User explicitly approved sending this specific test template/session and these synthetic fixture names/UUIDs/roles to Gemini. Initial automatic approval rejection is resolved; do not ask again for the same payload/destination. Current blocker is external provider availability, not missing permission or fabricated success.
- Existing published session `51afa087-5a63-40ab-8e00-72cf8b99999f` / project `94516e01-2011-4f02-921e-628bbaf90785`: browser verified 2 sprints / 8 tasks, snapshot/roster and instructor task route; Sprint assignee+November deadline filter returned one sprint, Task filter returned two Backend tasks. Performance totals 8, member detail 4, scores unmeasured. This and the new empty-delivery session demonstrate independent template runs.
- Browser report `904C84AA-B31B-42E0-8F68-E1E757E3B169` created for the existing published session. PDF, XLSX and CSV downloaded as real files in Downloads; CSV had one transient connection failure then succeeded on retry. XLSX client MIME bug was reproduced, fixed and successfully retested on the final build.
- Screenshot: `C:\Users\buiva\.codex\visualizations\2026\10\12\01a12ff7-547e-76e0-8a1a-e22e59fea73a\instructor-reports-uat.jpg`. Reports tab retained as deliverable; failed live-plan tab retained for continuation.

## Running isolated preview

Latest built FE at `http://localhost:3003`; BE `http://localhost:8083/api/v1`, database `VIntern_M2_BROWSER`. FE build uses NEXT_PUBLIC_API_BASE_URL via process env only. Backend CORS allows the preview origin. Current own processes: FE PID42752, BE PID35080. Logs/PID metadata: `C:\Users\buiva\AppData\Local\Temp\opencode\continuation-uat\runtime-state.json` and `*-final.*.log`. Verify live listener and command before stopping only these own processes. Never kill all Node processes or manual FE3001/BE8080.

## Next exact task

1. When Gemini/network is available, open `http://localhost:3003/instructor/sessions/a03e2d75-9b50-47eb-9ee9-bf2136573aa8/setup?project=ae7816d2-ab2d-4388-873f-297381b8dfc1` as the existing test instructor. In `src/components/sessions/ai-plan.tsx` use Tạo lại; do not seed or fake a ready response. The same fixture-to-Gemini consent already exists.
2. Verify generating → ready, edit description/criteria/assignee/date in PlanEditor, Confirm once and replay. Inspect `AiGenerationService.runDetachedGeneration/confirm` only if a concrete application failure occurs; actual provider503/network/timeout is recorded honestly. Compare new session sprint/task rows against the existing 2-sprint/8-task session and verify no cross-session contamination.
3. Update this file and mark the AI milestone DONE only after that real provider/browser evidence exists. Current implementation has full SQL test-provider evidence; it is not live provider acceptance.
4. Before any eventual merge, complete an independent review of the entire combined dirty diff and provenance. A read-only reviewer identified legacy-sprint attribution and empty-plan recovery issues; both were fixed with regressions. That independent review was interrupted by its model quota, so there is no independent merge approval. No merge or push is authorized by these notes.

## Commands to resume verification

Use Node `C:\nvm4w\nodejs`; restricted temp-worktree execution required approved tool escalation. Never print or commit env/credentials.

```powershell
$env:PATH='C:\nvm4w\nodejs;'+$env:PATH
# In impl-be
npm run build
npm run lint
npm test -- --silent
$env:E2E_DB_NAME='VIntern_M5_E2E'
$env:DB_NAME=$env:E2E_DB_NAME
$env:THROTTLE_AI_GENERATION_PER_MIN='100' # test invocation only
node run-m1-e2e.cjs start-session session-overview template-library candidate-assignment project-slots
Remove-Item Env:THROTTLE_AI_GENERATION_PER_MIN -ErrorAction SilentlyContinue
node run-m1-e2e.cjs security-hotfix
# In impl-fe
npm run typecheck
npm run lint
npx vitest run
$env:NEXT_PUBLIC_API_BASE_URL='http://localhost:8083/api/v1'
npm run build
```

Keep all dirty files, untracked assets, fixture history and local commits. Do not clean/reset/stash or restore a clean worktree over this implementation.
