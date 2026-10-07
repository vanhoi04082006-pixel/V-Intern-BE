import { Injectable } from '@nestjs/common';
import { AssignmentsService, InternWorkspaceResponse } from '../assignments/assignments.service';
import { PermissionsService } from '../rbac/permissions.service';

/**
 * Intern workspace (spec 28/29):
 * - Identity comes ONLY from the authenticated principal — the API never
 *   accepts a userId for the current-user workspace.
 * - Workspace status is ALWAYS database assignment state (never a query
 *   param, FE constant, or preview flag).
 */
@Injectable()
export class InternService {
  constructor(
    private readonly assignmentsService: AssignmentsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async workspace(userId: string): Promise<InternWorkspaceResponse> {
    return this.assignmentsService.workspace(userId);
  }

  /** Exposed for tests/debug: effective permission codes (DB-resolved). */
  effectivePermissions(userId: string): Promise<Set<string>> {
    return this.permissionsService.getEffectivePermissionCodes(userId);
  }
}
