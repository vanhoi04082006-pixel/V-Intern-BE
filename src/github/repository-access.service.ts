import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { DataSource } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { AuditLog } from "../audit/entities/audit-log.entity";
import { participationAccess } from "../participation/participation-access";
import { requireReplacementStaff } from "../participation/replacement-scope";
interface Revision {
  revisionTime: string;
  status: string;
  attempts: number;
  leaseToken: string | null;
  errorCode: string | null;
}
const revision = (row: Revision) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        row.revisionTime,
        row.status,
        row.attempts,
        row.leaseToken,
        row.errorCode,
      ]),
    )
    .digest("hex");
@Injectable()
export class RepositoryAccessService {
  constructor(
    private readonly db: DataSource,
    private readonly permissions: PermissionsService,
  ) {}
  private async access(sessionId: string, actorId: string) {
    await requireReplacementStaff(
      this.db,
      this.permissions,
      actorId,
      "approval",
    );
    await participationAccess(this.db, this.permissions, sessionId, actorId);
  }
  async report(sessionId: string, actorId: string) {
    await this.access(sessionId, actorId);
    return this.read(sessionId, null);
  }
  own(actorId: string) {
    return this.read(null, actorId);
  }
  private async read(sessionId: string | null, userId: string | null) {
    const where =
      "(@0 IS NULL OR j.sessionId=@0) AND (@1 IS NULL OR j.userId=@1)";
    const rows: Array<
      Revision & {
        id: string;
        sessionId: string;
        displayName: string;
        sessionName: string;
        projectName: string;
        role: "departing" | "joining";
        outcome: string | null;
        ownerLogin: string | null;
        repoName: string | null;
        updatedAt: Date;
        nextAttemptAt: Date;
      }
    > = await this.db.query(
      `SELECT TOP(50) j.id,j.sessionId,j.status,j.errorCode,j.attempts,j.leaseToken,j.updatedAt,j.nextAttemptAt,CONVERT(varchar(33),j.updatedAt,126) revisionTime,
      u.displayName,se.name sessionName,p.name projectName,CASE WHEN j.userId=r.oldInternId THEN 'departing' ELSE 'joining' END role,
      JSON_VALUE(j.effectJson,'$.kind') outcome,sr.ownerLogin,sr.repoName
      FROM repository_access_jobs j JOIN participation_replacements r ON r.id=j.replacementId JOIN assignments a ON a.id=r.newAssignmentId
      JOIN users u ON u.id=j.userId JOIN internship_sessions se ON se.id=j.sessionId JOIN projects p ON p.id=a.projectId
      LEFT JOIN session_repositories sr ON sr.sessionId=j.sessionId WHERE ${where} ORDER BY j.updatedAt DESC,j.id`,
      [sessionId, userId],
    );
    const summary: Array<{ status: string; total: number }> =
      await this.db.query(
        `SELECT CASE WHEN j.errorCode='GITHUB_ACCESS_REVIEW_REQUIRED' THEN 'review_required' ELSE j.status END status,COUNT(*) total FROM repository_access_jobs j WHERE ${where} GROUP BY CASE WHEN j.errorCode='GITHUB_ACCESS_REVIEW_REQUIRED' THEN 'review_required' ELSE j.status END`,
        [sessionId, userId],
      );
    return {
      items: rows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        status: row.status,
        displayStatus:
          row.errorCode === "GITHUB_ACCESS_REVIEW_REQUIRED"
            ? "review_required"
            : row.status,
        errorCode: row.errorCode,
        attempts: row.attempts,
        updatedAt: row.updatedAt.toISOString(),
        nextAttemptAt: row.nextAttemptAt.toISOString(),
        revision: revision(row),
        displayName: row.displayName,
        sessionName: row.sessionName,
        projectName: row.projectName,
        role: row.role,
        outcome: row.outcome,
        repositoryUrl:
          row.ownerLogin && row.repoName
            ? `https://github.com/${encodeURIComponent(row.ownerLogin)}/${encodeURIComponent(row.repoName)}`
            : null,
        retryAllowed: ["retry", "waiting_user", "failed"].includes(row.status),
      })),
      summary,
      limit: 50,
    };
  }
  async retry(
    sessionId: string,
    id: string,
    actorId: string,
    input: { expectedRevision: string; reason: string },
  ) {
    await this.access(sessionId, actorId);
    const reason = input.reason.trim();
    if (reason.length < 10 || reason.length > 1000)
      throw new ConflictException("Cần lý do từ 10 đến 1000 ký tự.");
    return this.db.transaction(async (em) => {
      await em.query(
        "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [sessionId],
      );
      await requireReplacementStaff(em, this.permissions, actorId, "approval");
      await participationAccess(em, this.permissions, sessionId, actorId);
      const [job]: Array<Revision> = await em.query(
        "SELECT j.status,j.errorCode,j.attempts,j.leaseToken,CONVERT(varchar(33),j.updatedAt,126) revisionTime FROM repository_access_jobs j WITH(UPDLOCK,HOLDLOCK) WHERE j.id=@0 AND j.sessionId=@1",
        [id, sessionId],
      );
      if (!job)
        throw new NotFoundException(
          "Không tìm thấy lượt đối chiếu trong phiên.",
        );
      if (
        revision(job) !== input.expectedRevision ||
        !["retry", "waiting_user", "failed"].includes(job.status)
      )
        throw new ConflictException({
          code: "GITHUB_ACCESS_CHANGED",
          message:
            "Trạng thái đối chiếu đã thay đổi. Tải lại trước khi yêu cầu thử lại.",
        });
      await em.query(
        "UPDATE repository_access_jobs SET status='pending',attempts=0,leaseToken=NULL,leaseUntil=NULL,errorCode=NULL,nextAttemptAt=SYSUTCDATETIME(),updatedAt=SYSUTCDATETIME() WHERE id=@0",
        [id],
      );
      await em.insert(AuditLog, {
        actorId,
        action: "github.repository_access.retry_requested",
        targetType: "repository_access_job",
        targetId: id,
        detail: JSON.stringify({
          sessionId,
          reason,
          previousStatus: job.status,
          previousAttempts: job.attempts,
          previousErrorCode: job.errorCode,
        }),
      });
      return { queued: true };
    });
  }
}
