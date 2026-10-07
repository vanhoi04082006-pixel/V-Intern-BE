import { Injectable } from '@nestjs/common';
import {
  AssignmentsService,
  InternWorkspaceResponse,
} from '../assignments/assignments.service';
import { PermissionsService } from '../rbac/permissions.service';
import { AuditService } from '../audit/audit.service';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { InternTaskWorkspaceData } from '../tasks/tasks.service';
import { TasksService } from '../tasks/tasks.service';

/**
 * Intern workspace (spec 28/29 + Phase 3 spec 23 + Phase 4 spec 46-48):
 * - Identity comes ONLY from the authenticated principal — the API never
 *   accepts a userId for the current-user workspace.
 * - PHASE 4 AUTHORITATIVE LIFECYCLE (spec 46): recruitment gates the
 *   workspace. An intern WITHOUT a PASSED recruitment profile NEVER
 *   receives a normal waiting/active workspace just because they hold the
 *   intern RBAC role:
 *     not started / role_selected  → recruitment_required
 *     interview in progress        → recruitment_in_progress
 *     evaluation pending           → recruitment_in_progress
 *     failed                       → recruitment_failed
 *     passed + no assignment       → unassigned (Phase 2/3 semantics)
 *     passed + active assignment   → active (Phase 2/3 semantics)
 * - Recruitment-blocked responses return EARLY — no heavy Sprint/Task
 *   queries run for them (spec 78).
 * - BAD-DATA DEFENSE (spec 48): an active assignment on a non-passed
 *   profile is an invariant violation — the workspace is still lifecycle-
 *   restricted and the issue is audited (best-effort, non-blocking).
 * - Phase 3 extension adds ONLY real sprint/task data: currentSprint,
 *   taskSummary and focusedTask. No fake KPI/evaluation/AI data is ever
 *   produced here.
 */
export interface RecruitmentLifecycleInfo {
  status: string;
  selectedRole: string | null;
  attemptCount: number;
  recruitedAt: Date | null;
}

export type InternWorkspaceStatus =
  | 'recruitment_required'
  | 'recruitment_in_progress'
  | 'recruitment_failed'
  | 'unassigned'
  | 'active';

export interface InternWorkspaceV2
  extends Omit<InternWorkspaceResponse, 'status'>,
    InternTaskWorkspaceData {
  status: InternWorkspaceStatus;
  recruitment: RecruitmentLifecycleInfo | null;
}

const EMPTY_SUMMARY: InternTaskWorkspaceData['taskSummary'] = {
  todo: 0,
  doing: 0,
  review: 0,
  done: 0,
  total: 0,
};

@Injectable()
export class InternService {
  constructor(
    private readonly assignmentsService: AssignmentsService,
    private readonly permissionsService: PermissionsService,
    private readonly tasksService: TasksService,
    @InjectRepository(RecruitmentProfile)
    private readonly recruitmentProfiles: Repository<RecruitmentProfile>,
    private readonly auditService: AuditService,
  ) {}

  async workspace(userId: string): Promise<InternWorkspaceV2> {
    // ── Recruitment gate (spec 46) — the authoritative first source ──────
    const profile = await this.recruitmentProfiles.findOne({ where: { userId } });
    const recruitmentStatus = profile?.status ?? 'not_started';

    if (recruitmentStatus !== 'passed') {
      // BAD-DATA DEFENSE (spec 48): an active assignment on a non-passed
      // profile is an invariant violation — audit it (best-effort) and keep
      // the lifecycle restriction authoritative. No active workspace data
      // is exposed either way.
      const active = await this.assignmentsService.findActiveAssignment(userId);
      if (active) {
        await this.auditService.record({
          actorId: null,
          action: 'recruitment.invariant_violation',
          targetType: 'recruitment_profile',
          targetId: profile?.id ?? userId,
          detail: {
            userId,
            recruitmentStatus,
            activeAssignmentId: active.id,
            note: 'Active assignment exists for an intern who has not passed recruitment',
          },
        });
      }
      const status: InternWorkspaceStatus =
        recruitmentStatus === 'failed'
          ? 'recruitment_failed'
          : recruitmentStatus === 'interview_in_progress' || recruitmentStatus === 'evaluation_pending'
            ? 'recruitment_in_progress'
            : 'recruitment_required';
      return {
        status,
        assignment: null,
        recruitment: {
          status: recruitmentStatus,
          selectedRole: profile?.selectedRole ?? null,
          attemptCount: profile?.attemptCount ?? 0,
          recruitedAt: null,
        },
        currentSprint: null,
        taskSummary: EMPTY_SUMMARY,
        focusedTask: null,
      };
    }

    // ── Passed: Phase 2/3 semantics apply (unassigned/active) ────────────
    const base = await this.assignmentsService.workspace(userId);
    const recruitment: RecruitmentLifecycleInfo = {
      status: recruitmentStatus,
      selectedRole: profile?.selectedRole ?? null,
      attemptCount: profile?.attemptCount ?? 0,
      recruitedAt: profile?.recruitedAt ?? null,
    };
    if (base.status !== 'active' || !base.assignment) {
      return {
        ...base,
        status: 'unassigned',
        recruitment,
        currentSprint: null,
        taskSummary: EMPTY_SUMMARY,
        focusedTask: null,
      };
    }
    const extension = await this.tasksService.workspaceExtension(
      userId,
      base.assignment.project.id,
    );
    return { ...base, status: 'active', recruitment, ...extension };
  }

  /** Exposed for tests/debug: effective permission codes (DB-resolved). */
  effectivePermissions(userId: string): Promise<Set<string>> {
    return this.permissionsService.getEffectivePermissionCodes(userId);
  }
}
