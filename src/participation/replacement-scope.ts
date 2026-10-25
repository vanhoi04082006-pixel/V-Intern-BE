import { ForbiddenException } from "@nestjs/common";
import type { DataSource, EntityManager } from "typeorm";

export interface ReplacementContext {
  id: string;
  sessionId: string;
  projectId: string;
  assignmentId: string;
  internId: string;
  taskId: string;
  roleCode: string;
  leadInstructorId: string | null;
  deadlineVersion: number;
  policyVersion: number;
  ordinal: number;
  points: number;
  createdAt: Date;
}
/** Internal shared source of truth. Callers must first require staff sessions.manage/recruitment.view; isAdmin is server-derived. */
export async function loadReplacementContext(
  db: DataSource | EntityManager,
  actorId: string,
  incidentId: string,
  isAdmin: boolean,
): Promise<ReplacementContext> {
  const [incident]: ReplacementContext[] = await db.query(
    `
    SELECT i.id,i.sessionId,t.projectId,a.id assignmentId,i.internId,i.taskId,i.deadlineVersion,i.policyVersion,i.ordinal,i.points,i.createdAt,
      se.leadInstructorId,COALESCE(pm.roleInProject,rp.selectedRole) roleCode
    FROM participation_incidents i JOIN tasks t ON t.id=i.taskId AND t.assigneeId=i.internId AND t.deletedAt IS NULL
    JOIN assignments a ON a.internId=i.internId AND a.sessionId=i.sessionId AND a.projectId=t.projectId AND a.status='active'
    JOIN internship_sessions se ON se.id=i.sessionId AND se.status='active'
    JOIN projects p ON p.id=a.projectId AND p.status='active'
    JOIN recruitment_profiles rp ON rp.userId=i.internId AND rp.status='passed'
    LEFT JOIN project_members pm ON pm.projectId=a.projectId AND pm.userId=i.internId
    JOIN career_roles cr ON cr.code=COALESCE(pm.roleInProject,rp.selectedRole) AND cr.status='published'
    WHERE i.id=@0 AND i.status='active' AND i.recommendReplacement=1`,
    [incidentId],
  );
  if (
    !incident ||
    (!isAdmin &&
      incident.leadInstructorId?.toLowerCase() !== actorId.toLowerCase())
  )
    throw new ForbiddenException(
      "Không được đề xuất thay thành viên trong phạm vi này.",
    );
  return incident;
}
