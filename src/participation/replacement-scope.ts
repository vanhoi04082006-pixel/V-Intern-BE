import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { DataSource, EntityManager } from "typeorm";
import type { PermissionsService } from "../rbac/permissions.service";

export async function requireReplacementStaff(
  db: DataSource | EntityManager,
  permissions: PermissionsService,
  actorId: string,
  purpose: "advice" | "approval",
) {
  const [user]: Array<{ status: string }> = await db.query(
    "SELECT status FROM users WHERE id=@0",
    [actorId],
  );
  const access = await permissions.accessSnapshot(actorId),
    isAdmin = access.roles.has("admin");
  const required = [
    "sessions.manage",
    "recruitment.view",
    ...(purpose === "approval" ? ["assignments.manage"] : []),
  ];
  if (
    user?.status !== "active" ||
    (!isAdmin && !access.roles.has("instructor")) ||
    required.some((permission) => !access.permissions.has(permission))
  )
    throw new ForbiddenException("Không được xử lý đề xuất thay thành viên.");
  return isAdmin;
}

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
  activeIncidentCount: number;
  replacementFrom: number;
}
/** Internal shared source of truth. Callers must first require staff sessions.manage/recruitment.view; isAdmin is server-derived. */
export async function loadReplacementContext(
  db: DataSource | EntityManager,
  actorId: string,
  incidentId: string,
  isAdmin: boolean,
): Promise<ReplacementContext> {
  const [incident]: Array<ReplacementContext & { policySnapshot: string }> =
    await db.query(
      `
    SELECT i.id,i.sessionId,t.projectId,a.id assignmentId,i.internId,i.taskId,i.deadlineVersion,i.policyVersion,i.ordinal,i.points,i.createdAt,
      se.leadInstructorId,COALESCE(pm.roleInProject,rp.selectedRole) roleCode,i.policySnapshot,
      (SELECT COUNT(*) FROM participation_incidents currentIncident WHERE currentIncident.sessionId=i.sessionId AND currentIncident.internId=i.internId AND currentIncident.status='active') activeIncidentCount
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
  let replacementFrom: unknown;
  try {
    replacementFrom = (
      JSON.parse(incident.policySnapshot) as { replacementFrom?: unknown }
    ).replacementFrom;
  } catch {
    /* Missing or invalid evidence must never authorize replacement. */
  }
  if (
    typeof replacementFrom !== "number" ||
    !Number.isInteger(replacementFrom) ||
    replacementFrom < 1 ||
    replacementFrom > 50 ||
    !Number.isInteger(incident.activeIncidentCount) ||
    incident.activeIncidentCount < replacementFrom
  )
    throw new ConflictException({
      code: "REPLACEMENT_THRESHOLD_NOT_MET",
      message:
        "Số vi phạm còn hiệu lực chưa đạt ngưỡng thay thành viên của chính sách đã ghi nhận. Hãy kiểm tra các lần miễn hoặc hủy vi phạm.",
    });
  return { ...incident, replacementFrom };
}
