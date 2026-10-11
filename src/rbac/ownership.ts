import { PermissionsService } from './permissions.service';

/**
 * Instructor data ownership (redesign §5).
 *
 * - Admins bypass every scope.
 * - Sessions: leadInstructorId == me OR row in session_instructors.
 * - Projects: mentorId == me OR mentorId IS NULL (unclaimed library items
 *   are visible to all instructors; managing one requires claiming it).
 * - Sprints/tasks: parent project visible AND (no session OR session owned).
 * - Assignments: own (internId == me) OR session owned.
 * - Classes: leadInstructorId == me (mirrors class-lessons access()).
 *
 * Fragments are QueryBuilder-ready with a collision-proof parameter name.
 * Identifiers stay unquoted (SQL Server + camelCase columns, same style as
 * the existing raw queries in this codebase).
 */
export interface Ownership {
  userId: string;
  isAdmin: boolean;
}

export async function resolveOwnership(
  permissions: PermissionsService,
  userId: string,
): Promise<Ownership> {
  return { userId, isAdmin: await permissions.hasRole(userId, 'admin') };
}

export const OWNER_PARAM = '__ownerId';

function ownedSessionFragment(alias: string): string {
  return (
    `(${alias}.leadInstructorId = :${OWNER_PARAM} OR EXISTS ` +
    `(SELECT 1 FROM session_instructors si WHERE si.sessionId = ${alias}.id AND si.instructorId = :${OWNER_PARAM}))`
  );
}

export function sessionScope(alias: string, o: Ownership): { clause: string; params: Record<string, string> } | null {
  if (o.isAdmin) return null;
  return { clause: ownedSessionFragment(alias), params: { [OWNER_PARAM]: o.userId } };
}

export function projectScope(alias: string, o: Ownership): { clause: string; params: Record<string, string> } | null {
  if (o.isAdmin) return null;
  return {
    clause: `(${alias}.mentorId = :${OWNER_PARAM} OR ${alias}.mentorId IS NULL)`,
    params: { [OWNER_PARAM]: o.userId },
  };
}

function projectVisibleFragment(projectTableAlias: string): string {
  return `(${projectTableAlias}.mentorId = :${OWNER_PARAM} OR ${projectTableAlias}.mentorId IS NULL)`;
}

/** Sprints/tasks: parent project visible AND session (if any) owned. */
export function scopedProjectSessionClause(
  projectIdExpr: string,
  sessionIdExpr: string,
): string {
  return (
    `(EXISTS (SELECT 1 FROM projects pj WHERE pj.id = ${projectIdExpr} AND ${projectVisibleFragment('pj')}) ` +
    `AND (${sessionIdExpr} IS NULL OR EXISTS (SELECT 1 FROM internship_sessions s2 WHERE s2.id = ${sessionIdExpr} AND ${ownedSessionFragment('s2')})))`
  );
}

export function assignmentScope(alias: string, o: Ownership): { clause: string; params: Record<string, string> } | null {
  if (o.isAdmin) return null;
  return {
    clause:
      `(${alias}.internId = :${OWNER_PARAM} OR EXISTS ` +
      `(SELECT 1 FROM internship_sessions s3 WHERE s3.id = ${alias}.sessionId AND ${ownedSessionFragment('s3')}))`,
    params: { [OWNER_PARAM]: o.userId },
  };
}

export function classScope(alias: string, o: Ownership): { clause: string; params: Record<string, string> } | null {
  if (o.isAdmin) return null;
  return {
    clause: `${alias}.leadInstructorId = :${OWNER_PARAM}`,
    params: { [OWNER_PARAM]: o.userId },
  };
}
