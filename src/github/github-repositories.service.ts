import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { DataSource } from "typeorm";
import { PermissionsService } from "../rbac/permissions.service";
import { GithubAuthService } from "./github-auth.service";
import { GithubApiError, GithubClient } from "./github-client";
import { GithubWebhookService } from './github-webhook.service';
import { GithubRepositoryAccountService } from './github-repository-account.service';

function slug(value: string, fallback: string, max: number) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '') || fallback;
}

export interface SessionRepository {
  sessionId: string;
  ownerUserId: string;
  githubOwnerId: string | number;
  ownerLogin: string;
  repoName: string;
  repoId: string | number | null;
  htmlUrl: string | null;
  defaultBranch: string | null;
  status: "provisioning" | "ready" | "failed";
  leaseId: string;
  updatedAt: Date;
  errorCode: string | null;
  webhookStatus?: string;
  webhookUpdatedAt?: Date | null;
  webhookErrorCode?: string | null;
}
interface RemoteRepo {
  id: number;
  name: string;
  owner: { id: number; login: string };
  html_url: string;
  default_branch: string;
  private: boolean;
  description: string | null;
}
@Injectable()
export class GithubRepositoriesService {
  constructor(
    private readonly db: DataSource,
    private readonly auth: GithubAuthService,
    private readonly client: GithubClient,
    private readonly permissions: PermissionsService,
    private readonly webhooks: GithubWebhookService,
    private readonly account: GithubRepositoryAccountService,
  ) {}
  async read(sessionId: string): Promise<SessionRepository | null> {
    return (
      (
        await this.db.query(
          "SELECT * FROM session_repositories WHERE sessionId=@0",
          [sessionId],
        )
      )[0] ?? null
    );
  }
  private async access(sessionId: string, actorId: string, manage = false) {
    const rows: Array<{
      id: string;
      code: string;
      leadInstructorId: string | null;
      status: string;
      name?: string;
      startDate?: Date;
      projectName?: string;
    }> = await this.db.query(
      `SELECT se.id,se.code,se.name,se.startDate,se.leadInstructorId,se.status,
        (SELECT TOP(1) p.name FROM template_runs tr JOIN projects p ON p.id=tr.projectId WHERE tr.sessionId=se.id ORDER BY tr.createdAt) AS projectName
        FROM internship_sessions se WHERE se.id=@0`,
      [sessionId],
    );
    const session = rows[0];
    if (!session) throw new NotFoundException("Không tìm thấy phiên.");
    if (session.leadInstructorId?.toLowerCase() === actorId.toLowerCase())
      return session;
    if (await this.permissions.hasRole(actorId, "admin")) return session;
    if (!manage) {
      const member = await this.db.query(
        `SELECT sessionId FROM session_instructors WHERE sessionId=@0 AND instructorId=@1
        UNION ALL SELECT sessionId FROM assignments WHERE sessionId=@0 AND internId=@1 AND status IN ('active','completed')`,
        [sessionId, actorId],
      );
      if (member.length) return session;
    }
    throw new ForbiddenException(
      "Chỉ Admin hoặc giảng viên chủ trì có quyền đồng bộ repository của phiên.",
    );
  }
  async status(sessionId: string, actorId: string) {
    await this.access(sessionId, actorId);
    const row = await this.read(sessionId);
    const members: Array<{ userId: string; status: string }> =
      await this.db.query(
        "SELECT userId,status FROM session_repo_members WHERE sessionId=@0",
        [sessionId],
      );
    return {
      repository: row
        ? {
            owner: row.ownerLogin,
            name: row.repoName,
            url: row.htmlUrl,
            status: row.status,
            errorCode: row.errorCode,
            updatedAt: row.updatedAt,
            webhookStatus: row.webhookStatus ?? 'not_configured',
            webhookUpdatedAt: row.webhookUpdatedAt ?? null,
            webhookErrorCode: row.webhookErrorCode ?? null,
          }
        : null,
      members,
    };
  }
  async provision(sessionId: string, actorId: string) {
    const session = await this.access(sessionId, actorId, true);
    if (session.status !== "active")
      throw new ConflictException("Khởi động phiên trước khi tạo repository.");
    const existing = await this.read(sessionId);
    if (existing && existing.ownerUserId.toLowerCase() !== session.leadInstructorId?.toLowerCase() && !(await this.permissions.hasRole(existing.ownerUserId, 'admin')))
      throw new ConflictException('Chủ sở hữu repository cũ không còn được ủy quyền. Admin cần đối chiếu.');
    const credentials = existing
      ? { userId: existing.ownerUserId, ...await this.auth.token(existing.ownerUserId) }
      : await this.account.credentials();
    if (
      !credentials.connection.scopes
        .split(/[ ,]+/)
        .some((s) => s === "public_repo" || s === "repo")
    )
      throw new ServiceUnavailableException({
        code: "GITHUB_REPOSITORY_SCOPE_REQUIRED",
        message: "Kết nối GitHub cần quyền tạo repository public.",
      });
    const leaseId = randomUUID(),
      date = session.startDate ? new Date(session.startDate).toISOString().slice(0, 10).replace(/-/g, '') : 'session',
      repoName = existing?.repoName ?? `vintern-${slug(session.projectName ?? '', 'project', 24)}-${slug(session.name ?? session.code, 'session', 28)}-${date}-${sessionId.slice(0, 8).toLowerCase()}`;
    const claimed = await this.db.transaction(async (em) => {
      const rows: SessionRepository[] = await em.query(
        "SELECT * FROM session_repositories WITH(UPDLOCK,HOLDLOCK) WHERE sessionId=@0",
        [sessionId],
      );
      const row = rows[0];
      if (row && row.ownerUserId.toLowerCase() !== credentials.userId.toLowerCase())
        throw new ConflictException(
          "Chủ sở hữu phiên đã thay đổi; cần quản lý việc chuyển repository riêng.",
        );
      if (
        row &&
        String(row.githubOwnerId) !==
          String(credentials.connection.githubUserId)
      )
        throw new ConflictException(
          "Tài khoản GitHub chủ sở hữu đã thay đổi; cần đối chiếu repo cũ trước khi tạo lại.",
        );
      if (row?.status === "ready") return false;
      if (
        row?.status === "provisioning" &&
        row.updatedAt.getTime() > Date.now() - 180000
      )
        return false;
      if (row)
        await em.query(
          "UPDATE session_repositories SET status='provisioning',leaseId=@1,errorCode=NULL,updatedAt=SYSUTCDATETIME() WHERE sessionId=@0",
          [sessionId, leaseId],
        );
      else
        await em.query(
          "INSERT INTO session_repositories(sessionId,ownerUserId,ownerLogin,repoName,status,leaseId,githubOwnerId) VALUES(@0,@1,@2,@3,'provisioning',@4,@5)",
          [
            sessionId,
            credentials.userId,
            credentials.connection.login,
            repoName,
            leaseId,
            credentials.connection.githubUserId,
          ],
        );
      return true;
    });
    if (claimed) {
      try {
        const current = await this.client.call<{ id: number; login: string }>(
          "/user",
          credentials.token,
        );
        if (String(current.id) !== String(credentials.connection.githubUserId))
          throw new ForbiddenException("Danh tính GitHub đã thay đổi.");
        const marker = `V-INTERN session ${sessionId.toLowerCase()}`;
        let remote: RemoteRepo;
        try {
          remote = await this.client.call<RemoteRepo>(
            `/repos/${encodeURIComponent(current.login)}/${encodeURIComponent(repoName)}`,
            credentials.token,
          );
        } catch (e) {
          if (!(e instanceof GithubApiError) || e.upstreamStatus !== 404)
            throw e;
          remote = await this.client.call<RemoteRepo>(
            "/user/repos",
            credentials.token,
            "POST",
            {
              name: repoName,
              private: false,
              description: marker,
              auto_init: true,
            },
          );
        }
        if (
          !Number.isSafeInteger(remote.id) ||
          remote.private ||
          remote.owner.id !== current.id ||
          remote.description !== marker ||
          remote.name !== repoName
        )
          throw new ConflictException(
            "Tên repository đã có hoặc không khớp phiên; hệ thống không tự nhận repo khác.",
          );
        await this.db.query(
          "UPDATE session_repositories SET status='ready',repoId=@2,ownerLogin=@3,htmlUrl=@4,defaultBranch=@5,errorCode=NULL,updatedAt=SYSUTCDATETIME() WHERE sessionId=@0 AND leaseId=@1",
          [
            sessionId,
            leaseId,
            remote.id,
            remote.owner.login,
            `https://github.com/${remote.owner.login}/${remote.name}`,
            remote.default_branch,
          ],
        );
      } catch (e) {
        await this.db.query(
          "UPDATE session_repositories SET status='failed',errorCode=@2,updatedAt=SYSUTCDATETIME() WHERE sessionId=@0 AND leaseId=@1",
          [
            sessionId,
            leaseId,
            e instanceof GithubApiError
              ? String((e.getResponse() as { code: string }).code)
              : "GITHUB_PROVISION_FAILED",
          ],
        );
      }
    }
    if ((await this.read(sessionId))?.status === "ready") {
      await this.invite(sessionId, actorId);
      const repository = await this.read(sessionId);
      await this.webhooks.register(sessionId, repository!.ownerUserId);
    }
    return this.status(sessionId, actorId);
  }
  async configureWebhook(sessionId: string, actorId: string) {
    await this.access(sessionId, actorId, true);
    const repo = await this.read(sessionId);
    if (!repo || !(repo.ownerUserId.toLowerCase() === actorId.toLowerCase() || await this.permissions.hasRole(repo.ownerUserId, 'admin')))
      throw new ForbiddenException('Chủ repository không còn được ủy quyền.');
    await this.webhooks.register(sessionId, repo.ownerUserId, true);
    return this.status(sessionId, actorId);
  }
  async invite(sessionId: string, actorId: string, force = false) {
    const session = await this.access(sessionId, actorId, true);
    const repo = await this.read(sessionId);
    if (!repo || repo.status !== "ready" || !repo.repoId)
      throw new ConflictException("Repository chưa sẵn sàng.");
    if (repo.ownerUserId.toLowerCase() !== session.leadInstructorId?.toLowerCase() && !(await this.permissions.hasRole(repo.ownerUserId, 'admin')))
      throw new ForbiddenException(
        "Chủ sở hữu repository khác chủ trì phiên hiện tại.",
      );
    const { token, connection } = await this.auth.token(repo.ownerUserId);
    if (String(repo.githubOwnerId) !== String(connection.githubUserId))
      throw new ConflictException("Danh tính GitHub chủ sở hữu đã thay đổi.");
    const [currentOwner, remote] = await Promise.all([
      this.client.call<{ id: number; login: string }>("/user", token),
      this.client.call<RemoteRepo>(
        `/repos/${encodeURIComponent(repo.ownerLogin)}/${encodeURIComponent(repo.repoName)}`,
        token,
      ),
    ]);
    if (
      String(currentOwner.id) !== String(repo.githubOwnerId) ||
      String(remote.id) !== String(repo.repoId) ||
      String(remote.owner.id) !== String(repo.githubOwnerId) ||
      remote.private
    )
      throw new ForbiddenException(
        "Repository hoặc danh tính GitHub không còn khớp quyền đã cấp.",
      );
    const members: Array<{
      userId: string;
      login: string | null;
      githubUserId: string | number | null;
    }> = await this.db.query(
      `SELECT TOP(5) m.userId,c.login,c.githubUserId FROM (
        SELECT userId FROM session_members WHERE sessionId=@0
        UNION SELECT instructorId FROM session_instructors WHERE sessionId=@0
        UNION SELECT leadInstructorId FROM internship_sessions WHERE id=@0 AND leadInstructorId IS NOT NULL
        UNION SELECT internId FROM assignments WHERE sessionId=@0 AND status='active'
      ) m JOIN users u ON u.id=m.userId AND u.status='active'
      LEFT JOIN github_connections c ON c.userId=m.userId LEFT JOIN session_repo_members rm ON rm.sessionId=@0 AND rm.userId=m.userId
      WHERE (@1=1 OR rm.userId IS NULL OR rm.status<>'invited' OR c.connectedAt>rm.updatedAt)
      ORDER BY CASE WHEN c.githubUserId IS NULL THEN 1 ELSE 0 END,COALESCE(rm.updatedAt,CONVERT(datetime2,'2000-01-01')),m.userId`,
      [sessionId, force ? 1 : 0],
    );
    // A bounded batch: at most five numeric-id resolutions and five invitations.
    await Promise.all(
      members.slice(0, 5).map(async (member) => {
        let status = member.githubUserId ? "invited" : "not_connected";
        if (member.githubUserId && String(member.githubUserId) !== String(repo.githubOwnerId))
          try {
            if (!/^\d+$/.test(String(member.githubUserId)))
              throw new Error("Invalid GitHub identity.");
            const identity = await this.client.call<{
              id: number;
              login: string;
            }>(`/user/${member.githubUserId}`, token);
            if (
              String(identity.id) !== String(member.githubUserId) ||
              !/^[a-zA-Z0-9-]{1,39}$/.test(identity.login)
            )
              throw new Error("GitHub identity mismatch.");
            await this.client.call(
              `/repos/${encodeURIComponent(repo.ownerLogin)}/${encodeURIComponent(repo.repoName)}/collaborators/${encodeURIComponent(identity.login)}`,
              token,
              "PUT",
              { permission: "push" },
            );
          } catch {
            status = "failed";
          }
        await this.db.transaction(async (em) => {
          const existing = await em.query(
            "SELECT userId FROM session_repo_members WITH(UPDLOCK,HOLDLOCK) WHERE sessionId=@0 AND userId=@1",
            [sessionId, member.userId],
          );
          if (existing.length)
            await em.query(
              "UPDATE session_repo_members SET status=@2,updatedAt=SYSUTCDATETIME() WHERE sessionId=@0 AND userId=@1",
              [sessionId, member.userId, status],
            );
          else
            await em.query(
              "INSERT INTO session_repo_members(sessionId,userId,status) VALUES(@0,@1,@2)",
              [sessionId, member.userId, status],
            );
        });
      }),
    );
    return { processed: Math.min(members.length, 5), batchLimit: 5 };
  }
}
