import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { stateHash } from "../agents/runtime/agent-state.store";
import { participationAccess } from "./participation-access";
import {
  loadReplacementContext,
  requireReplacementStaff,
  type ReplacementContext,
} from "./replacement-scope";
import { eligibleReplacementCandidates } from "./replacement-candidates";
import { parseReplacementAdviceRecord } from "./replacement-record.policy";
import { planReplacementTasks, type ReplacementTask } from "./replacement-plan";
import {
  replacementPreviewSchema,
  replacementResultSchema,
} from "./replacement-preview.policy";

export const replacementChanged = () =>
  new ConflictException({
    code: "REPLACEMENT_CONTEXT_CHANGED",
    message:
      "Bằng chứng hoặc ảnh hưởng thay người đã đổi. Tạo bản xem trước mới rồi xác nhận lại.",
  });
export interface ReplacementCommandRow {
  id: string;
  sessionId: string;
  adviceId: string;
  incidentId: string;
  oldAssignmentId: string;
  targetInternId: string;
  candidateId: string;
  projectId: string;
  roleCode: string;
  previewJson: string;
  previewHash: string;
  status: "pending" | "approved";
  effectiveStatus: "pending" | "approved" | "expired";
  expiresAt: Date;
  createdAt: Date;
  createdById: string;
  approvedAt: Date | null;
  approvedById: string | null;
  resultJson: string | null;
}
@Injectable()
export class ReplacementPreviewService {
  constructor(
    private readonly db: DataSource,
    private readonly permissions: PermissionsService,
  ) {}
  async inspect(
    db: DataSource | EntityManager,
    sessionId: string,
    incidentId: string,
    actorId: string,
    candidateId: string,
    lockTasks = false,
  ) {
    const isAdmin = await requireReplacementStaff(
      db,
      this.permissions,
      actorId,
      "approval",
    );
    const session = await participationAccess(
      db,
      this.permissions,
      sessionId,
      actorId,
    );
    if (session.status !== "active") throw replacementChanged();
    const [belongs]: Array<{ sessionId: string }> = await db.query(
      "SELECT sessionId FROM participation_incidents WHERE id=@0",
      [incidentId],
    );
    if (!belongs || belongs.sessionId.toLowerCase() !== sessionId.toLowerCase())
      throw new NotFoundException("Không tìm thấy ghi nhận trong phiên.");
    let context: ReplacementContext;
    try {
      context = await loadReplacementContext(db, actorId, incidentId, isAdmin);
    } catch (e) {
      if (e instanceof ForbiddenException) throw replacementChanged();
      throw e;
    }
    const [candidate] = await eligibleReplacementCandidates(
      db,
      context.roleCode,
      [candidateId],
    );
    if (!candidate)
      throw new ConflictException({
        code: "REPLACEMENT_CANDIDATE_UNAVAILABLE",
        message:
          "Ứng viên không còn khả dụng hoặc không đáp ứng đúng vai trò. Hãy yêu cầu đề xuất mới.",
      });
    const [labels]: Array<{
      projectName: string;
      capacity: number | null;
      sessionName: string;
      sessionEnd: Date;
      roleName: string;
      targetName: string | null;
    }> = await db.query(
      `SELECT p.name projectName,p.capacity,se.name sessionName,se.endDate sessionEnd,cr.name roleName,u.displayName targetName
      FROM projects p JOIN internship_sessions se ON se.id=@1 JOIN career_roles cr ON cr.code=@2 JOIN users u ON u.id=@3 WHERE p.id=@0`,
      [context.projectId, sessionId, context.roleCode, context.internId],
    );
    const pin: Array<{ projectId: string }> = await db.query(
      "SELECT TOP(1) projectId FROM template_runs WHERE sessionId=@0 ORDER BY createdAt DESC",
      [sessionId],
    );
    if (
      pin.length &&
      pin[0].projectId.toLowerCase() !== context.projectId.toLowerCase()
    )
      throw replacementChanged();
    const slots: Array<{ roleCode: string; requiredCount: number }> =
      await db.query(
        "SELECT roleCode,requiredCount FROM project_role_slots WHERE projectId=@0",
        [context.projectId],
      );
    const slot = slots.find(
      (s) => s.roleCode.toLowerCase() === context.roleCode.toLowerCase(),
    );
    if (pin.length && !slot)
      throw new ConflictException({
        code: "SESSION_ROLE_INVALID",
        message:
          "Dự án không còn vị trí tương ứng. Giảng viên cần kiểm tra cấu hình vai trò.",
      });
    const [counts]: Array<{ activeOthers: number; roleOthers: number }> =
      await db.query(
        `SELECT (SELECT COUNT(*) FROM assignments WHERE projectId=@0 AND status='active' AND id<>@1) activeOthers,
      (SELECT COUNT(*) FROM project_members pm JOIN assignments a ON a.projectId=pm.projectId AND a.internId=pm.userId AND a.status='active' WHERE pm.projectId=@0 AND pm.roleInProject=@2 AND a.id<>@1) roleOthers`,
        [context.projectId, context.assignmentId, context.roleCode],
      );
    if (labels.capacity !== null && counts.activeOthers >= labels.capacity)
      throw new ConflictException({
        code: "PROJECT_CAPACITY_FULL",
        message: "Dự án không còn đủ chỗ để tiếp nhận người thay thế.",
      });
    if (slot && counts.roleOthers >= slot.requiredCount)
      throw new ConflictException({
        code: "ROLE_SLOT_FULL",
        message:
          "Vai trò của dự án không còn đủ chỗ để tiếp nhận người thay thế.",
      });
    const tasks: Array<{
      id: string;
      code: string;
      title: string;
      status: ReplacementTask["status"];
      version: number;
      dueDate: Date | null;
      sprintStatus: string | null;
      sprintProjectId: string | null;
      hasPendingSubmission: boolean;
    }> = await db.query(
      `SELECT TOP(501) t.id,t.code,t.title,t.status,t.version,t.dueDate,sp.status sprintStatus,sp.projectId sprintProjectId,
      CAST(CASE WHEN EXISTS(SELECT 1 FROM task_submissions sub WHERE sub.taskId=t.id AND sub.status='submitted') THEN 1 ELSE 0 END AS bit) hasPendingSubmission
      FROM tasks t ${lockTasks ? "WITH(UPDLOCK,HOLDLOCK)" : ""} LEFT JOIN sprints sp ON sp.id=t.sprintId
      WHERE t.projectId=@0 AND t.assigneeId=@1 AND t.deletedAt IS NULL AND (sp.sessionId=@2 OR sp.sessionId IS NULL) ORDER BY t.id`,
      [context.projectId, context.internId, sessionId],
    );
    if (
      tasks.some(
        (t) =>
          t.sprintProjectId &&
          t.sprintProjectId.toLowerCase() !== context.projectId.toLowerCase(),
      )
    )
      throw replacementChanged();
    const [{ utcNow }]: Array<{ utcNow: Date }> = await db.query(
      "SELECT SYSUTCDATETIME() utcNow",
    );
    const taskEvidence: ReplacementTask[] = tasks.map((t) => ({
      id: t.id.toLowerCase(),
      code: t.code,
      title: t.title,
      status: t.status,
      version: t.version,
      dueAt: t.dueDate,
      sprintStatus: t.sprintStatus,
      hasPendingSubmission: t.hasPendingSubmission,
    }));
    const summary = {
      sessionId: sessionId.toLowerCase(),
      sessionName: labels.sessionName,
      projectId: context.projectId.toLowerCase(),
      projectName: labels.projectName,
      roleCode: context.roleCode,
      roleName: labels.roleName,
      oldAssignmentId: context.assignmentId.toLowerCase(),
      oldInternId: context.internId.toLowerCase(),
      oldInternName: labels.targetName ?? "Sinh viên hiện tại",
      candidateId: candidate.id.toLowerCase(),
      candidateName: candidate.displayName ?? "Ứng viên",
    };
    const evidence = {
      summary,
      incident: {
        id: incidentId.toLowerCase(),
        policyVersion: context.policyVersion,
        deadlineVersion: context.deadlineVersion,
        ordinal: context.ordinal,
        points: context.points,
        activeIncidentCount: context.activeIncidentCount,
        replacementFrom: context.replacementFrom,
      },
      capacity: {
        project: labels.capacity,
        role: slot?.requiredCount ?? null,
        activeOthers: counts.activeOthers,
        roleOthers: counts.roleOthers,
      },
      tasks: taskEvidence.map((t) => ({
        ...t,
        dueAt: t.dueAt?.toISOString() ?? null,
      })),
      sessionEnd: labels.sessionEnd.toISOString(),
    };
    return {
      context,
      summary,
      tasks: taskEvidence,
      now: utcNow,
      sessionEnd: labels.sessionEnd,
      sourceFingerprint: stateHash(JSON.stringify(evidence)),
    };
  }
  private taskPlan(tasks: ReplacementTask[], at: Date, hours: number) {
    try {
      return planReplacementTasks(tasks, at, hours);
    } catch (e) {
      const code = e instanceof Error ? e.message : "REPLACEMENT_PLAN_INVALID";
      throw new ConflictException({
        code,
        message:
          code === "REPLACEMENT_PENDING_REVIEW"
            ? "Có bài đang chờ duyệt. Giảng viên cần xử lý xong trước khi thay thành viên."
            : code === "REPLACEMENT_TASK_LIMIT"
              ? "Phạm vi vượt 500 nhiệm vụ; cần kiểm tra phân công trước khi chuyển."
              : "Thời gian bàn giao không hợp lệ.",
      });
    }
  }
  async prepare(
    sessionId: string,
    incidentId: string,
    actorId: string,
    input: { adviceId: string; candidateId: string; handoverHours: number },
  ) {
    const current = await this.inspect(
      this.db,
      sessionId,
      incidentId,
      actorId,
      input.candidateId,
    );
    const event = await this.validateAdvice(
      this.db,
      sessionId,
      incidentId,
      input.adviceId,
      input.candidateId,
      current.summary,
      current.context,
    );
    const taskPlan = this.taskPlan(
        current.tasks,
        current.now,
        input.handoverHours,
      ),
      warnings: string[] = [];
    if (
      taskPlan.transfers.some(
        (t) =>
          t.handoverDueAt && new Date(t.handoverDueAt) > current.sessionEnd,
      )
    )
      warnings.push(
        "Một số hạn bàn giao vượt lịch kết thúc phiên hiện tại. Giảng viên cần kiểm tra lịch phiên trước khi phê duyệt.",
      );
    warnings.push(
      "Quyền GitHub do V-Intern cấp sẽ được đối chiếu riêng; quyền cấp thủ công có thể cần Admin xử lý.",
    );
    const document = replacementPreviewSchema.parse({
      schemaVersion: 1,
      preparedAt: current.now.toISOString(),
      handoverHours: input.handoverHours,
      adviceId: input.adviceId,
      sourceFingerprint: current.sourceFingerprint,
      summary: current.summary,
      taskPlan,
      warnings,
    });
    const id = randomUUID(),
      previewHash = stateHash(JSON.stringify(document)),
      expiresAt = new Date(
        Math.min(current.now.getTime() + 15 * 60000, event.expiresAt.getTime()),
      );
    await this.db.query(
      `INSERT INTO participation_replacement_commands(id,sessionId,adviceId,incidentId,oldAssignmentId,targetInternId,candidateId,projectId,roleCode,previewJson,previewHash,createdById,expiresAt) VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8,@9,@10,@11,@12)`,
      [
        id,
        sessionId,
        input.adviceId,
        incidentId,
        current.context.assignmentId,
        current.context.internId,
        input.candidateId,
        current.context.projectId,
        current.context.roleCode,
        JSON.stringify(document),
        previewHash,
        actorId,
        expiresAt.toISOString(),
      ],
    );
    return {
      id,
      previewHash,
      expiresAt: expiresAt.toISOString(),
      status: "pending" as const,
      document,
    };
  }
  async validateAdvice(
    db: DataSource | EntityManager,
    sessionId: string,
    incidentId: string,
    adviceId: string,
    candidateId: string,
    summary: {
      oldAssignmentId: string;
      projectId: string;
      oldInternId: string;
      roleCode: string;
    },
    evidence: ReplacementContext,
  ) {
    const [event]: Array<{ detail: string; expiresAt: Date; usable: boolean }> =
      await db.query(
        `SELECT detail,DATEADD(minute,30,createdAt) expiresAt,CAST(CASE WHEN createdAt BETWEEN DATEADD(minute,-30,SYSUTCDATETIME()) AND SYSUTCDATETIME() THEN 1 ELSE 0 END AS bit) usable
      FROM participation_events WHERE id=@0 AND sessionId=@1 AND incidentId=@2 AND action='replacement.advised'`,
        [adviceId, sessionId, incidentId],
      );
    if (!event || !event.usable)
      throw new ConflictException({
        code: "REPLACEMENT_ADVICE_EXPIRED",
        message:
          "Tư vấn không còn hiệu lực. Yêu cầu Agent đề xuất lại trước khi thay.",
      });
    try {
      if (event.detail.length > 200000) throw Error("Oversized advice");
      const raw: unknown = JSON.parse(event.detail),
        record = parseReplacementAdviceRecord(raw);
      if (
        !raw ||
        typeof raw !== "object" ||
        stateHash(JSON.stringify((raw as Record<string, unknown>).source)) !==
          record.contextHash ||
        record.source.scope.assignmentId.toLowerCase() !==
          summary.oldAssignmentId ||
        record.source.scope.projectId.toLowerCase() !== summary.projectId ||
        record.source.scope.sessionId.toLowerCase() !==
          sessionId.toLowerCase() ||
        record.source.scope.internId.toLowerCase() !== summary.oldInternId ||
        record.source.incident.id.toLowerCase() !== incidentId.toLowerCase() ||
        record.source.scope.roleCode !== summary.roleCode ||
        record.source.incident.deadlineVersion !== evidence.deadlineVersion ||
        record.source.incident.policyVersion !== evidence.policyVersion ||
        record.source.incident.ordinal !== evidence.ordinal ||
        record.source.incident.points !== evidence.points ||
        (record.source.incident.activeIncidentCount !== undefined &&
          record.source.incident.activeIncidentCount !==
            evidence.activeIncidentCount) ||
        (record.source.incident.replacementFrom !== undefined &&
          record.source.incident.replacementFrom !==
            evidence.replacementFrom) ||
        !record.source.candidates.some(
          (c) => c.userId.toLowerCase() === candidateId.toLowerCase(),
        )
      )
        throw Error("Advice scope changed");
    } catch {
      throw replacementChanged();
    }
    return event;
  }
  async loadCommand(
    db: DataSource | EntityManager,
    sessionId: string,
    id: string,
    lock = false,
  ) {
    const [row]: ReplacementCommandRow[] = await db.query(
      `SELECT *,CASE WHEN status='pending' AND expiresAt<SYSUTCDATETIME() THEN 'expired' ELSE status END effectiveStatus FROM participation_replacement_commands ${lock ? "WITH(UPDLOCK,HOLDLOCK)" : ""} WHERE id=@0 AND sessionId=@1`,
      [id, sessionId],
    );
    if (!row) throw new NotFoundException("Không tìm thấy bản xem trước.");
    try {
      const document = replacementPreviewSchema.parse(
        JSON.parse(row.previewJson),
      );
      if (
        stateHash(JSON.stringify(document)) !== row.previewHash ||
        document.summary.oldAssignmentId !==
          row.oldAssignmentId.toLowerCase() ||
        document.summary.candidateId !== row.candidateId.toLowerCase() ||
        document.summary.sessionId !== row.sessionId.toLowerCase() ||
        document.summary.oldInternId !== row.targetInternId.toLowerCase() ||
        document.summary.projectId !== row.projectId.toLowerCase() ||
        document.summary.roleCode !== row.roleCode ||
        document.adviceId.toLowerCase() !== row.adviceId.toLowerCase()
      )
        throw Error("Preview mismatch");
      return { row, document };
    } catch {
      throw replacementChanged();
    }
  }
  async get(sessionId: string, id: string, actorId: string) {
    await requireReplacementStaff(
      this.db,
      this.permissions,
      actorId,
      "approval",
    );
    await participationAccess(this.db, this.permissions, sessionId, actorId);
    const { row, document } = await this.loadCommand(this.db, sessionId, id);
    const jobs = await this.db.query(
      "SELECT j.status,COUNT(*) total FROM repository_access_jobs j JOIN participation_replacements r ON r.id=j.replacementId WHERE r.commandId=@0 GROUP BY j.status",
      [id],
    );
    return {
      id: row.id.toLowerCase(),
      previewHash: row.previewHash,
      expiresAt: row.expiresAt.toISOString(),
      status: row.effectiveStatus,
      document,
      result: row.resultJson
        ? replacementResultSchema.parse(JSON.parse(row.resultJson))
        : null,
      repositoryJobs: jobs,
    };
  }
  async ownHistory(actorId: string) {
    const rows: Array<{
      resultJson: string;
      sessionName: string;
      projectName: string;
    }> = await this.db.query(
      `SELECT TOP(50) c.resultJson,se.name sessionName,p.name projectName
      FROM participation_replacement_commands c JOIN internship_sessions se ON se.id=c.sessionId JOIN projects p ON p.id=c.projectId
      WHERE c.status='approved' AND (c.targetInternId=@0 OR c.candidateId=@0) ORDER BY c.approvedAt DESC,c.id`,
      [actorId],
    );
    return {
      items: rows.map((row) => ({
        result: replacementResultSchema.parse(JSON.parse(row.resultJson)),
        sessionName: row.sessionName,
        projectName: row.projectName,
      })),
      limit: 50,
    };
  }
}
