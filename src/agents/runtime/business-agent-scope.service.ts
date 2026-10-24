import { ForbiddenException, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { PermissionsService } from "../../rbac/permissions.service";
import { assertReviewerScope } from "../../submissions/submission-access";
import { retrievalPolicy } from "../../knowledge/knowledge-retrieval.policy";
import type { BusinessAgentDefinition } from "../definitions/business-agents";
const uuid = (value: string) =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const deny = (): never => {
  throw new ForbiddenException("Không được chạy Agent trong phạm vi này.");
};

/** Internal workflow authority, not a new RBAC grant or public knowledge endpoint. */
@Injectable()
export class BusinessAgentScope {
  constructor(
    private readonly db: DataSource,
    private readonly permissions: PermissionsService,
  ) {}
  async resolve(
    actor: string,
    definition: BusinessAgentDefinition,
    resourceType: string,
    id: string,
  ) {
    if (!uuid(actor) || !uuid(id)) deny();
    const [user]: Array<{ status: string }> = await this.db.query(
      "SELECT status FROM users WHERE id=@0",
      [actor],
    );
    if (user?.status !== "active") deny();
    const access = await this.permissions.accessSnapshot(actor),
      permissions = access.permissions;
    const admin = access.roles.has("admin"),
      intern = access.roles.has("intern"),
      staff = admin || access.roles.has("instructor");
    const requirePermission = (code: string) => {
      if (!permissions.has(code)) deny();
    };
    const policy = retrievalPolicy(definition.consumer);
    if (
      ["project", "submission", "evaluation"].includes(definition.resource) &&
      !staff
    )
      deny();
    let roleCodes: string[] = [];
    if (definition.resource === "application") {
      if (resourceType !== 'cv_application' || !staff) deny();
      requirePermission('applications.manage');
      const [application] = await this.db.query("SELECT a.roundId,r.ownerId FROM cv_applications a JOIN recruitment_rounds r ON r.id=a.roundId WHERE a.id=@0 AND a.verifiedAt IS NOT NULL AND a.status NOT IN('cancelled','deferred','unverified')", [id]);
      if (!application || !admin && application.ownerId.toLowerCase() !== actor.toLowerCase()) deny();
      roleCodes = (await this.db.query("SELECT DISTINCT s.roleCode FROM interview_slots s JOIN career_roles c ON c.code=s.roleCode WHERE s.roundId=@0 AND s.status='open' AND c.status='published' AND c.acceptingApplications=1", [application.roundId])).map((s: { roleCode: string }) => s.roleCode);
    } else if (definition.resource === "interview") {
      if (resourceType !== "interview_session") deny();
      const [interview]: Array<{ userId: string; roleCode: string }> =
        await this.db.query(
          "SELECT userId,roleCode FROM interview_sessions WHERE id=@0",
          [id],
        );
      if (
        !interview ||
        (!admin &&
          (!intern || interview.userId.toLowerCase() !== actor.toLowerCase()))
      )
        deny();
      requirePermission(
        definition.id === "interview-evaluator"
          ? admin
            ? "recruitment.manage"
            : "recruitment.submit.own"
          : "recruitment.start.own",
      );
      roleCodes = [interview.roleCode];
    } else if (definition.resource === "project") {
      if (resourceType !== "project") deny();
      requirePermission("sprints.manage");
      const [project]: Array<{ mentorId: string | null }> = await this.db.query(
        "SELECT mentorId FROM projects WHERE id=@0",
        [id],
      );
      if (
        !project ||
        (!admin &&
          project.mentorId &&
          project.mentorId.toLowerCase() !== actor.toLowerCase())
      )
        deny();
      const runs = await this.db.query(
        "SELECT 1 denied FROM template_runs r JOIN internship_sessions s ON s.id=r.sessionId WHERE r.projectId=@0 AND (s.leadInstructorId IS NULL OR s.leadInstructorId<>@1) AND NOT EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=s.id AND si.instructorId=@1)",
        [id, actor],
      );
      if (!admin && runs.length) deny();
      roleCodes = (
        await this.db.query(
          "SELECT roleCode FROM project_role_slots WHERE projectId=@0",
          [id],
        )
      ).map((row: { roleCode: string }) => row.roleCode);
    } else if (definition.resource === "submission") {
      if (resourceType !== "task_submission") deny();
      requirePermission("tasks.manage");
      const [task]: Array<{
        projectId: string;
        sprintId: string | null;
        internId: string;
      }> = await this.db.query(
        "SELECT t.projectId,t.sprintId,s.internId FROM task_submissions s JOIN tasks t ON t.id=s.taskId WHERE s.id=@0",
        [id],
      );
      if (!task) deny();
      await assertReviewerScope(this.db, this.permissions, task, actor);
      roleCodes = await this.rolesForIntern(task.internId);
    } else if (definition.resource === "conversation") {
      if (resourceType !== "ai_mentor_conversation") deny();
      requirePermission("ai.mentor.use");
      const [conversation]: Array<{ userId: string; status: string }> =
        await this.db.query(
          "SELECT userId,status FROM ai_mentor_conversations WHERE id=@0",
          [id],
        );
      if (
        !intern ||
        !conversation ||
        conversation.status !== "active" ||
        conversation.userId.toLowerCase() !== actor.toLowerCase()
      )
        deny();
      roleCodes = await this.rolesForIntern(actor);
    } else if (definition.resource === "intern") {
      if (resourceType !== "ai_recommendation_snapshot") deny();
      requirePermission(
        admin ? "ai.recommendations.view" : "ai.recommendations.view.own",
      );
      if (!admin && (!intern || actor.toLowerCase() !== id.toLowerCase()))
        deny();
      roleCodes = await this.rolesForIntern(id);
    } else {
      if (resourceType !== "evaluation") deny();
      requirePermission("ai.evaluation.assist");
      const [evaluation]: Array<{
        internId: string;
        evaluatorId: string;
        projectId: string | null;
        sessionId: string | null;
      }> = await this.db.query(
        "SELECT internId,evaluatorId,projectId,sessionId FROM evaluations WHERE id=@0",
        [id],
      );
      if (!evaluation) deny();
      if (
        !admin &&
        evaluation.evaluatorId.toLowerCase() !== actor.toLowerCase()
      ) {
        requirePermission("evaluations.manage");
        const owned = await this.db.query(
          "SELECT 1 ok WHERE EXISTS(SELECT 1 FROM session_instructors WHERE sessionId=@0 AND instructorId=@2) OR EXISTS(SELECT 1 FROM projects WHERE id=@1 AND mentorId=@2)",
          [evaluation.sessionId, evaluation.projectId, actor],
        );
        if (!owned.length) deny();
      }
      roleCodes = await this.rolesForIntern(evaluation.internId);
    }
    return { policy, roleCodes: [...new Set(roleCodes)].sort() };
  }
  private async rolesForIntern(id: string) {
    const rows: Array<{ selectedRole: string | null }> = await this.db.query(
      "SELECT selectedRole FROM recruitment_profiles WHERE userId=@0",
      [id],
    );
    return rows.flatMap((row) => (row.selectedRole ? [row.selectedRole] : []));
  }
}
