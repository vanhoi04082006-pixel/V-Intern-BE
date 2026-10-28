import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { DataSource, EntityManager } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
export async function participationAccess(
  db: DataSource | EntityManager,
  permissions: PermissionsService,
  sessionId: string,
  actorId: string,
) {
  const [session]: Array<{
    id: string;
    leadInstructorId: string | null;
    status: string;
  }> = await db.query(
    "SELECT id,leadInstructorId,status FROM internship_sessions WHERE id=@0",
    [sessionId],
  );
  if (!session) throw new NotFoundException("Không tìm thấy phiên thực tập.");
  if (
    session.leadInstructorId?.toLowerCase() !== actorId.toLowerCase() &&
    !(await permissions.hasRole(actorId, "admin"))
  )
    throw new ForbiddenException(
      "Chỉ Admin hoặc giảng viên chủ trì được xử lý chính sách và vi phạm của phiên.",
    );
  return session;
}
