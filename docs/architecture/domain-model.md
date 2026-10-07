# V-Intern Domain Model — Phase 1 (IMPLEMENTED) + PLANNED

Status markers: **[IMPLEMENTED]** = exists in `1759872000000-InitPlatformCore` (migration-first, `synchronize=false`).
Everything else is **PLANNED — NOT IMPLEMENTED YET** (do not claim it exists).

## Identity & RBAC [IMPLEMENTED]

| Table | PK | Keys / constraints | Notes |
| --- | --- | --- | --- |
| `users` | `id` uniqueidentifier | `UX_users_email`, `UX_users_username` (unique); `CK_users_status` IN (active/pending/locked/deleted) | `passwordHash` bcrypt, never serialized |
| `roles` | `id` | `UX_roles_code`; `isSystem` bit | admin / instructor / intern seeded by `ensureRbac` (idempotent) |
| `permissions` | `id` | `UX_permissions_code` | `module.code` catalogue (14 Phase-1 codes) |
| `user_roles` | (userId, roleId) | FKs CASCADE | direct assignment |
| `role_permissions` | (roleId, permissionId) | FKs CASCADE | grants |
| `user_groups` | `id` | `UX_user_groups_code` | grouping |
| `group_members` | (groupId, userId) | FKs CASCADE | membership |
| `group_roles` | (groupId, roleId) | FKs CASCADE | **role inheritance via groups** |

Effective permissions = roles(`user_roles`) ∪ roles(via `group_members`→`group_roles`) → their `role_permissions`.
Resolved from DB per request (`PermissionsService`) — JWT carries identity only.

## Sessions / tokens [IMPLEMENTED]

| Table | Keys | Notes |
| --- | --- | --- |
| `refresh_tokens` | `UX_refresh_tokens_tokenHash`; IX userId, familyId | SHA-256 hash at rest; `familyId` + `replacedById` rotation; replay → family revocation |

## System [IMPLEMENTED]

| Table | Keys | Notes |
| --- | --- | --- |
| `catalog_types` | `UX_catalog_types_code` | e.g. task-priority |
| `catalog_items` | `UX_catalog_items_type_code` (typeId, code) | value nvarchar(1024), sortOrder, isActive |
| `system_settings` | PK `settingKey` | `nvarchar(max)` value; upsert audited |
| `audit_logs` | IX (actorId, createdAt DESC), (action, createdAt DESC) | security/compliance trail, append-only, FK actor SET NULL |
| `activity_events` | IX createdAt DESC, (module, createdAt DESC) | user-facing feed — DISTINCT from audit_logs |

## Notifications [IMPLEMENTED]

| Table | Keys | Notes |
| --- | --- | --- |
| `notifications` | IX (userId, readAt) | FK CASCADE; `readAt` nullable |
| `notification_preferences` | PK (userId, category) | missing row = enabled; fan-out respects prefs (sent/skipped) |

## PLANNED — NOT IMPLEMENTED YET (Phase 2+, reference: raw snapshot 43-model schema)

- **Academic**: Classes, ClassMembers, InternshipSessions, SessionInstructors, SessionMembers, SessionMilestones
- **Project/Sprint/Task**: Projects, ProjectTemplates, ProjectMembers, Sprints, Tasks, TaskComments, TaskStatusHistory, Assignments
- **Recruitment**: RecruitmentProfiles, InterviewQuestions, InterviewAnswers (⚠️ raw snapshot had an UNAUTHENTICATED questions endpoint — must require auth when ported)
- **Evaluation**: Evaluations (Overall = 0.7×Technical + 0.3×Soft, pass ≥ 70 — backend-computed)
- **KPI / Salary / Certificates**: KpiPeriods, KpiMetrics, KpiEntries, VirtualSalaryTransactions, Certificates (⚠️ add the revoke route the raw snapshot missed)
- **AI**: AIRuns, AIMentorConversations, AIMentorMessages (provider keys via env only — never in DB)
- **Reporting**: VelocitySnapshots

When these land, each becomes a NEW numbered migration — never an edit of `InitPlatformCore`.
