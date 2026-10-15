import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { DataSource, EntityManager } from "typeorm";
import { AuditLog } from "../audit/entities/audit-log.entity";
import { notifyInTransaction } from '../common/utils/notify';
import { PermissionsService } from "../rbac/permissions.service";
import { DecideAccessDto, RequestAccessDto } from "./sharing.dto";
import { assertSharedRead } from "./sharing-policy";

export interface AccessRow {
  id: string;
  requesterId: string;
  ownerId: string;
  sessionId: string | null;
  reason: string;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class SharingService {
  constructor(
    private readonly db: DataSource,
    private readonly permissions: PermissionsService,
  ) {}

  private async instructor(userId: string): Promise<void> {
    if (!(await this.permissions.hasRole(userId, "instructor")))
      throw new ForbiddenException("Chỉ giảng viên sử dụng chức năng chia sẻ.");
  }

  private async event(
    em: EntityManager,
    actorId: string,
    id: string,
    recipient: string,
    action: string,
  ): Promise<void> {
    await em.insert(AuditLog, {
      actorId,
      action: `sharing.${action}`,
      targetType: "session_access_request",
      targetId: id,
      detail: JSON.stringify({ action }),
    });
    await notifyInTransaction(em, [recipient], {
      category: 'session',
      type: "session.sharing",
      title:
        action === "requested"
          ? "Yêu cầu xem dữ liệu phiên thực tập"
          : `Quyền xem phiên: ${action === "approved" ? "đã chấp nhận" : action === "denied" ? "đã từ chối" : "đã thu hồi"}`,
      body: "Mở Chia sẻ dữ liệu để xem chi tiết.",
      linkUrl: "/instructor/sharing",
    });
  }

  async list(actorId: string, page: number, pageSize: number) {
    await this.instructor(actorId);
    const params = [actorId, (page - 1) * pageSize, pageSize];
    const rows = await this.db.query(
      `SELECT a.*,r.displayName AS requesterName,o.displayName AS ownerName,s.name AS sessionName
      FROM session_access_requests a JOIN users r ON r.id=a.requesterId JOIN users o ON o.id=a.ownerId
      LEFT JOIN internship_sessions s ON s.id=a.sessionId
      WHERE a.requesterId=@0 OR a.ownerId=@0 ORDER BY a.createdAt DESC,a.id OFFSET @1 ROWS FETCH NEXT @2 ROWS ONLY`,
      params,
    );
    const total: Array<{ n: number }> = await this.db.query(
      "SELECT COUNT(*) n FROM session_access_requests WHERE requesterId=@0 OR ownerId=@0",
      [actorId],
    );
    return {
      data: rows,
      meta: {
        page,
        pageSize,
        total: total[0].n,
        totalPages: Math.ceil(total[0].n / pageSize),
      },
    };
  }

  async request(actorId: string, dto: RequestAccessDto) {
    await this.instructor(actorId);
    const owners: Array<{ id: string }> = await this.db.query(
      "SELECT id FROM users WHERE email=@0 AND status='active'",
      [dto.ownerEmail.trim().toLowerCase()],
    );
    const owner = owners[0];
    if (!owner || !(await this.permissions.hasRole(owner.id, "instructor")))
      throw new NotFoundException("Không tìm thấy giảng viên đang hoạt động.");
    if (owner.id.toLowerCase() === actorId.toLowerCase())
      throw new BadRequestException("Không thể xin quyền của chính mình.");
    return this.db.transaction(async (em) => {
      const lock: Array<{ result: number }> = await em.query(
        "DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@0,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; SELECT @r result",
        [`sharing:${actorId.toLowerCase()}:${owner.id.toLowerCase()}`],
      );
      if (lock[0].result < 0)
        throw new ConflictException("Yêu cầu đang được xử lý.");
      const existing: AccessRow[] = await em.query(
        "SELECT * FROM session_access_requests WHERE requesterId=@0 AND ownerId=@1 AND status='pending'",
        [actorId, owner.id],
      );
      if (existing.length) return existing[0];
      const id = randomUUID();
      await em.query(
        "INSERT INTO session_access_requests(id,requesterId,ownerId,reason) VALUES(@0,@1,@2,@3)",
        [id, actorId, owner.id, dto.reason.trim()],
      );
      await this.event(em, actorId, id, owner.id, "requested");
      return (
        await em.query("SELECT * FROM session_access_requests WHERE id=@0", [
          id,
        ])
      )[0] as AccessRow;
    });
  }

  async decide(actorId: string, id: string, dto: DecideAccessDto) {
    await this.instructor(actorId);
    return this.db.transaction(async (em) => {
      const rows: AccessRow[] = await em.query(
        "SELECT * FROM session_access_requests WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
        [id],
      );
      const request = rows[0];
      if (!request || request.ownerId.toLowerCase() !== actorId.toLowerCase())
        throw new NotFoundException(
          "Không tìm thấy yêu cầu thuộc quyền của bạn.",
        );
      if (dto.decision === "revoke" && request.status !== "approved")
        throw new ConflictException("Chỉ thu hồi quyền đã được chấp nhận.");
      if (dto.decision !== "revoke" && request.status !== "pending")
        throw new ConflictException("Yêu cầu đã được xử lý.");
      if (dto.decision === "approve") {
        if (!dto.sessionId)
          throw new BadRequestException("Chọn phiên cụ thể để cấp quyền đọc.");
        const sessions = await em.query(
          "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0 AND leadInstructorId=@1",
          [dto.sessionId, actorId],
        );
        if (!sessions.length)
          throw new ForbiddenException(
            "Chỉ chủ trì phiên mới được cấp quyền xem.",
          );
      }
      const status =
        dto.decision === "approve"
          ? "approved"
          : dto.decision === "deny"
            ? "denied"
            : "revoked";
      await em.query(
        "UPDATE session_access_requests SET status=@1,sessionId=@2,expiresAt=@3,decidedAt=SYSUTCDATETIME() WHERE id=@0",
        [
          id,
          status,
          dto.decision === "approve" ? dto.sessionId : request.sessionId,
          dto.decision === "approve"
            ? new Date(Date.now() + (dto.days ?? 7) * 86400000)
            : request.expiresAt,
        ],
      );
      await this.event(em, actorId, id, request.requesterId, status);
      return (
        await em.query("SELECT * FROM session_access_requests WHERE id=@0", [
          id,
        ])
      )[0] as AccessRow;
    });
  }

  async snapshot(actorId: string, id: string, page: number, pageSize: number) {
    await this.instructor(actorId);
    // The consent row stays locked for this short read so concurrent revoke cannot
    // race between authorization and collecting the snapshot. No network/AI calls.
    return this.db.transaction(async (em) => {
      const rows: Array<AccessRow & { currentOwnerId: string | null }> =
        await em.query(
          `SELECT a.*,s.leadInstructorId currentOwnerId FROM session_access_requests a WITH(HOLDLOCK)
        LEFT JOIN internship_sessions s WITH(HOLDLOCK) ON s.id=a.sessionId WHERE a.id=@0 AND a.requesterId=@1`,
          [id, actorId],
        );
      if (!rows.length)
        throw new NotFoundException("Không tìm thấy quyền xem.");
      const grant = rows[0];
      assertSharedRead(grant, actorId, grant.currentOwnerId);
      const session = (
        await em.query(
          "SELECT id,code,name,description,status,startDate,endDate FROM internship_sessions WHERE id=@0",
          [grant.sessionId],
        )
      )[0];
      const projects = await em.query(
        "SELECT p.id,p.code,p.name,p.description FROM template_runs r JOIN projects p ON p.id=r.projectId WHERE r.sessionId=@0",
        [grant.sessionId],
      );
      const members = await em.query(
        "SELECT u.id,u.displayName FROM session_members m JOIN users u ON u.id=m.userId WHERE m.sessionId=@0 ORDER BY u.displayName",
        [grant.sessionId],
      );
      const tasks = await em.query(
        `SELECT t.id,t.code,t.title,t.description,t.status,t.priority,t.dueDate,t.progress,sp.name sprintName,u.displayName assigneeName
        FROM tasks t JOIN sprints sp ON sp.id=t.sprintId LEFT JOIN users u ON u.id=t.assigneeId
        WHERE sp.sessionId=@0 AND t.deletedAt IS NULL ORDER BY sp.startDate,t.createdAt,t.id OFFSET @1 ROWS FETCH NEXT @2 ROWS ONLY`,
        [grant.sessionId, (page - 1) * pageSize, pageSize],
      );
      const total: Array<{ n: number }> = await em.query(
        "SELECT COUNT(*) n FROM tasks t JOIN sprints sp ON sp.id=t.sprintId WHERE sp.sessionId=@0 AND t.deletedAt IS NULL",
        [grant.sessionId],
      );
      return {
        session,
        projects,
        members,
        tasks,
        expiresAt: grant.expiresAt,
        readOnly: true,
        meta: {
          page,
          pageSize,
          total: total[0].n,
          totalPages: Math.ceil(total[0].n / pageSize),
        },
      };
    });
  }
}
