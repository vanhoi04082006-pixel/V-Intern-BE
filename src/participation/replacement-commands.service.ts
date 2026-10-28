import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { AuditLog } from "../audit/entities/audit-log.entity";
import { ActivityEvent } from "../audit/entities/activity-event.entity";
import {
  isDeadlockViolation,
  isUniqueViolation,
} from "../common/utils/db-errors";
import { notifyInTransaction } from "../common/utils/notify";
import { participationAccess } from "./participation-access";
import { requireReplacementStaff } from "./replacement-scope";
import {
  ReplacementPreviewService,
  replacementChanged,
} from "./replacement-preview.service";
import {
  replacementPreviewSchema,
  replacementResultSchema,
  ReplacementResult,
} from "./replacement-preview.policy";
import { planReplacementTasks } from "./replacement-plan";
import { ParticipationLedger } from "./participation-ledger.service";

@Injectable()
export class ReplacementCommandsService {
  constructor(
    private readonly db: DataSource,
    private readonly permissions: PermissionsService,
    private readonly preview: ReplacementPreviewService,
    private readonly ledger: ParticipationLedger,
  ) {}

  async approve(
    sessionId: string,
    commandId: string,
    actorId: string,
    input: { expectedPreviewHash: string; reason: string },
  ): Promise<ReplacementResult> {
    const reason = input.reason.trim();
    if (
      reason.length < 10 ||
      reason.length > 1000 ||
      !/^[a-f0-9]{64}$/.test(input.expectedPreviewHash)
    )
      throw new BadRequestException(
        "Cần mã bản xem trước hợp lệ và lý do từ 10 đến 1000 ký tự.",
      );
    await requireReplacementStaff(
      this.db,
      this.permissions,
      actorId,
      "approval",
    );
    await participationAccess(this.db, this.permissions, sessionId, actorId);
    try {
      return await this.db.transaction("SERIALIZABLE", (em) =>
        this.apply(
          em,
          sessionId,
          commandId,
          actorId,
          input.expectedPreviewHash,
          reason,
        ),
      );
    } catch (e) {
      if (isDeadlockViolation(e) || isUniqueViolation(e))
        throw replacementChanged();
      throw e;
    }
  }

  private async apply(
    em: EntityManager,
    sessionId: string,
    commandId: string,
    actorId: string,
    expectedHash: string,
    reason: string,
  ): Promise<ReplacementResult> {
    // Same session-first order as assignments, participation and submission writers.
    await em.query(
      "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
      [sessionId],
    );
    await requireReplacementStaff(em, this.permissions, actorId, "approval");
    await participationAccess(em, this.permissions, sessionId, actorId);
    const { row, document } = await this.preview.loadCommand(
      em,
      sessionId,
      commandId,
      true,
    );
    if (row.previewHash !== expectedHash) throw replacementChanged();
    // Return the stored receipt before checking the now-cancelled old assignment.
    if (row.status === "approved") {
      const result = replacementResultSchema.parse(JSON.parse(row.resultJson!));
      if (
        result.commandId !== row.id.toLowerCase() ||
        result.sessionId !== sessionId.toLowerCase()
      )
        throw replacementChanged();
      return result;
    }
    if (row.effectiveStatus === "expired")
      throw new ConflictException({
        code: "REPLACEMENT_PREVIEW_EXPIRED",
        message:
          "Bản xem trước đã hết hạn. Hãy tạo lại và kiểm tra ảnh hưởng trước khi duyệt.",
      });
    await em.query(
      "SELECT id FROM assignments WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
      [row.oldAssignmentId],
    );
    // User before project avoids inversions with AssignmentsService.create.
    for (const userId of [row.targetInternId, row.candidateId].sort())
      await em.query(
        "SELECT id FROM users WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [userId],
      );
    await em.query(
      "SELECT id FROM projects WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
      [row.projectId],
    );
    await em.query(
      "SELECT t.id FROM tasks t WITH(UPDLOCK,HOLDLOCK) JOIN participation_incidents i ON i.taskId=t.id WHERE i.id=@0",
      [row.incidentId],
    );
    const current = await this.preview.inspect(
      em,
      sessionId,
      row.incidentId,
      actorId,
      row.candidateId,
      true,
    );
    if (
      current.now > row.expiresAt ||
      new Date(document.preparedAt) > current.now ||
      current.sourceFingerprint !== document.sourceFingerprint
    )
      throw replacementChanged();
    await this.preview.validateAdvice(
      em,
      sessionId,
      row.incidentId,
      row.adviceId,
      row.candidateId,
      current.summary,
      current.context,
    );
    const plan = replacementPreviewSchema.shape.taskPlan.parse(
      planReplacementTasks(
        current.tasks,
        new Date(document.preparedAt),
        document.handoverHours,
      ),
    );
    if (JSON.stringify(plan) !== JSON.stringify(document.taskPlan))
      throw replacementChanged();
    const replacementId = randomUUID(),
      newAssignmentId = randomUUID(),
      approvedAt = current.now.toISOString();
    await em.query(
      "UPDATE assignments SET status='cancelled',updatedAt=SYSUTCDATETIME() WHERE id=@0 AND status='active'",
      [row.oldAssignmentId],
    );
    await em.query(
      "INSERT INTO assignments(id,internId,projectId,sessionId,status,assignedById,assignedAt) VALUES(@0,@1,@2,@3,'active',@4,@5)",
      [
        newAssignmentId,
        row.candidateId,
        row.projectId,
        sessionId,
        actorId,
        approvedAt,
      ],
    );
    // Historical project membership remains available to old evidence readers.
    await em.query(
      "IF EXISTS(SELECT 1 FROM project_members WHERE projectId=@0 AND userId=@1) UPDATE project_members SET roleInProject=@2 WHERE projectId=@0 AND userId=@1 ELSE INSERT INTO project_members(projectId,userId,roleInProject) VALUES(@0,@1,@2)",
      [row.projectId, row.candidateId, row.roleCode],
    );
    await em.query(
      "DELETE FROM session_members WHERE sessionId=@0 AND userId=@1",
      [sessionId, row.targetInternId],
    );
    await em.query(
      "IF NOT EXISTS(SELECT 1 FROM session_members WHERE sessionId=@0 AND userId=@1) INSERT INTO session_members(sessionId,userId) VALUES(@0,@1)",
      [sessionId, row.candidateId],
    );
    for (const task of plan.transfers) {
      const changed: Array<{ id: string }> = await em.query(
        "UPDATE tasks SET assigneeId=@1,dueDate=@2,version=version+1,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@0 AND version=@3 AND assigneeId=@4 AND deletedAt IS NULL",
        [
          task.id,
          row.candidateId,
          task.handoverDueAt,
          task.version,
          row.targetInternId,
        ],
      );
      if (changed.length !== 1) throw replacementChanged();
      const detail = {
        replacementId,
        oldInternId: row.targetInternId,
        newInternId: row.candidateId,
        oldDueAt: task.dueAt,
        newDueAt: task.handoverDueAt,
        oldVersion: task.version,
        newVersion: task.version + 1,
        reason,
      };
      await em.insert(AuditLog, {
        actorId,
        action: "task.reassigned",
        targetType: "task",
        targetId: task.id,
        detail: JSON.stringify(detail),
      });
      await this.ledger.event(em, {
        sessionId,
        internId: row.targetInternId,
        taskId: task.id,
        incidentId: row.incidentId,
        actorId,
        action: "replacement.task_transferred",
        detail,
      });
    }
    const result = replacementResultSchema.parse({
      schemaVersion: 1,
      replacementId,
      commandId: row.id.toLowerCase(),
      sessionId: sessionId.toLowerCase(),
      oldAssignmentId: row.oldAssignmentId.toLowerCase(),
      newAssignmentId: newAssignmentId.toLowerCase(),
      oldInternId: row.targetInternId.toLowerCase(),
      newInternId: row.candidateId.toLowerCase(),
      transferredTaskIds: plan.transfers.map((t) => t.id),
      preservedTaskCount: plan.preservedCount,
      approvedById: actorId.toLowerCase(),
      approvedAt,
      reason,
      repositoryAccessQueued: true,
    });
    await em.query(
      "INSERT INTO participation_replacements(id,commandId,sessionId,oldAssignmentId,newAssignmentId,oldInternId,newInternId,reason,approvedById,movementJson) VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8,@9)",
      [
        replacementId,
        row.id,
        sessionId,
        row.oldAssignmentId,
        newAssignmentId,
        row.targetInternId,
        row.candidateId,
        reason,
        actorId,
        JSON.stringify(plan),
      ],
    );
    for (const userId of [row.targetInternId, row.candidateId])
      await em.query(
        "INSERT INTO repository_access_jobs(id,replacementId,sessionId,userId) VALUES(@0,@1,@2,@3)",
        [randomUUID(), replacementId, sessionId, userId],
      );
    await this.ledger.event(em, {
      sessionId,
      internId: row.targetInternId,
      incidentId: row.incidentId,
      actorId,
      action: "replacement.approved",
      detail: result,
    });
    await this.ledger.event(em, {
      sessionId,
      internId: row.candidateId,
      actorId,
      action: "replacement.joined",
      detail: result,
    });
    await em.insert(AuditLog, {
      actorId,
      action: "participation.replacement_approved",
      targetType: "replacement",
      targetId: replacementId,
      detail: JSON.stringify(result),
    });
    await em.insert(ActivityEvent, {
      actorId,
      module: "participation",
      action: "replacement.approved",
      targetType: "session",
      targetId: sessionId,
      summary:
        `Đã thay thành viên trong phiên ${document.summary.sessionName}`.slice(
          0,
          512,
        ),
    });
    await notifyInTransaction(em, [row.targetInternId], {
      category: "session",
      type: "participation.replaced",
      title: "Cập nhật phân công thực tập",
      body: `Giảng viên đã kết thúc phân công của bạn tại ${document.summary.projectName}. Lý do: ${reason}. Bài đã chấm và lịch sử được giữ nguyên.`,
      linkUrl: "/intern/participation",
    });
    await notifyInTransaction(em, [row.candidateId], {
      category: "session",
      type: "participation.replacement_joined",
      title: "Bạn được tiếp nhận vào phiên thực tập",
      body: `Bạn tham gia ${document.summary.projectName} tại ${document.summary.sessionName}. ${plan.transfers.length} nhiệm vụ đã được bàn giao; xem hạn cụ thể trong bảng công việc. Quyền GitHub đang chờ đối chiếu.`,
      linkUrl: "/intern/work",
    });
    await em.query(
      "UPDATE participation_replacement_commands SET status='approved',approvedById=@1,approvedAt=@2,resultJson=@3 WHERE id=@0",
      [row.id, actorId, approvedAt, JSON.stringify(result)],
    );
    return result;
  }
}
