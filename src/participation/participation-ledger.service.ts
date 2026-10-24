import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource, EntityManager } from "typeorm";
import { notifyInTransaction } from "../common/utils/notify";
import {
  assessLateness,
  incidentConsequence,
  ParticipationPolicy,
} from "./participation-policy";

interface TaskContext {
  id: string;
  code: string;
  status: string;
  assigneeId: string;
  dueDate: Date | null;
  sessionId: string;
  leadInstructorId: string | null;
}
export interface ParticipationIncident {
  id: string;
  taskId: string;
  internId: string;
  sessionId: string;
  status: "active" | "excused" | "reversed";
  kind: string;
  dueAt: Date;
  submittedAt: Date | null;
  deadlineVersion: number;
  policyVersion: number;
  ordinal: number;
  points: number;
  recommendReplacement: boolean;
}
interface Deadline {
  version: number;
  baseDueAt: Date | null;
  extensionAt: Date | null;
  effectiveDueAt: Date | null;
}
const sameTime = (a: Date | null, b: Date | null) =>
  a?.getTime() === b?.getTime();
@Injectable()
export class ParticipationLedger {
  constructor(private readonly db: DataSource) {}
  /** All new participation/replacement writers lock session before task/submission. */
  async lockScope(
    em: EntityManager,
    taskId: string,
  ): Promise<TaskContext | null> {
    const [context]: TaskContext[] = await em.query(
      `SELECT t.id,t.code,t.status,t.assigneeId,t.dueDate,s.sessionId,se.leadInstructorId
      FROM tasks t JOIN sprints s ON s.id=t.sprintId JOIN internship_sessions se ON se.id=s.sessionId
      WHERE t.id=@0 AND t.deletedAt IS NULL AND se.status='active' AND t.assigneeId IS NOT NULL
      AND EXISTS(SELECT 1 FROM assignments a WHERE a.sessionId=s.sessionId AND a.projectId=t.projectId AND a.internId=t.assigneeId AND a.status='active')`,
      [taskId],
    );
    if (!context) return null;
    await em.query(
      "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
      [context.sessionId],
    );
    return context;
  }
  syncTask(taskId: string) {
    return this.db.transaction((em) => this.synchronize(em, taskId));
  }
  async event(
    em: EntityManager,
    input: {
      sessionId: string;
      internId?: string;
      taskId?: string;
      incidentId?: string;
      actorId?: string | null;
      action: string;
      detail: unknown;
    },
  ) {
    await em.query(
      "INSERT INTO participation_events(id,sessionId,internId,taskId,incidentId,actorId,action,detail) VALUES(@0,@1,@2,@3,@4,@5,@6,@7)",
      [
        randomUUID(),
        input.sessionId,
        input.internId ?? null,
        input.taskId ?? null,
        input.incidentId ?? null,
        input.actorId ?? null,
        input.action,
        JSON.stringify(input.detail),
      ],
    );
  }
  async synchronize(
    em: EntityManager,
    taskId: string,
  ): Promise<ParticipationIncident | null> {
    const scope = await this.lockScope(em, taskId);
    if (!scope) return null;
    const [policy]: Array<
      ParticipationPolicy & { version: number; activeFrom: Date }
    > = await em.query(
      "SELECT * FROM participation_policies WITH(HOLDLOCK) WHERE sessionId=@0",
      [scope.sessionId],
    );
    if (!policy) return null;
    const [task]: TaskContext[] = await em.query(
      "SELECT id,code,status,assigneeId,dueDate FROM tasks WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND deletedAt IS NULL",
      [taskId],
    );
    if (
      !task ||
      task.assigneeId?.toLowerCase() !== scope.assigneeId.toLowerCase()
    )
      return null;
    const [{ utcNow }]: Array<{ utcNow: Date }> = await em.query(
      "SELECT SYSUTCDATETIME() utcNow",
    );
    const [old]: ParticipationIncident[] = await em.query(
      "SELECT * FROM participation_incidents WITH(UPDLOCK,HOLDLOCK) WHERE taskId=@0 AND internId=@1",
      [taskId, task.assigneeId],
    );
    if (old?.status === "excused") return old;
    if (!old && task.status === "done") return null;
    let [deadline]: Deadline[] = await em.query(
      "SELECT * FROM participation_deadlines WITH(UPDLOCK,HOLDLOCK) WHERE taskId=@0 AND internId=@1",
      [taskId, task.assigneeId],
    );
    if (!deadline) {
      await em.query(
        "INSERT INTO participation_deadlines(taskId,internId,sessionId,baseDueAt,effectiveDueAt) VALUES(@0,@1,@2,@3,@3)",
        [
          taskId,
          task.assigneeId,
          scope.sessionId,
          task.dueDate?.toISOString() ?? null,
        ],
      );
      deadline = {
        version: 1,
        baseDueAt: task.dueDate,
        extensionAt: null,
        effectiveDueAt: task.dueDate,
      };
    } else if (!sameTime(deadline.baseDueAt, task.dueDate)) {
      const effective =
        deadline.extensionAt &&
        (!task.dueDate || deadline.extensionAt > task.dueDate)
          ? deadline.extensionAt
          : task.dueDate;
      deadline = {
        ...deadline,
        version: deadline.version + 1,
        baseDueAt: task.dueDate,
        effectiveDueAt: effective,
      };
      await em.query(
        "UPDATE participation_deadlines SET version=@2,baseDueAt=@3,effectiveDueAt=@4,updatedAt=SYSUTCDATETIME() WHERE taskId=@0 AND internId=@1",
        [
          taskId,
          task.assigneeId,
          deadline.version,
          task.dueDate?.toISOString() ?? null,
          effective?.toISOString() ?? null,
        ],
      );
      await this.event(em, {
        sessionId: scope.sessionId,
        internId: task.assigneeId,
        taskId,
        action: "deadline.source_changed",
        detail: { version: deadline.version, dueAt: effective },
      });
    }
    const [submission]: Array<{ id: string; submittedAt: Date }> =
      await em.query(
        "SELECT TOP(1) id,submittedAt FROM task_submissions WHERE taskId=@0 AND internId=@1 ORDER BY submittedAt,id",
        [taskId, task.assigneeId],
      );
    const outcome = assessLateness(
      deadline.effectiveDueAt,
      submission?.submittedAt ?? null,
      utcNow,
    );
    if (
      !["late", "missing"].includes(outcome) ||
      !deadline.effectiveDueAt ||
      (!old && deadline.effectiveDueAt < policy.activeFrom)
    ) {
      if (old?.status === "active")
        await this.reverse(
          em,
          old,
          "reversed",
          "Hạn hiệu lực mới không còn xác định bài nộp trễ.",
          null,
        );
      return null;
    }
    if (old?.status === "active") {
      await em.query(
        "UPDATE participation_incidents SET kind=@1,firstSubmissionId=@2,submittedAt=@3,deadlineVersion=@4,dueAt=@5,updatedAt=SYSUTCDATETIME() WHERE id=@0",
        [
          old.id,
          outcome,
          submission?.id ?? null,
          submission?.submittedAt.toISOString() ?? null,
          deadline.version,
          deadline.effectiveDueAt.toISOString(),
        ],
      );
      return {
        ...old,
        kind: outcome,
        deadlineVersion: deadline.version,
        dueAt: deadline.effectiveDueAt,
        submittedAt: submission?.submittedAt ?? null,
      };
    }
    const [{ count }]: Array<{ count: number }> = await em.query(
      "SELECT COUNT(*) count FROM participation_incidents WHERE sessionId=@0 AND internId=@1 AND status='active'",
      [scope.sessionId, task.assigneeId],
    );
    const [{ charged }]: Array<{ charged: number }> = await em.query(
      "SELECT COALESCE(SUM(p.points),0) charged FROM participation_penalties p JOIN participation_incidents i ON i.id=p.incidentId WHERE i.sessionId=@0 AND i.internId=@1",
      [scope.sessionId, task.assigneeId],
    );
    const ordinal = count + 1,
      consequence = incidentConsequence(ordinal, policy, Number(charged)),
      id = old?.id ?? randomUUID();
    if (old)
      await em.query(
        "UPDATE participation_incidents SET status='active',kind=@1,deadlineVersion=@2,policyVersion=@3,dueAt=@4,firstSubmissionId=@5,submittedAt=@6,ordinal=@7,points=@8,recommendReplacement=@9,policySnapshot=@10,reason=NULL,handledBy=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0",
        [
          id,
          outcome,
          deadline.version,
          policy.version,
          deadline.effectiveDueAt.toISOString(),
          submission?.id ?? null,
          submission?.submittedAt.toISOString() ?? null,
          ordinal,
          consequence.points,
          consequence.recommendReplacement ? 1 : 0,
          JSON.stringify(policy),
        ],
      );
    else
      await em.query(
        `INSERT INTO participation_incidents(id,taskId,internId,sessionId,deadlineVersion,policyVersion,dueAt,firstSubmissionId,submittedAt,kind,status,ordinal,points,recommendReplacement,policySnapshot)
      VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8,@9,'active',@10,@11,@12,@13)`,
        [
          id,
          taskId,
          task.assigneeId,
          scope.sessionId,
          deadline.version,
          policy.version,
          deadline.effectiveDueAt.toISOString(),
          submission?.id ?? null,
          submission?.submittedAt.toISOString() ?? null,
          outcome,
          ordinal,
          consequence.points,
          consequence.recommendReplacement ? 1 : 0,
          JSON.stringify(policy),
        ],
      );
    if (consequence.points > 0)
      await this.penalty(
        em,
        id,
        consequence.points,
        "deduction",
        `Nộp trễ lần ${ordinal}, policy v${policy.version}`,
        null,
      );
    await this.event(em, {
      sessionId: scope.sessionId,
      internId: task.assigneeId,
      taskId,
      incidentId: id,
      action: old ? "incident.reopened" : "incident.created",
      detail: {
        ordinal,
        outcome,
        ...consequence,
        deadlineVersion: deadline.version,
        policyVersion: policy.version,
      },
    });
    if (consequence.warn)
      await notifyInTransaction(em, [task.assigneeId], {
        category: "task",
        type: "participation.late",
        title: `Cần chú ý thời hạn · ${task.code}`,
        body: `Vi phạm thời hạn lần ${ordinal}. Điểm phạt ghi nhận: ${consequence.points}/100; chỉ áp dụng khi giảng viên chấm bài chưa chốt. Mở bằng chứng hoặc liên hệ giảng viên để được xem xét.`,
        linkUrl: "/intern/participation",
      });
    if (consequence.recommendReplacement && scope.leadInstructorId)
      await notifyInTransaction(em, [scope.leadInstructorId], {
        category: "session",
        type: "participation.replacement_suggested",
        title: "Cần xem xét hỗ trợ hoặc thay thành viên",
        body: "Một thành viên đạt ngưỡng vi phạm. Xem bằng chứng và đề xuất; hệ thống không tự loại sinh viên.",
        linkUrl: `/instructor/participation?session=${scope.sessionId}`,
      });
    return (
      await em.query("SELECT * FROM participation_incidents WHERE id=@0", [id])
    )[0];
  }
  private async penalty(
    em: EntityManager,
    incidentId: string,
    points: number,
    kind: string,
    reason: string,
    actorId: string | null,
  ) {
    const [{ version }]: Array<{ version: number }> = await em.query(
      "SELECT COALESCE(MAX(version),0)+1 version FROM participation_penalties WITH(UPDLOCK,HOLDLOCK) WHERE incidentId=@0",
      [incidentId],
    );
    await em.query(
      "INSERT INTO participation_penalties(id,incidentId,version,points,kind,reason,actorId) VALUES(@0,@1,@2,@3,@4,@5,@6)",
      [randomUUID(), incidentId, version, points, kind, reason, actorId],
    );
  }
  async reverse(
    em: EntityManager,
    incident: ParticipationIncident,
    status: "excused" | "reversed",
    reason: string,
    actorId: string | null,
  ) {
    if (incident.status !== "active") return;
    const [{ net }]: Array<{ net: number }> = await em.query(
      "SELECT COALESCE(SUM(points),0) net FROM participation_penalties WHERE incidentId=@0",
      [incident.id],
    );
    if (Number(net) > 0)
      await this.penalty(
        em,
        incident.id,
        -Number(net),
        "reversal",
        reason,
        actorId,
      );
    await em.query(
      "UPDATE participation_incidents SET status=@1,points=0,reason=@2,handledBy=@3,updatedAt=SYSUTCDATETIME() WHERE id=@0",
      [incident.id, status, reason, actorId],
    );
    await this.event(em, {
      sessionId: incident.sessionId,
      internId: incident.internId,
      taskId: incident.taskId,
      incidentId: incident.id,
      actorId,
      action: `incident.${status}`,
      detail: {
        reason,
        reversedPoints: Number(net),
        finalizedScoresPreserved: true,
      },
    });
  }
}
