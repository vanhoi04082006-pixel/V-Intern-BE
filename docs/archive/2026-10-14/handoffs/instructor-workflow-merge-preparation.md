> Tài liệu lịch sử, lưu để truy vết. Không dùng làm hướng dẫn hoặc bằng chứng cho bản hiện hành. Xem README của repository và docs hiện tại.

# Instructor workflow checkpoint integration preparation

> Historical plan only. The owner subsequently approved origin/main for BOTH PRs. The current executable integration record, full 15-migration main delta and all34overlap dispositions are in instructor-workflow-safe-integration.md and the newest progress-handoff section. Do not use the old feature-branch target or three-migration delta below for a main deployment.

Prepared 2026-10-13 Asia/Bangkok. This is a plan only: no merge, push, force push, rebase, deployment or original-worktree edit is authorized/performed here.

## Sources and planning target

| Repository | Source worktree / branch | Code checkpoint HEAD | Planning target / current committed HEAD |
|---|---|---|---|
| FE | `C:\Users\buiva\AppData\Local\Temp\opencode\impl-fe`, `feat/project-first-workflow` | `dcea1abfeccd40a5d5a0e17dc461d09cfb557a34` | `feat/instructor-workflow-redesign`, `d9be3ebc44e683baa8044efff53c732bdbeb57c6` |
| BE | `C:\Users\buiva\AppData\Local\Temp\opencode\impl-be`, `feat/project-first-workflow` | `5b7d2781372ecea994d0bd660b8eb952c2291bd8` | `feat/instructor-workflow-redesign`, `44f5690f185b6458e0a523dce38937ea58661d2a` |

The planning target is the existing feature branch in each original repository, not an assertion that a human selected the eventual release branch. Confirm the actual destination before any future integration. Main/RC1/tags are unchanged. Documentation checkpoint SHA is recorded by the final Git log/snapshot; the source code SHAs above remain reproducible code boundaries.

Both planning-target committed HEADs are ancestors of their source checkpoints. Therefore committed-history integration against those exact target SHAs has no divergent content merge: it can fast-forward. This does **not** make integration into the original dirty worktrees safe.

Original FE `E:\Projects\V-INTERN\V-INTERN FE` has44modified/54untracked; original BE `E:\Projects\V-INTERN\V-INTERN-BE` has19modified/31untracked. Preserve those workstreams. Never copy the implementation directory over them or run checkout/reset/stash to make them clean.

## Checkpoint commit sequence

FE, in dependency order:

1. `6338418a6e1e0c4c9349b750250d061d91d573e6` shared consumer restoration, picker/API/download contracts and tests.
2. `bd6a6dc5bf5e80933f89b8b8acd6079ecf78bafc` permission-aware setup/member selection and reviewed AI editor/race regressions.
3. `d3c1426a1f7dc82a98cfc517218e21070ced3de1` session list/detail/roster/snapshot/progress and API contracts/tests.
4. `fea117f28af74d6dc758ea6387f8d749940844c7` cross-session delivery filtering and owned Sprint/Task detail routes.
5. `80d0b0c12c431e938744c809e2f2590cfa27cb80` scoped performance and persisted report/export workspace.
6. `dcea1abfeccd40a5d5a0e17dc461d09cfb557a34` Project Library entry point and obsolete instructor navigation removal.

BE, in dependency order:

1. `44fbb107d1673e7a0b328d619898da31f17fa0e1` template creation concurrency/ownership and SQL regressions.
2. `b13f2265ab1f485f6b5e668018d2129a6fb1d451` session/assignment lifecycle locks, overview/roster APIs and eligibility tests.
3. `2e9b7db090827f266c441e700c168966571ddc21` bounded Gemini response-body reading and regression.
4. `9f34a9455c602381ce83211f0504c0c597b339c4` scoped batched performance/report aggregation and SQL parameter bounds.
5. `8dcbc59615eca64714038b49e5a7234672d3b597` Sprint/Task filters and SQL overview integration tests.
6. `5b7d2781372ecea994d0bd660b8eb952c2291bd8` atomic AI publication, reservation/replay/late-completion/ownership guards and regressions.

Each BE staged tree was exported and built with Nest before commit. Each FE staged tree was exported and typechecked before commit. Final full regression/optimized build gates are separate evidence in the progress handoff. No source changes were made to split the commits. Earlier-agent portions of mixed-provenance files were preserved and committed only after snapshot/provenance/diff verification.

## Conflict risks with original workstreams

The original dirty paths overlap the complete implementation delta in30FEpaths and4BEpaths. Some restored files may have identical bytes; overlap means manual provenance comparison is required, not that every path has a textual conflict.

FE overlaps:

```text
src/app/instructor/page.tsx
src/app/instructor/projects/page.tsx
src/app/instructor/reports/page.tsx
src/components/product/academic-insights.tsx
src/components/product/academic-picker.tsx
src/components/product/admin-management.tsx
src/components/product/class-attendance-summary.ts
src/components/product/class-operations.tsx
src/components/product/evaluation-management.tsx
src/components/product/identity.tsx
src/components/product/imported-reviews.tsx
src/components/product/instructor-picker.tsx
src/components/product/kanban-dnd.tsx
src/components/product/member-performance.tsx
src/components/product/primitives.tsx
src/components/product/project-changes.tsx
src/components/product/shell.tsx
src/components/product/sprint-overview.tsx
src/components/product/task-spec.tsx
src/lib/api/__tests__/reports.test.ts
src/lib/api/academic-overview.ts
src/lib/api/academic.ts
src/lib/api/class-lessons.ts
src/lib/api/dashboard.ts
src/lib/api/imported-reviews.ts
src/lib/api/management.ts
src/lib/api/reports.ts
src/lib/api/templates.ts
src/lib/api/work.ts
src/lib/auth/api-client.ts
```

BE overlaps:

```text
package-lock.json
src/recruitment/dto/recruitment.dto.ts
src/recruitment/interview.service.ts
src/recruitment/recruitment.controller.ts
```

P0 fixes are already ancestors (FE5a1342a / BE68af4df); never cherry-pick them again. BE amended local `ff23d87` and tracking `19d0227` have identical trees (`git diff --exit-code 19d0227 ff23d87` returns0), but distinct commits. Checkpoint commits extend the local history without rewriting either commit. Do not force-push the divergent branch. A future integration branch can preserve the chosen source lineage; if tracking ancestry must also be reconciled, review a normal history-preserving merge in a separate integration checkout, only after authorization. No such merge was done.

Remote-tracking refs are local observations, not a fresh remote audit. Do a normal fetch before eventual remote integration and recalculate ancestry/overlap. Never infer that GitHub has the dirty local implementation.

## Future integration sequence — do not execute yet

1. Retain verified pre-checkpoint and post-checkpoint snapshots outside Temp, including bundles/manifests and the local-only artifacts. Verify hashes before restore.
2. Have the owner identify and checkpoint the original dirty workstreams separately. Do not stage their changes as part of this workflow without explicit provenance review. If they must remain dirty, leave their checkouts completely untouched.
3. After the actual target is selected and integration authorized, use a **new durable integration checkout** at the selected target commit. The implementation worktrees remain authoritative and preserved. Apply the source history there; against the exact target SHAs above a fast-forward is possible. Reconcile any separately committed original workstream changes in that new checkout, reviewing the listed overlaps individually.
4. Re-run all gates below on the integrated result, plus live Gemini acceptance. Compare P0 ancestry and access-control behavior again if conflicts touch those paths.
5. Only after approval create/push a review branch or PR. Never force push the current source branches. No current instruction authorizes merging into main or deployment.

## Schema compatibility and migration order

No migration source was changed during review/checkpoint. The source contains21ordered migrations; `VIntern_M2_BROWSER` already has all21 applied. `VIntern_M5_E2E` is the isolated regression DB. No migration was run against manual/production here.

Relative to the planning-target BE HEAD, these additive migrations are the new delta and must retain this timestamp order:

1. `1761427200000-AddTemplateLibraryColumns.ts`: adds library metadata; deterministic code backfill; unique/check constraints. Check existing row/backfill uniqueness and locking window before a future real database application.
2. `1761513600000-AddTemplateRunRequest.ts`: nullable requester/request fields and filtered unique idempotency index.
3. `1761600000000-AddAiPlanLifecycle.ts`: lifecycle/draft/error/version columns, JSON/state constraints, session index.

Prerequisites include existing ProjectTemplates1760563200000, ProjectRoleSlots1761254400000 and AiGenerationBatches1761340800000. Always use the complete timestamp-ordered migration list and migration history; never apply just a guessed subset or rerun applied migrations. SQL2019 JSON functions, filtered indexes, UPDLOCK/HOLDLOCK and transactional sp_getapplock are used. `synchronize:false`. Class tables/history remain intact.

Before any approved target-DB migration: verify environment identity, take a tested database backup, run migration history inspection, review only pending migrations and plan the locking/backfill window. Future rollout order is schema prerequisites/pending additive migrations → BE → FE, with a paired API smoke check. This document does not authorize those operations.

## Rollback strategy

- Keep both source histories and bundles; do not reset/rebase/cherry-pick over the originals. Revert integration commits on the integration/review branch if code rollback is needed, preserving the checkpoint history.
- Before any deployment, record the actual last healthy deployed FE/BE artifact pair and configuration. Redeploy that tested pair for application rollback. Do **not** assume the pre-checkpoint FE HEAD is deployable: it lacked restored local consumer files.
- Retain additive schema/data during application rollback; do not automatically run migration down or drop Class/template/AI tables/columns. A database rollback/restoration is a separate approved operation with its own data-retention plan.
- A published AI plan is real delivery data. Never purge it to make an acceptance test look clean; replay uses the persisted idempotency record. On failure, preserve provider provenance and isolate the Session.

## Verification commands for a future integrated checkout

```powershell
$env:PATH='C:\nvm4w\nodejs;'+$env:PATH
# FE checkout
npm run lint
npm run typecheck
npm test
$env:NEXT_PUBLIC_API_BASE_URL='http://localhost:8083/api/v1' # isolated preview only
npm run build
# BE checkout
npm run build
npm run lint
npm test -- --silent
# E2E wrapper is local-only; this direct equivalent is reproducible from committed files.
$env:E2E_DB_NAME='VIntern_M5_E2E'
$env:DB_NAME=$env:E2E_DB_NAME
$env:THROTTLE_AI_GENERATION_PER_MIN='100' # test process only
node -r dotenv/config node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand start-session session-overview template-library candidate-assignment project-slots
Remove-Item Env:THROTTLE_AI_GENERATION_PER_MIN
node -r dotenv/config node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand security-hotfix
# Read migration history only, against a separately verified intended environment:
npm run migration:show
```

Check default-throttle P0 separately, Class route redirect/navigation, real reports/downloads and Session isolation. The test AI provider is not Gemini acceptance. Live acceptance still requires the real fixture Session's Generating→Ready→edited description/criteria/assignee/deadline→Confirm→replay→SQL persistence/isolation evidence. Current live status and exact next action are in `instructor-workflow-progress.md`.
