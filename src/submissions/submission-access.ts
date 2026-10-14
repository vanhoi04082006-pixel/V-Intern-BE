import { ForbiddenException } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { Task } from "../tasks/entities/task.entity";

export async function assertReviewerScope(
  em: Pick<EntityManager, "query">,
  permissions: PermissionsService,
  task: Pick<Task, "projectId" | "sprintId">,
  actorId: string,
): Promise<void> {
  if (await permissions.hasRole(actorId, "admin")) return;
  const projects: Array<{ mentorId: string | null }> = await em.query(
    "SELECT mentorId FROM projects WHERE id=@0",
    [task.projectId],
  );
  if (
    !projects.length ||
    projects[0].mentorId?.toLowerCase() !== actorId.toLowerCase()
  ) {
    throw new ForbiddenException({
      statusCode: 403,
      code: "SUBMISSION_SCOPE_FORBIDDEN",
      message: "Only the managing mentor can review this submission.",
    });
  }
  if (task.sprintId) {
    const sprints: Array<{ sessionId: string | null }> = await em.query(
      "SELECT sessionId FROM sprints WHERE id=@0",
      [task.sprintId],
    );
    const sessionId = sprints[0]?.sessionId ?? null;
    if (sessionId) {
      const owned: Array<{ n: number }> = await em.query(
        `SELECT COUNT(1) AS n FROM internship_sessions s
             LEFT JOIN session_instructors si ON si.sessionId = s.id AND si.instructorId = @1
           WHERE s.id = @0 AND (s.leadInstructorId = @1 OR si.instructorId = @1)`,
        [sessionId, actorId],
      );
      if (!owned[0]?.n) {
        throw new ForbiddenException({
          statusCode: 403,
          code: "SUBMISSION_SCOPE_FORBIDDEN",
          message: "You do not manage the session of this submission.",
        });
      }
    }
  }
}
