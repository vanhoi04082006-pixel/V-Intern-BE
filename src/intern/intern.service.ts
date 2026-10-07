import { Injectable } from '@nestjs/common';
import {
  AssignmentsService,
  InternWorkspaceResponse,
} from '../assignments/assignments.service';
import { PermissionsService } from '../rbac/permissions.service';
import type { InternTaskWorkspaceData } from '../tasks/tasks.service';
import { TasksService } from '../tasks/tasks.service';

/**
 * Intern workspace (spec 28/29 + Phase 3 spec 23):
 * - Identity comes ONLY from the authenticated principal — the API never
 *   accepts a userId for the current-user workspace.
 * - Workspace status is ALWAYS database assignment state (never a query
 *   param, FE constant, or preview flag).
 * - Phase 3 extension adds ONLY real sprint/task data: currentSprint,
 *   taskSummary and focusedTask. When the intern is unassigned (or has no
 *   sprint/tasks yet) the contract stays stable with null / zero counts —
 *   no fake KPI/evaluation/AI data is ever produced here.
 */
export type InternWorkspaceExtended = InternWorkspaceResponse & InternTaskWorkspaceData;

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
  ) {}

  async workspace(userId: string): Promise<InternWorkspaceExtended> {
    const base = await this.assignmentsService.workspace(userId);
    if (base.status !== 'active' || !base.assignment) {
      return { ...base, currentSprint: null, taskSummary: EMPTY_SUMMARY, focusedTask: null };
    }
    const extension = await this.tasksService.workspaceExtension(
      userId,
      base.assignment.project.id,
    );
    return { ...base, ...extension };
  }

  /** Exposed for tests/debug: effective permission codes (DB-resolved). */
  effectivePermissions(userId: string): Promise<Set<string>> {
    return this.permissionsService.getEffectivePermissionCodes(userId);
  }
}
