import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { GithubAuthService } from './github-auth.service';
import { GithubClient } from './github-client';
import { GITHUB_WEBHOOK_EVENTS, githubEventSummary, verifyGithubDelivery } from './github-webhook-policy';

interface HookRepository {
  sessionId: string; ownerUserId: string; githubOwnerId: number | string; repoId: number | string;
  ownerLogin: string; repoName: string; status: string; webhookStatus?: string;
  webhookConfigHash?: string; webhookUpdatedAt?: Date | null;
}
interface RemoteHook { id: number; name: string; config: { url: string }; active: boolean; events: string[] }

@Injectable()
export class GithubWebhookService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService,
    private readonly auth: GithubAuthService, private readonly client: GithubClient) {}

  private configuration() {
    const url = this.config.get<string>('GITHUB_WEBHOOK_URL', '').trim();
    const secret = this.config.get<string>('GITHUB_WEBHOOK_SECRET', '');
    if (!url || secret.length < 32) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || parsed.search || !parsed.pathname.endsWith('/api/v1/github/webhook')) throw new Error();
      return { url: parsed.href, secret, hash: createHash('sha256').update(parsed.href + '\0' + secret).digest('hex') };
    } catch { throw new ServiceUnavailableException({ code: 'GITHUB_WEBHOOK_CONFIGURATION_INVALID', message: 'Webhook cần URL HTTPS công khai đúng endpoint của ứng dụng.' }); }
  }

  /** Called only after the repository's managing owner has been authorized. */
  async register(sessionId: string, actorId: string, force = false): Promise<void> {
    const settings = this.configuration();
    if (!settings) {
      await this.db.query("UPDATE session_repositories SET webhookStatus='not_configured',webhookErrorCode=NULL WHERE sessionId=@0 AND ownerUserId=@1", [sessionId, actorId]);
      return;
    }
    const lease = randomUUID();
    const repository = await this.db.transaction(async em => {
      const rows: HookRepository[] = await em.query('SELECT * FROM session_repositories WITH(UPDLOCK,HOLDLOCK) WHERE sessionId=@0', [sessionId]);
      const row = rows[0];
      if (!row || row.status !== 'ready') throw new ConflictException('Repository chưa sẵn sàng.');
      if (row.ownerUserId.toLowerCase() !== actorId.toLowerCase()) throw new ForbiddenException('Chỉ chủ repository có thể cấu hình webhook.');
      if (!force && row.webhookStatus === 'ready' && row.webhookConfigHash === settings.hash) return null;
      if (row.webhookStatus === 'configuring' && row.webhookUpdatedAt && row.webhookUpdatedAt.getTime() > Date.now() - 180000) return null;
      await em.query("UPDATE session_repositories SET webhookStatus='configuring',webhookLeaseId=@1,webhookUpdatedAt=SYSUTCDATETIME(),webhookErrorCode=NULL WHERE sessionId=@0", [sessionId, lease]);
      return row;
    });
    if (!repository) return;
    try {
      const { token, connection } = await this.auth.token(repository.ownerUserId);
      const identity = await this.client.call<{ id: number }>('/user', token);
      const path = `/repos/${encodeURIComponent(repository.ownerLogin)}/${encodeURIComponent(repository.repoName)}`;
      const remote = await this.client.call<{ id: number; owner: { id: number }; private: boolean }>(path, token);
      if (String(identity.id) !== String(repository.githubOwnerId) || String(connection.githubUserId) !== String(identity.id) || String(remote.id) !== String(repository.repoId) || String(remote.owner.id) !== String(identity.id) || remote.private) throw new ForbiddenException('Danh tính repository đã thay đổi.');
      const hooks = await this.client.call<RemoteHook[]>(path + '/hooks?per_page=100', token);
      if (!Array.isArray(hooks)) throw new ConflictException('Danh sách webhook không hợp lệ.');
      const existing = hooks.find(h => h.name === 'web' && h.config?.url === settings.url);
      if (existing && (!Number.isSafeInteger(existing.id) || existing.id <= 0)) throw new ConflictException('Webhook ID không hợp lệ.');
      if (!existing && hooks.length >= 100) throw new ConflictException('Cần đối chiếu thêm danh sách webhook trước khi tạo.');
      const body = { name: 'web', active: true, events: [...GITHUB_WEBHOOK_EVENTS], config: { url: settings.url, content_type: 'json', insecure_ssl: '0', secret: settings.secret } };
      const hook = await this.client.call<RemoteHook>(path + '/hooks' + (existing ? '/' + existing.id : ''), token, existing ? 'PATCH' : 'POST', body);
      if (!Number.isSafeInteger(hook.id) || hook.id <= 0 || hook.config?.url !== settings.url || !hook.active || !Array.isArray(hook.events) || !GITHUB_WEBHOOK_EVENTS.every(event => hook.events.includes(event))) throw new ConflictException('GitHub chưa xác nhận cấu hình webhook.');
      await this.db.query("UPDATE session_repositories SET webhookStatus='ready',webhookId=@2,webhookConfigHash=@3,webhookUpdatedAt=SYSUTCDATETIME(),webhookErrorCode=NULL WHERE sessionId=@0 AND webhookLeaseId=@1", [sessionId, lease, hook.id, settings.hash]);
    } catch {
      await this.db.query("UPDATE session_repositories SET webhookStatus='failed',webhookErrorCode='GITHUB_WEBHOOK_SETUP_FAILED',webhookUpdatedAt=SYSUTCDATETIME() WHERE sessionId=@0 AND webhookLeaseId=@1", [sessionId, lease]);
    }
  }

  async consume(raw: Buffer | undefined, signature: string | undefined, deliveryId: string | undefined, event: string | undefined) {
    verifyGithubDelivery(raw, signature, this.config.get<string>('GITHUB_WEBHOOK_SECRET', ''));
    if (!deliveryId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId) || !event || !/^[a-z_]{1,32}$/.test(event)) throw new BadRequestException('Header webhook không hợp lệ.');
    let body: { repository?: { id?: unknown; owner?: { id?: unknown } } };
    try { body = JSON.parse(raw!.toString('utf8')) as typeof body; } catch { throw new BadRequestException('Payload webhook không phải JSON hợp lệ.'); }
    const repositoryId = body?.repository?.id, ownerId = body?.repository?.owner?.id;
    if (!Number.isSafeInteger(repositoryId) || Number(repositoryId) <= 0 || !Number.isSafeInteger(ownerId) || Number(ownerId) <= 0) throw new BadRequestException('Thiếu định danh repository.');
    const hash = createHash('sha256').update(raw!).digest('hex');
    const summary = githubEventSummary(event, body);
    return this.db.transaction(async em => {
      const receipts: Array<{ payloadHash: string; eventType: string; status: string }> = await em.query('SELECT * FROM github_webhook_deliveries WITH(UPDLOCK,HOLDLOCK) WHERE deliveryId=@0', [deliveryId]);
      if (receipts[0]) {
        if (receipts[0].payloadHash !== hash || receipts[0].eventType !== event) throw new ConflictException('Delivery ID đã dùng cho nội dung khác.');
        return { status: receipts[0].status, deduped: true };
      }
      const repositories: HookRepository[] = await em.query(`SELECT r.* FROM session_repositories r WITH(UPDLOCK,HOLDLOCK)
        JOIN github_connections c ON c.userId=r.ownerUserId AND c.githubUserId=r.githubOwnerId
        JOIN users u ON u.id=c.userId AND u.status='active'
        JOIN internship_sessions se ON se.id=r.sessionId AND se.leadInstructorId=r.ownerUserId
        WHERE r.repoId=@0 AND r.githubOwnerId=@1 AND r.status='ready'`, [repositoryId, ownerId]);
      const repo = repositories[0];
      const supported = event === 'ping' || (GITHUB_WEBHOOK_EVENTS as readonly string[]).includes(event);
      const status = repo && supported && String(repo.githubOwnerId) === String(ownerId) ? 'processed' : 'ignored';
      await em.query('INSERT INTO github_webhook_deliveries(deliveryId,payloadHash,eventType,sessionId,repositoryId,status) VALUES(@0,@1,@2,@3,@4,@5)', [deliveryId, hash, event, status === 'processed' ? repo.sessionId : null, repositoryId, status]);
      if (status === 'ignored') return { status, deduped: false };
      await em.query('INSERT INTO github_repository_events(id,deliveryId,sessionId,eventType,action,headSha,pullNumber,branch) VALUES(@0,@1,@2,@3,@4,@5,@6,@7)', [randomUUID(), deliveryId, repo.sessionId, event, summary.action, summary.headSha, summary.pullNumber, summary.branch]);
      if ((event === 'pull_request' || event === 'push') && summary.headSha) {
        const changed: Array<{ id: string; internId: string }> = await em.query(`UPDATE s SET observedHeadSha=@2,sourceChangedAt=SYSUTCDATETIME()
          OUTPUT inserted.id,inserted.internId
          FROM task_submissions s JOIN tasks t ON t.id=s.taskId JOIN sprints sp ON sp.id=t.sprintId AND sp.projectId=t.projectId
          WHERE sp.sessionId=@0 AND s.repositoryId=@1 AND s.status='submitted' AND s.headSha<>@2
          AND (s.observedHeadSha IS NULL OR s.observedHeadSha<>@2)
          AND ((@3='pull_request' AND s.sourceKind='pull' AND s.pullNumber=@4) OR (@3='push' AND s.sourceKind='branch' AND s.sourceRef=@5))`, [repo.sessionId, repositoryId, summary.headSha, event, summary.pullNumber, summary.branch]);
        const recipients = new Map<string, { id: string; count: number }>();
        for (const submission of changed) {
          const key = submission.internId.toLowerCase(), prior = recipients.get(key);
          recipients.set(key, { id: submission.internId, count: (prior?.count ?? 0) + 1 });
        }
        if (changed.length) recipients.set(repo.ownerUserId.toLowerCase(), { id: repo.ownerUserId, count: changed.length });
        for (const { id: recipient, count } of recipients.values()) {
          const pref = await em.getRepository(NotificationPreference).findOne({ where: { userId: recipient, category: 'task' } });
          if (pref?.enabled === false) continue;
          await em.insert(Notification, { userId: recipient, type: 'submission.source_changed', title: 'Có thay đổi code sau khi nộp bài',
            body: `GitHub ghi nhận head SHA khác ${count} bài đã nộp. Hãy kiểm tra lại commit và nộp/chấm lại khi cần.`, linkUrl: recipient.toLowerCase() === repo.ownerUserId.toLowerCase() ? `/instructor/sessions/${repo.sessionId}` : '/intern/work' });
        }
      }
      return { status, deduped: false };
    });
  }

  async activity(sessionId: string, page: number, pageSize: number) {
    const totals: Array<{ n: number }> = await this.db.query('SELECT COUNT(*) AS n FROM github_repository_events WHERE sessionId=@0', [sessionId]);
    const items: Array<{ id: string; eventType: string; action: string; headSha: string | null; pullNumber: number | null; branch: string | null; receivedAt: Date }> = await this.db.query('SELECT id,eventType,action,headSha,pullNumber,branch,receivedAt FROM github_repository_events WHERE sessionId=@0 ORDER BY receivedAt DESC,id OFFSET @1 ROWS FETCH NEXT @2 ROWS ONLY', [sessionId, (page - 1) * pageSize, pageSize]);
    return { items, total: Number(totals[0]?.n ?? 0) };
  }
}
