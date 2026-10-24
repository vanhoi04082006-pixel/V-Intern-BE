import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { notifyInTransaction } from "../common/utils/notify";
import { participationAccess } from "./participation-access";
import {
  DEFAULT_PARTICIPATION_POLICY,
  ParticipationPolicy,
  validateParticipationPolicy,
} from "./participation-policy";
import {
  ParticipationIncident,
  ParticipationLedger,
} from "./participation-ledger.service";
import {
  ParticipationExtensionDto,
  ParticipationPolicyDto,
  ParticipationResolveDto,
} from "./participation.dto";

const changed = () =>
  new ConflictException({
    code: "PARTICIPATION_VERSION_CONFLICT",
    message:
      "Bằng chứng hoặc chính sách đã thay đổi. Tải lại trước khi xác nhận.",
  });
const reason = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length < 10 || trimmed.length > 1000)
    throw new BadRequestException("Ghi lý do cụ thể, từ 10 đến 1000 ký tự.");
  return trimmed;
};
@Injectable()
export class ParticipationService {
  constructor(
    private readonly db: DataSource,
    private readonly permissions: PermissionsService,
    private readonly ledger: ParticipationLedger,
  ) {}
  private async policy(sessionId: string) {
    const [row] = await this.db.query(
      "SELECT * FROM participation_policies WHERE sessionId=@0",
      [sessionId],
    );
    return row
      ? { ...row, configured: true }
      : {
          ...DEFAULT_PARTICIPATION_POLICY,
          configured: false,
          version: 0,
          activeFrom: null,
        };
  }
  async report(sessionId: string, actorId: string, page = 1, pageSize = 20) {
    await participationAccess(this.db, this.permissions, sessionId, actorId);
    const result = await this.read(sessionId, null, page, pageSize);
    return { ...result, policy: await this.policy(sessionId) };
  }
  own(actorId: string, page = 1, pageSize = 20) {
    return this.read(null, actorId, page, pageSize);
  }
  private async read(
    sessionId: string | null,
    actorId: string | null,
    page: number,
    pageSize: number,
  ) {
    const where =
      "(@0 IS NULL OR i.sessionId=@0) AND (@1 IS NULL OR i.internId=@1)";
    const [summary] = await this.db.query(
      `SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN i.status='active' THEN 1 ELSE 0 END),0) active,
      COALESCE(SUM(CASE WHEN i.status='active' THEN i.points ELSE 0 END),0) registeredPenalty
      FROM participation_incidents i WHERE ${where}`,
      [sessionId, actorId],
    );
    const items = await this.db.query(
      `SELECT i.id,i.taskId,i.internId,i.sessionId,i.deadlineVersion,i.policyVersion,i.dueAt,i.submittedAt,i.kind,i.status,i.ordinal,i.points,i.recommendReplacement,i.createdAt,i.reason,
      t.code taskCode,t.title taskTitle,u.displayName,se.name sessionName,
      reviewed.baseScore,reviewed.latePenalty,reviewed.score,reviewed.status submissionStatus
      FROM participation_incidents i JOIN tasks t ON t.id=i.taskId JOIN users u ON u.id=i.internId JOIN internship_sessions se ON se.id=i.sessionId
      OUTER APPLY(SELECT TOP(1) s.baseScore,s.latePenalty,s.score,s.status FROM task_submissions s WHERE s.taskId=i.taskId AND s.internId=i.internId AND s.reviewedAt IS NOT NULL ORDER BY s.reviewedAt DESC,s.id) reviewed
      WHERE ${where} ORDER BY i.createdAt DESC,i.id OFFSET @2 ROWS FETCH NEXT @3 ROWS ONLY`,
      [sessionId, actorId, (page - 1) * pageSize, pageSize],
    );
    return { items, summary, page, pageSize };
  }
  async savePolicy(
    sessionId: string,
    actorId: string,
    input: ParticipationPolicyDto,
  ) {
    await participationAccess(this.db, this.permissions, sessionId, actorId);
    const explanation = reason(input.reason);
    try {
      validateParticipationPolicy(input);
    } catch {
      throw new BadRequestException(
        "Ngưỡng phải theo thứ tự cảnh báo ≤ trừ điểm ≤ đề xuất thay; điểm và cap từ 0 đến 100.",
      );
    }
    await this.db.transaction(async (em) => {
      await em.query(
        "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [sessionId],
      );
      await participationAccess(em, this.permissions, sessionId, actorId);
      const [prior]: Array<ParticipationPolicy & { version: number }> =
        await em.query(
          "SELECT * FROM participation_policies WITH(UPDLOCK,HOLDLOCK) WHERE sessionId=@0",
          [sessionId],
        );
      if ((prior?.version ?? 0) !== input.expectedVersion) throw changed();
      const params = [
        sessionId,
        input.warningFrom,
        input.penaltyFrom,
        input.replacementFrom,
        input.penaltyPoints,
        input.penaltyCap,
        actorId,
      ];
      if (prior)
        await em.query(
          "UPDATE participation_policies SET version=version+1,warningFrom=@1,penaltyFrom=@2,replacementFrom=@3,penaltyPoints=@4,penaltyCap=@5,updatedBy=@6,updatedAt=SYSUTCDATETIME() WHERE sessionId=@0",
          params,
        );
      else
        await em.query(
          "INSERT INTO participation_policies(sessionId,warningFrom,penaltyFrom,replacementFrom,penaltyPoints,penaltyCap,updatedBy) VALUES(@0,@1,@2,@3,@4,@5,@6)",
          params,
        );
      await this.ledger.event(em, {
        sessionId,
        actorId,
        action: "policy.updated",
        detail: {
          reason: explanation,
          previous: prior ?? null,
          next: { ...input, reason: explanation },
        },
      });
      const members: Array<{ userId: string }> = await em.query(
        "SELECT userId FROM session_members WHERE sessionId=@0 UNION SELECT internId FROM assignments WHERE sessionId=@0 AND status='active'",
        [sessionId],
      );
      await notifyInTransaction(
        em,
        members.map((m) => m.userId),
        {
          category: "session",
          type: "participation.policy_updated",
          title: "Chính sách thời hạn của phiên đã cập nhật",
          body: `Cảnh báo từ lần ${input.warningFrom}; xét trừ ${input.penaltyPoints ?? 0} điểm từ lần ${input.penaltyFrom}, cap ${input.penaltyCap} điểm; xem xét thay từ lần ${input.replacementFrom}. Incident cũ giữ mức đã ghi. ${explanation}`,
          linkUrl: "/intern/participation",
        },
      );
    });
    return this.policy(sessionId);
  }
  async resolve(
    sessionId: string,
    incidentId: string,
    actorId: string,
    input: ParticipationResolveDto,
  ) {
    await participationAccess(this.db, this.permissions, sessionId, actorId);
    const explanation = reason(input.reason);
    return this.db.transaction(async (em) => {
      await em.query(
        "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [sessionId],
      );
      const [incident]: ParticipationIncident[] = await em.query(
        "SELECT * FROM participation_incidents WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND sessionId=@1",
        [incidentId, sessionId],
      );
      await participationAccess(em, this.permissions, sessionId, actorId);
      if (!incident)
        throw new NotFoundException("Không tìm thấy bằng chứng của phiên.");
      if (
        incident.status !== "active" ||
        incident.deadlineVersion !== input.expectedDeadlineVersion
      )
        throw changed();
      await this.ledger.reverse(
        em,
        incident,
        input.action,
        explanation,
        actorId,
      );
      await notifyInTransaction(em, [incident.internId], {
        category: "task",
        type: "participation.resolved",
        title:
          input.action === "excused"
            ? "Đã được miễn trừ vi phạm thời hạn"
            : "Đã hoàn tác ghi nhận vi phạm",
        body: `${explanation} Điểm bài đã chốt giữ nguyên; phần hoàn tác được lưu riêng trong lịch sử.`,
        linkUrl: "/intern/participation",
      });
      return { resolved: true, finalizedScoresPreserved: true };
    });
  }
  async extend(
    sessionId: string,
    taskId: string,
    actorId: string,
    input: ParticipationExtensionDto,
  ) {
    await participationAccess(this.db, this.permissions, sessionId, actorId);
    const explanation = reason(input.reason),
      until = new Date(input.until);
    return this.db.transaction(async (em) => {
      const context = await this.ledger.lockScope(em, taskId);
      if (
        !context ||
        context.sessionId.toLowerCase() !== sessionId.toLowerCase()
      )
        throw new NotFoundException(
          "Nhiệm vụ không thuộc phiên đang hoạt động.",
        );
      await participationAccess(em, this.permissions, sessionId, actorId);
      const [{ utcNow }]: Array<{ utcNow: Date }> = await em.query(
        "SELECT SYSUTCDATETIME() utcNow",
      );
      const [prior]: Array<{ version: number; effectiveDueAt: Date | null }> =
        await em.query(
          "SELECT * FROM participation_deadlines WITH(UPDLOCK,HOLDLOCK) WHERE taskId=@0 AND internId=@1",
          [taskId, context.assigneeId],
        );
      if ((prior?.version ?? 0) !== input.expectedVersion) throw changed();
      const current = prior?.effectiveDueAt ?? context.dueDate;
      if (
        !current ||
        !Number.isFinite(until.getTime()) ||
        until <= utcNow ||
        until <= current
      )
        throw new BadRequestException(
          "Hạn gia hạn phải sau hạn hiện tại và sau thời gian máy chủ.",
        );
      if (prior)
        await em.query(
          "UPDATE participation_deadlines SET version=version+1,extensionAt=@2,effectiveDueAt=@2,reason=@3,updatedBy=@4,updatedAt=SYSUTCDATETIME() WHERE taskId=@0 AND internId=@1",
          [
            taskId,
            context.assigneeId,
            until.toISOString(),
            explanation,
            actorId,
          ],
        );
      else
        await em.query(
          "INSERT INTO participation_deadlines(taskId,internId,sessionId,baseDueAt,extensionAt,effectiveDueAt,reason,updatedBy) VALUES(@0,@1,@2,@3,@4,@4,@5,@6)",
          [
            taskId,
            context.assigneeId,
            sessionId,
            context.dueDate?.toISOString() ?? null,
            until.toISOString(),
            explanation,
            actorId,
          ],
        );
      await this.ledger.event(em, {
        sessionId,
        taskId,
        internId: context.assigneeId,
        actorId,
        action: "deadline.extended",
        detail: { reason: explanation, previous: current, until },
      });
      await this.ledger.synchronize(em, taskId);
      await notifyInTransaction(em, [context.assigneeId], {
        category: "task",
        type: "participation.extension",
        title: `Đã gia hạn · ${context.code}`,
        body: `Hạn mới: ${until.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} UTC+7. ${explanation}`,
        linkUrl: `/intern/work/${taskId}`,
      });
      return {
        extended: true,
        deadlineVersion: (prior?.version ?? 0) + 1,
        finalizedScoresPreserved: true,
      };
    });
  }
}
