import {
  Injectable,
  HttpException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { GithubApiError, GithubClient } from "./github-client";
import {
  GithubInvitationsService,
  membership,
} from "./github-invitations.service";
import { GithubRepositoryAccountService } from "./github-repository-account.service";
import {
  invitationRepoPath,
  resolveInvitation,
} from "./github-invitation-policy";
import { decideRepositoryAccess } from "./repository-access.policy";
import {
  RepositoryAccessQueue,
  RepositoryAccessJob,
  GrantObservation,
} from "./repository-access.queue";
interface Repo {
  sessionId: string;
  repoId: string | number;
  githubOwnerId: string | number;
  ownerLogin: string;
  repoName: string;
  status: string;
}
@Injectable()
export class RepositoryAccessWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(RepositoryAccessWorker.name);
  constructor(
    private readonly db: DataSource,
    private readonly queue: RepositoryAccessQueue,
    private readonly client: GithubClient,
    private readonly invitations: GithubInvitationsService,
    private readonly account: GithubRepositoryAccountService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (
      this.config.get("NODE_ENV") === "test" ||
      this.config.get("REPOSITORY_ACCESS_WORKER_ENABLED", "true") !== "true"
    )
      return;
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick(sessionId: string | null = null) {
    if (this.running) return { processed: 0, busy: true };
    this.running = true;
    let processed = 0;
    try {
      for (let i = 0; i < 3; i++) {
        const job = await this.queue.claim(sessionId);
        if (!job) break;
        await this.process(job);
        processed++;
      }
      return { processed, batchLimit: 3 };
    } catch {
      this.logger.warn(
        "Repository access reconciliation will resume from its durable queue.",
      );
      return { processed, failed: true };
    } finally {
      this.running = false;
    }
  }
  private async needed(repoId: string | number, githubUserId: string) {
    const [scope]: Array<{ sessionId: string; userId: string }> =
      await this.db.query(
        `SELECT TOP(1) r.sessionId,m.userId FROM session_repositories r
      CROSS APPLY(SELECT userId FROM session_members sm WHERE sm.sessionId=r.sessionId
      UNION SELECT instructorId FROM session_instructors si WHERE si.sessionId=r.sessionId
      UNION SELECT leadInstructorId FROM internship_sessions se WHERE se.id=r.sessionId AND leadInstructorId IS NOT NULL
      UNION SELECT internId FROM assignments a WHERE a.sessionId=r.sessionId AND a.status='active') m
      JOIN users u ON u.id=m.userId AND u.status='active'
      LEFT JOIN github_connections c ON c.userId=m.userId LEFT JOIN session_repo_members rm ON rm.sessionId=r.sessionId AND rm.userId=m.userId
      WHERE r.repoId=@0 AND (c.githubUserId=@1 OR rm.githubUserId=@1) ORDER BY r.sessionId,m.userId`,
        [String(repoId), githubUserId],
      );
    return scope ?? null;
  }
  private wait(job: RepositoryAccessJob, code: string, kind: string) {
    return this.queue.finish(job, "waiting_user", code, { kind }, 300, true);
  }
  private async process(job: RepositoryAccessJob) {
    let memberHeld = false;
    try {
      const [repo]: Repo[] = await this.db.query(
        "SELECT sessionId,repoId,githubOwnerId,ownerLogin,repoName,status FROM session_repositories WHERE sessionId=@0",
        [job.sessionId],
      );
      if (!repo || repo.status !== "ready" || !repo.repoId) {
        await this.wait(
          job,
          "GITHUB_REPOSITORY_NOT_READY",
          "repository_required",
        );
        return;
      }
      const credentials = await this.account.credentials();
      if (
        String(credentials.connection.githubUserId) !==
        String(repo.githubOwnerId)
      ) {
        await this.wait(
          job,
          "GITHUB_OWNER_CHANGED",
          "owner_confirmation_required",
        );
        return;
      }
      const remote = await this.client.call<{
        id: number;
        name: string;
        private: boolean;
        owner: { id: number; login: string };
      }>(`/repositories/${repo.repoId}`, credentials.token);
      if (
        String(remote.id) !== String(repo.repoId) ||
        String(remote.owner?.id) !== String(repo.githubOwnerId) ||
        remote.private !== false
      ) {
        await this.queue.finish(
          job,
          "failed",
          "GITHUB_ACCESS_REVIEW_REQUIRED",
          { kind: "repository_changed", reviewRequired: true },
        );
        return;
      }
      repo.ownerLogin = remote.owner.login;
      repo.repoName = remote.name;
      const [member]: Array<{ userId: string }> = await this.db.query(
        `SELECT m.userId FROM (${membership}) m JOIN users u ON u.id=m.userId AND u.status='active' WHERE m.userId=@1`,
        [job.sessionId, job.userId],
      );
      const [identity]: Array<{
        currentId: string | number | null;
        priorId: string | number | null;
      }> = await this.db.query(
        "SELECT c.githubUserId currentId,rm.githubUserId priorId FROM users u LEFT JOIN github_connections c ON c.userId=u.id LEFT JOIN session_repo_members rm ON rm.userId=u.id AND rm.sessionId=@1 WHERE u.id=@0",
        [job.userId, job.sessionId],
      );
      if (member) {
        if (!identity?.currentId) {
          await this.wait(
            job,
            "GITHUB_MEMBER_NOT_CONNECTED",
            "member_connection_required",
          );
          return;
        }
        if (
          identity.priorId &&
          String(identity.priorId) !== String(identity.currentId)
        ) {
          await this.wait(
            job,
            "GITHUB_IDENTITY_CHANGED",
            "member_identity_confirmation_required",
          );
          return;
        }
        const [session]: Array<{ status: string }> = await this.db.query(
          "SELECT status FROM internship_sessions WHERE id=@0",
          [job.sessionId],
        );
        if (session.status !== "active") {
          await this.wait(
            job,
            "GITHUB_SESSION_NOT_ACTIVE",
            "session_confirmation_required",
          );
          return;
        }
        await this.invitations.sync(
          repo,
          credentials.token,
          credentials.userId,
          false,
          job.userId,
        );
        const [state]: Array<{ status: string; errorCode: string | null }> =
          await this.db.query(
            "SELECT status,errorCode FROM session_repo_members WHERE sessionId=@0 AND userId=@1",
            [job.sessionId, job.userId],
          );
        if (!state || state.status === "not_connected") {
          await this.wait(
            job,
            "GITHUB_MEMBER_NOT_CONNECTED",
            "member_connection_required",
          );
          return;
        }
        if (state.errorCode || !["pending", "accepted"].includes(state.status))
          throw Error(state.errorCode ?? "GITHUB_ACCESS_UNAVAILABLE");
        await this.queue.finish(job, "done", null, {
          kind:
            state.status === "pending"
              ? "invitation_pending"
              : "access_present",
        });
        return;
      }
      if (!(await this.queue.memberLease(job))) {
        await this.queue.finish(
          job,
          "retry",
          "GITHUB_ACCESS_LEASE_BUSY",
          { kind: "invitation_in_flight" },
          60,
          true,
        );
        return;
      }
      memberHeld = true;
      const ids: Array<{ githubUserId: string | number }> = await this.db.query(
        `SELECT TOP(21) githubUserId FROM (
        SELECT githubUserId FROM github_connections WHERE userId=@0 UNION SELECT githubUserId FROM session_repo_members WHERE sessionId=@1 AND userId=@0
        UNION SELECT githubUserId FROM github_repository_grants WHERE sourceUserId=@0 AND repoId=@2) identities WHERE githubUserId IS NOT NULL ORDER BY githubUserId`,
        [job.userId, job.sessionId, String(repo.repoId)],
      );
      if (ids.length > 20) {
        await this.queue.finish(
          job,
          "failed",
          "GITHUB_ACCESS_REVIEW_REQUIRED",
          { kind: "identity_history_limit", reviewRequired: true },
        );
        return;
      }
      const observations: GrantObservation[] = [],
        effects: Array<{ githubUserId: string; kind: string }> = [];
      for (const identityRow of ids) {
        const githubUserId = String(identityRow.githubUserId);
        if (
          githubUserId === String(repo.githubOwnerId) ||
          (await this.needed(repo.repoId, githubUserId))
        ) {
          effects.push({ githubUserId, kind: "shared_or_owner_preserved" });
          continue;
        }
        const proofs: Array<{ id: string; invitationId: string | number }> =
          await this.db.query(
            "SELECT TOP(21) id,invitationId FROM github_repository_grants WHERE repoId=@0 AND githubUserId=@1 AND state<>'revoked' ORDER BY createdAt,id",
            [String(repo.repoId), githubUserId],
          );
        if (proofs.length > 20) {
          await this.queue.finish(
            job,
            "failed",
            "GITHUB_ACCESS_REVIEW_REQUIRED",
            { kind: "grant_history_limit", reviewRequired: true },
          );
          return;
        }
        const [{ utcNow }]: Array<{ utcNow: Date }> = await this.db.query(
          "SELECT SYSUTCDATETIME() utcNow",
        );
        const observed = await resolveInvitation(
          this.client,
          credentials.token,
          repo,
          { githubUserId },
          utcNow,
          false,
        );
        const status =
          observed.status === "pending"
            ? "pending"
            : observed.status === "accepted"
              ? "accepted"
              : observed.status === "expired"
                ? "expired"
                : "absent";
        const decision = decideRepositoryAccess({
          needed: Boolean(await this.needed(repo.repoId, githubUserId)),
          owner: githubUserId === String(repo.githubOwnerId),
          verifiedGrant: proofs.length > 0,
          remoteStatus: status,
          matchingInvitation: proofs.some(
            (p) => String(p.invitationId) === observed.invitationId,
          ),
        });
        if (decision === "keep") {
          effects.push({ githubUserId, kind: "shared_or_owner_preserved" });
          continue;
        }
        if (decision === "review") {
          if (proofs.length)
            observations.push({
              ids: proofs.map((p) => p.id),
              state: "review",
            });
          await this.queue.finish(
            job,
            "failed",
            "GITHUB_ACCESS_REVIEW_REQUIRED",
            {
              kind:
                status === "accepted"
                  ? "accepted_permission_origin_unverifiable"
                  : "permission_origin_unverifiable",
              reviewRequired: true,
              githubUserId,
              repositoryUrl: `https://github.com/${encodeURIComponent(repo.ownerLogin)}/${encodeURIComponent(repo.repoName)}`,
            },
            0,
            false,
            observations,
          );
          return;
        }
        if (decision === "cancel_invitation") {
          if (!(await this.queue.stillOwned(job))) return;
          try {
            await this.client.call(
              `${invitationRepoPath(repo)}/invitations/${observed.invitationId}`,
              credentials.token,
              "DELETE",
              undefined,
              [204],
            );
          } catch (e) {
            if (!(e instanceof GithubApiError && e.upstreamStatus === 404))
              throw e;
          }
          const freshScope = await this.needed(repo.repoId, githubUserId);
          if (freshScope) {
            await this.queue.releaseMember(job);
            memberHeld = false;
            await this.invitations.sync(
              { ...repo, sessionId: freshScope.sessionId },
              credentials.token,
              credentials.userId,
              false,
              freshScope.userId,
            );
          }
        }
        if (proofs.length)
          observations.push({ ids: proofs.map((p) => p.id), state: "revoked" });
        effects.push({
          githubUserId,
          kind:
            decision === "cancel_invitation"
              ? "invitation_cancelled"
              : "access_absent",
        });
      }
      await this.queue.finish(
        job,
        "done",
        null,
        { kind: "reconciled", identities: effects },
        0,
        false,
        observations,
      );
    } catch (e) {
      const response = e instanceof HttpException ? e.getResponse() : null;
      const reported =
        response && typeof response === "object" && "code" in response
          ? response.code
          : null;
      const code =
        typeof reported === "string" && /^GITHUB_[A-Z_]+$/.test(reported)
          ? reported
          : e instanceof Error && /^GITHUB_[A-Z_]+$/.test(e.message)
            ? e.message
            : "GITHUB_ACCESS_UNAVAILABLE";
      if (
        [
          "GITHUB_RECONNECT_REQUIRED",
          "GITHUB_ADMIN_ACCOUNT_REQUIRED",
          "GITHUB_IDENTITY_CHANGED",
        ].includes(code)
      ) {
        await this.wait(job, code, "configuration_required");
        return;
      }
      if (code === "GITHUB_INVITATION_COOLDOWN") {
        await this.queue.finish(
          job,
          "retry",
          code,
          { kind: "invitation_in_flight" },
          60,
          true,
        );
        return;
      }
      await this.queue.finish(
        job,
        job.attempts >= 6 ? "failed" : "retry",
        code,
        { kind: "remote_retry", retryLimit: 6 },
        Math.min(3600, 30 * 2 ** Math.min(job.attempts - 1, 7)),
      );
    } finally {
      if (memberHeld) await this.queue.releaseMember(job);
    }
  }
}
