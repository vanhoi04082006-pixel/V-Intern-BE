import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { AuditLog } from "../audit/entities/audit-log.entity";
import { notifyInTransaction } from "../common/utils/notify";
export interface RepositoryAccessJob {
  id: string;
  sessionId: string;
  userId: string;
  replacementId: string;
  leaseToken: string;
  attempts: number;
  errorCode: string | null;
}
export interface GrantObservation {
  ids: string[];
  state: "revoked" | "review";
}
@Injectable()
export class RepositoryAccessQueue {
  constructor(private readonly db: DataSource) {}
  async claim(
    sessionId: string | null = null,
  ): Promise<RepositoryAccessJob | null> {
    const [candidate]: Array<{ id: string; sessionId: string }> =
      await this.db.query(
        `SELECT TOP(1) id,sessionId FROM repository_access_jobs
      WHERE (@0 IS NULL OR sessionId=@0) AND nextAttemptAt<=SYSUTCDATETIME() AND (status IN('pending','retry','waiting_user') OR (status='leased' AND leaseUntil<SYSUTCDATETIME())) ORDER BY nextAttemptAt,createdAt,id`,
        [sessionId],
      );
    if (!candidate) return null;
    return this.db.transaction(async (em) => {
      await em.query(
        "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [candidate.sessionId],
      );
      const [job]: RepositoryAccessJob[] = await em.query(
        `UPDATE repository_access_jobs WITH(UPDLOCK,HOLDLOCK) SET status='leased',leaseToken=@1,leaseUntil=DATEADD(minute,5,SYSUTCDATETIME()),attempts=attempts+1,updatedAt=SYSUTCDATETIME()
        OUTPUT INSERTED.* WHERE id=@0 AND nextAttemptAt<=SYSUTCDATETIME() AND (status IN('pending','retry','waiting_user') OR (status='leased' AND leaseUntil<SYSUTCDATETIME()))`,
        [candidate.id, randomUUID()],
      );
      return job ?? null;
    });
  }
  async memberLease(job: RepositoryAccessJob): Promise<boolean> {
    return this.db.transaction(async (em) => {
      await em.query(
        "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [job.sessionId],
      );
      const [owned] = await em.query(
        "SELECT id FROM repository_access_jobs WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND status='leased' AND leaseToken=@1 AND leaseUntil>DATEADD(second,30,SYSUTCDATETIME())",
        [job.id, job.leaseToken],
      );
      if (!owned) return false;
      const [member] = await em.query(
        "SELECT leaseToken,CASE WHEN leaseUntil>SYSUTCDATETIME() THEN 1 ELSE 0 END busy FROM session_repo_members WITH(UPDLOCK,HOLDLOCK) WHERE sessionId=@0 AND userId=@1",
        [job.sessionId, job.userId],
      );
      if (member?.busy && member.leaseToken !== job.leaseToken) return false;
      if (!member)
        await em.query(
          "INSERT INTO session_repo_members(sessionId,userId,status) VALUES(@0,@1,'not_connected')",
          [job.sessionId, job.userId],
        );
      await em.query(
        "UPDATE session_repo_members SET leaseToken=@2,leaseUntil=DATEADD(minute,5,SYSUTCDATETIME()) WHERE sessionId=@0 AND userId=@1",
        [job.sessionId, job.userId, job.leaseToken],
      );
      return true;
    });
  }
  async stillOwned(job: RepositoryAccessJob) {
    const rows = await this.db.query(
      "SELECT j.id FROM repository_access_jobs j JOIN session_repo_members m ON m.sessionId=j.sessionId AND m.userId=j.userId WHERE j.id=@0 AND j.status='leased' AND j.leaseToken=@1 AND m.leaseToken=@1 AND j.leaseUntil>DATEADD(second,30,SYSUTCDATETIME()) AND m.leaseUntil>DATEADD(second,30,SYSUTCDATETIME())",
      [job.id, job.leaseToken],
    );
    return rows.length === 1;
  }
  async releaseMember(job: RepositoryAccessJob) {
    await this.db.query(
      "UPDATE session_repo_members SET leaseToken=NULL,leaseUntil=NULL WHERE sessionId=@0 AND userId=@1 AND leaseToken=@2",
      [job.sessionId, job.userId, job.leaseToken],
    );
  }
  async finish(
    job: RepositoryAccessJob,
    status: "done" | "retry" | "waiting_user" | "failed",
    code: string | null,
    effect: Record<string, unknown>,
    delaySeconds = 0,
    undoAttempt = false,
    observations: GrantObservation[] = [],
  ) {
    return this.db.transaction(async (em) => {
      await em.query(
        "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [job.sessionId],
      );
      const [owned]: Array<{ errorCode: string | null }> = await em.query(
        "SELECT errorCode FROM repository_access_jobs WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND status='leased' AND leaseToken=@1 AND leaseUntil>SYSUTCDATETIME()",
        [job.id, job.leaseToken],
      );
      if (!owned) return false;
      for (const observation of observations) {
        if (!observation.ids.length || observation.ids.length > 20)
          throw Error("GITHUB_ACCESS_OBSERVATION_INVALID");
        await em.query(
          `UPDATE github_repository_grants SET state=@0,errorCode=@1,lastObservedAt=SYSUTCDATETIME(),revokedAt=CASE WHEN @0='revoked' THEN SYSUTCDATETIME() ELSE revokedAt END WHERE state<>'revoked' AND id IN(${observation.ids.map((_, i) => "@" + (i + 2)).join(",")})`,
          [observation.state, code, ...observation.ids],
        );
      }
      await em.query(
        "UPDATE repository_access_jobs SET status=@2,errorCode=@3,effectJson=@4,attempts=attempts-@6,nextAttemptAt=DATEADD(second,@5,SYSUTCDATETIME()),leaseToken=NULL,leaseUntil=NULL,updatedAt=SYSUTCDATETIME() WHERE id=@0 AND leaseToken=@1",
        [
          job.id,
          job.leaseToken,
          status,
          code,
          JSON.stringify(effect),
          delaySeconds,
          undoAttempt ? 1 : 0,
        ],
      );
      await em.insert(AuditLog, {
        actorId: null,
        action: "github.repository_access." + status,
        targetType: "repository_access_job",
        targetId: job.id,
        detail: JSON.stringify({
          replacementId: job.replacementId,
          sessionId: job.sessionId,
          userId: job.userId,
          code,
          effect,
        }),
      });
      if (
        code &&
        owned.errorCode !== code &&
        (status === "waiting_user" || status === "failed")
      ) {
        const staff: Array<{ userId: string | null }> = await em.query(
          "SELECT leadInstructorId userId FROM internship_sessions WHERE id=@0 UNION SELECT userId FROM github_repository_account WHERE id=1",
          [job.sessionId],
        );
        const message = effect.reviewRequired
          ? "Quyền GitHub cần Admin đối chiếu thủ công; hệ thống đã giữ nguyên quyền chưa chứng minh được nguồn gốc."
          : "Đối chiếu quyền GitHub đang cần kiểm tra kết nối hoặc cấu hình. Mở trạng thái để xử lý rồi đối chiếu lại.";
        await notifyInTransaction(
          em,
          staff.map((s) => s.userId).filter((id): id is string => Boolean(id)),
          {
            category: "session",
            type: "github.repository_access_attention",
            title: "Cần xử lý quyền repository sau bàn giao",
            body: message,
            linkUrl: `/instructor/participation?sessionId=${job.sessionId}`,
          },
        );
      }
      return true;
    });
  }
}
