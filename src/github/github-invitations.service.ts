import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { CommunicationsService } from "../communications/communications.service";
import { GithubApiError, GithubClient } from "./github-client";
import { recordSystemInvitation } from "./github-grant-ledger";
import {
  InvitationRepository,
  InvitationResult,
  InvitationStatus,
  resolveInvitation,
} from "./github-invitation-policy";

interface MemberState {
  status: InvitationStatus;
  githubUserId: string | number | null;
  invitationId: string | number | null;
  invitedAt: Date | null;
  expiresAt: Date | null;
  lastCheckedAt: Date | null;
  lastRequestedAt: Date | null;
  leaseUntil: Date | null;
  errorCode: string | null;
}
export const membership = `SELECT userId FROM session_members WHERE sessionId=@0
  UNION SELECT instructorId FROM session_instructors WHERE sessionId=@0
  UNION SELECT leadInstructorId FROM internship_sessions WHERE id=@0 AND leadInstructorId IS NOT NULL
  UNION SELECT internId FROM assignments WHERE sessionId=@0 AND status='active'`;

@Injectable()
export class GithubInvitationsService {
  private readonly logger = new Logger(GithubInvitationsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly client: GithubClient,
    private readonly mail: CommunicationsService,
  ) {}

  async sync(
    repo: InvitationRepository & { sessionId: string },
    token: string,
    actorId: string,
    force = false,
    targetId?: string,
    readOnly = false,
  ) {
    const members: Array<{
      userId: string;
      githubUserId: string | number | null;
    }> = await this.db.query(
      `SELECT TOP(5) m.userId,c.githubUserId FROM (${membership}) m
      JOIN users u ON u.id=m.userId AND u.status='active'
      LEFT JOIN github_connections c ON c.userId=m.userId
      LEFT JOIN session_repo_members rm ON rm.sessionId=@0 AND rm.userId=m.userId
      WHERE (@1 IS NULL OR m.userId=@1)
      ORDER BY COALESCE(rm.lastCheckedAt,CONVERT(datetime2,'2000-01-01')),m.userId`,
      [repo.sessionId, targetId ?? null],
    );
    if (targetId && !members.length)
      throw new NotFoundException("Thành viên không còn thuộc phiên này.");
    let processed = 0,
      skipped = 0;
    for (const member of members) {
      const lease = randomUUID();
      const claim = await this.db.transaction(async (em) => {
        await em.query(
          "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
          [repo.sessionId],
        );
        const [fresh]: Array<{
          userId: string;
          githubUserId: string | number | null;
        }> = await em.query(
          `SELECT m.userId,c.githubUserId FROM (${membership}) m JOIN users u ON u.id=m.userId AND u.status='active' LEFT JOIN github_connections c ON c.userId=m.userId WHERE m.userId=@1`,
          [repo.sessionId, member.userId],
        );
        if (!fresh) {
          if (targetId)
            throw new NotFoundException(
              "Thành viên không còn thuộc phiên này.",
            );
          return null;
        }
        member.githubUserId = fresh.githubUserId;
        const [{ utcNow }]: Array<{ utcNow: Date }> = await em.query(
          "SELECT SYSUTCDATETIME() utcNow",
        );
        const [prior]: MemberState[] = await em.query(
          "SELECT * FROM session_repo_members WITH(UPDLOCK,HOLDLOCK) WHERE sessionId=@0 AND userId=@1",
          [repo.sessionId, member.userId],
        );
        const checkedAt =
          force || readOnly ? prior?.lastRequestedAt : prior?.lastCheckedAt;
        if (
          prior &&
          ((prior.leaseUntil && prior.leaseUntil > utcNow) ||
            (checkedAt && checkedAt.getTime() > utcNow.getTime() - 60000))
        )
          return null;
        if (!prior)
          await em.query(
            "INSERT INTO session_repo_members(sessionId,userId,status) VALUES(@0,@1,'not_connected')",
            [repo.sessionId, member.userId],
          );
        await em.query(
          "UPDATE session_repo_members SET leaseToken=@2,leaseUntil=DATEADD(minute,5,SYSUTCDATETIME()),lastRequestedAt=CASE WHEN @3=1 THEN SYSUTCDATETIME() ELSE lastRequestedAt END WHERE sessionId=@0 AND userId=@1",
          [repo.sessionId, member.userId, lease, force || readOnly ? 1 : 0],
        );
        return { prior, now: utcNow };
      });
      if (!claim) {
        skipped++;
        continue;
      }
      let result: InvitationResult;
      try {
        if (
          claim.prior?.githubUserId &&
          member.githubUserId !== null &&
          String(claim.prior.githubUserId) !== String(member.githubUserId)
        )
          throw Error("GITHUB_IDENTITY_CHANGED");
        result = await resolveInvitation(
          this.client,
          token,
          repo,
          member,
          claim.now,
          !readOnly &&
            (force ||
              (!claim.prior?.invitationId &&
                claim.prior?.status !== "expired")),
        );
        if (result.status === "not_connected" && claim.prior?.githubUserId) {
          result = {
            ...result,
            githubUserId: String(claim.prior.githubUserId),
            invitationId:
              claim.prior.invitationId === null
                ? null
                : String(claim.prior.invitationId),
            invitedAt: claim.prior.invitedAt,
            expiresAt: claim.prior.expiresAt,
          };
        }
        if (
          result.status === "failed" &&
          result.errorCode === "GITHUB_INVITATION_UNAVAILABLE" &&
          claim.prior?.expiresAt &&
          claim.prior.expiresAt <= claim.now
        )
          result = {
            ...result,
            status: "expired",
            errorCode: null,
            invitationId:
              claim.prior.invitationId === null
                ? null
                : String(claim.prior.invitationId),
            invitedAt: claim.prior.invitedAt,
            expiresAt: claim.prior.expiresAt,
          };
      } catch (error) {
        const code =
          error instanceof GithubApiError
            ? (error.getResponse() as { code: string }).code
            : error instanceof Error && /^GITHUB_[A-Z_]+$/.test(error.message)
              ? error.message
              : "GITHUB_INVITATION_FAILED";
        result = {
          status: "failed",
          githubUserId: claim.prior?.githubUserId
            ? String(claim.prior.githubUserId)
            : member.githubUserId === null
              ? null
              : String(member.githubUserId),
          login: null,
          invitationId: claim.prior?.invitationId
            ? String(claim.prior.invitationId)
            : null,
          invitedAt: claim.prior?.invitedAt ?? null,
          expiresAt: claim.prior?.expiresAt ?? null,
          errorCode: code,
          invited: false,
        };
      }
      await this.db.transaction(async (em) => {
        await em.query(
          "SELECT id FROM internship_sessions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0",
          [repo.sessionId],
        );
        const [owned]: Array<{ userId: string }> = await em.query(
          "SELECT userId FROM session_repo_members WITH(UPDLOCK,HOLDLOCK) WHERE sessionId=@0 AND userId=@1 AND leaseToken=@2 AND leaseUntil>SYSUTCDATETIME()",
          [repo.sessionId, member.userId, lease],
        );
        if (!owned) return;
        const newInvitation =
          result.status === "pending" &&
          result.invitationId !== String(claim.prior?.invitationId ?? "");
        await em.query(
          `UPDATE session_repo_members SET status=@2,githubUserId=@3,login=@4,invitationId=@5,invitedAt=@6,expiresAt=@7,
          acceptedAt=CASE WHEN @2='accepted' THEN COALESCE(acceptedAt,SYSUTCDATETIME()) ELSE NULL END,
          lastAttemptAt=CASE WHEN @9=1 THEN SYSUTCDATETIME() ELSE lastAttemptAt END,
          lastCheckedAt=SYSUTCDATETIME(),updatedAt=SYSUTCDATETIME(),errorCode=@8,leaseToken=NULL,leaseUntil=NULL
          WHERE sessionId=@0 AND userId=@1 AND leaseToken=@10`,
          [
            repo.sessionId,
            member.userId,
            result.status,
            result.githubUserId,
            result.login,
            result.invitationId,
            result.invitedAt?.toISOString() ?? null,
            result.expiresAt?.toISOString() ?? null,
            result.errorCode,
            result.invited ? 1 : 0,
            lease,
          ],
        );
        if (
          result.invited ||
          newInvitation ||
          claim.prior?.status !== result.status ||
          claim.prior?.errorCode !== result.errorCode
        ) {
          const eventId = randomUUID();
          await em.query(
            `INSERT INTO github_invitation_events(id,sessionId,userId,actorId,githubUserId,invitationId,action,previousStatus,status,errorCode,source)
          VALUES(@0,@1,@2,@3,@4,@5,@6,@7,@8,@9,@10)`,
            [
              eventId,
              repo.sessionId,
              member.userId,
              actorId,
              result.githubUserId,
              result.invitationId,
              result.invited || newInvitation ? "invited" : "reconciled",
              claim.prior?.status ?? null,
              result.status,
              result.errorCode,
              readOnly
                ? "self_check"
                : force
                  ? "staff_request"
                  : "automatic_sync",
            ],
          );
          await recordSystemInvitation(
            em,
            eventId,
            repo.sessionId,
            member.userId,
            repo,
            result,
          );
        }
      });
      processed++;
    }
    await this.flushNotices(repo.sessionId);
    if (targetId && !processed)
      throw new ConflictException({
        code: "GITHUB_INVITATION_COOLDOWN",
        message:
          "Vừa kiểm tra lời mời. Vui lòng đợi một phút trước khi thử lại.",
      });
    return { processed, skipped, batchLimit: 5 };
  }

  /** Durable event IDs dedupe notices independently of worker retries or SMTP availability. */
  async flushNotices(sessionId: string) {
    let mailReady = false;
    try {
      mailReady = this.mail.ready();
    } catch {
      /* In-app notices remain available without SMTP configuration. */
    }
    const events: Array<{ id: string }> = await this.db.query(
      `SELECT TOP(5) e.id FROM github_invitation_events e
      WHERE e.sessionId=@0 AND e.action='invited' AND (e.notificationSentAt IS NULL OR e.mailQueuedAt IS NULL)
      ORDER BY e.createdAt,e.id`,
      [sessionId],
    );
    for (const event of events)
      try {
        await this.db.transaction(async (em) => {
          const [row]: Array<{
            userId: string;
            email: string;
            displayName: string;
            sessionName: string;
            repoName: string;
            notificationSentAt: Date | null;
            mailQueuedAt: Date | null;
            expiresAt: Date;
            active: boolean;
          }> = await em.query(
            `SELECT e.userId,u.email,u.displayName,se.name sessionName,r.repoName,e.notificationSentAt,e.mailQueuedAt,m.expiresAt,
          CASE WHEN u.status='active' AND m.status='pending' AND m.invitationId=e.invitationId AND m.expiresAt>SYSUTCDATETIME() THEN 1 ELSE 0 END active
          FROM github_invitation_events e WITH(UPDLOCK,HOLDLOCK) JOIN users u ON u.id=e.userId
          JOIN internship_sessions se ON se.id=e.sessionId JOIN session_repositories r ON r.sessionId=e.sessionId
          JOIN session_repo_members m ON m.sessionId=e.sessionId AND m.userId=e.userId WHERE e.id=@0`,
            [event.id],
          );
          if (!row) return;
          if (!row.active) {
            await em.query(
              "UPDATE github_invitation_events SET notificationSentAt=COALESCE(notificationSentAt,SYSUTCDATETIME()),mailQueuedAt=COALESCE(mailQueuedAt,SYSUTCDATETIME()) WHERE id=@0",
              [event.id],
            );
            return;
          }
          const path = `/github/invitation?session=${encodeURIComponent(sessionId)}`;
          if (!row.notificationSentAt) {
            await em.query(
              `IF NOT EXISTS(SELECT 1 FROM notification_preferences WHERE userId=@1 AND category='session' AND enabled=0)
            INSERT INTO notifications(id,userId,type,title,body,linkUrl) VALUES(@0,@1,'session',N'Lời mời GitHub · '+@2,N'Bạn được mời cộng tác vào '+@3+N'. Mở V-Intern, kiểm tra đúng tài khoản GitHub và chấp nhận lời mời.',@4);
            UPDATE github_invitation_events SET notificationSentAt=SYSUTCDATETIME() WHERE id=@0`,
              [
                event.id,
                row.userId,
                row.sessionName.slice(0, 210),
                row.repoName,
                path,
              ],
            );
          }
          if (!row.mailQueuedAt && mailReady) {
            const [{ utcNow }]: Array<{ utcNow: Date }> = await em.query(
              "SELECT SYSUTCDATETIME() utcNow",
            );
            await this.mail.enqueue(
              {
                eventKey: `github-invitation:${event.id}`,
                ownerId: row.userId,
                to: row.email,
                content: {
                  kind: "github-invitation",
                  name: row.displayName,
                  ctaPath: path,
                  session: row.sessionName,
                  repository: row.repoName,
                  when:
                    row.expiresAt.toLocaleString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                    }) + " (UTC+7)",
                },
                availableAt: utcNow,
                expiresAt: row.expiresAt,
              },
              em,
            );
            await em.query(
              "UPDATE github_invitation_events SET mailQueuedAt=SYSUTCDATETIME() WHERE id=@0",
              [event.id],
            );
          }
        });
      } catch {
        this.logger.warn("GitHub invitation notice remains queued for retry.");
      }
  }
}
