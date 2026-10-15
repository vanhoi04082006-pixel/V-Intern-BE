import { Controller, ForbiddenException, Get, Injectable, Module, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { PermissionsService } from '../rbac/permissions.service';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LearningAlertsService } from '../notifications/learning-alerts.service';
class RepositoryQuery extends PaginationQueryDto {
  @IsOptional() @IsIn(['ready', 'failed', 'provisioning', 'not_configured']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
@Injectable()
class AdminSystemService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService, private readonly permissions: PermissionsService, private readonly alerts: LearningAlertsService) {}
  private async authorize(actor: string) { if (!await this.permissions.hasRole(actor, 'admin')) throw new ForbiddenException('Administrator access required.'); }
  async status(actor: string) {
    await this.authorize(actor);
    const started = Date.now(); await this.db.query('SELECT 1'); const latency = Date.now() - started;
    const [counts] = await this.db.query(`SELECT (SELECT COUNT(*) FROM users WHERE status<>'deleted') users,
      (SELECT COUNT(*) FROM internship_sessions WHERE status='active') activeSessions,
      (SELECT COUNT(*) FROM interview_questions WHERE isActive=1) activeQuestions,
      (SELECT COUNT(*) FROM project_templates WHERE status='active') activeTemplates,
      (SELECT COUNT(*) FROM migrations) migrations,
      (SELECT COUNT(*) FROM submission_code_reviews WHERE status='running') runningReviews`);
    const ai = await this.db.query("SELECT feature,status,COUNT(*) count,AVG(latencyMs) averageLatencyMs FROM ai_runs WHERE createdAt>=DATEADD(hour,-24,SYSUTCDATETIME()) GROUP BY feature,status ORDER BY feature,status");
    const has = (key: string) => Boolean(this.config.get<string>(key)?.trim());
    const oauth = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_CALLBACK_URL', 'GITHUB_TOKEN_ENCRYPTION_KEY'];
    const runner = ['GRADING_RUNNER_URL', 'GRADING_RUNNER_TOKEN', 'GRADING_RUNNER_SIGNING_KEY'];
    let sealedSuites = 0, suiteConfigValid = true;
    try {
      const suites: unknown = JSON.parse(this.config.get<string>('GRADING_SUITES_JSON', '{}'));
      if (!suites || typeof suites !== 'object' || Array.isArray(suites)) throw Error();
      for (const item of Object.values(suites)) { if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.digest !== 'string' || !/^[0-9a-f]{64}$/i.test(item.digest)) throw Error(); sealedSuites++; }
    } catch { suiteConfigValid = false; sealedSuites = 0; }
    return { checkedAt: new Date(), database: { status: 'reachable', latencyMs: latency }, counts, aiLast24Hours: ai, learningAlerts: this.alerts.status(),
      integrations: { github: { configured: oauth.every(has), missing: oauth.filter(key => !has(key)) }, webhook: { configured: has('GITHUB_WEBHOOK_URL') && this.config.get<string>('GITHUB_WEBHOOK_SECRET', '').length >= 32 },
        runner: { configured: runner.every(has), missing: runner.filter(key => !has(key)), sealedSuites, suiteConfigValid, connectivity: 'not_probed' } } };
  }
  async repositories(actor: string, q: RepositoryQuery) {
    await this.authorize(actor);
    const params = [q.status ?? null, q.search?.trim() ? `%${q.search.trim()}%` : null, (q.page - 1) * q.pageSize, q.pageSize];
    const from = `FROM session_repositories r JOIN internship_sessions s ON s.id=r.sessionId JOIN users u ON u.id=r.ownerUserId
      WHERE (@0 IS NULL OR r.status=@0) AND (@1 IS NULL OR s.name LIKE @1 OR s.code LIKE @1 OR r.repoName LIKE @1 OR r.ownerLogin LIKE @1)`;
    const [items, totals] = await Promise.all([
      this.db.query(`SELECT r.sessionId,s.name sessionName,s.code sessionCode,u.displayName instructorName,r.ownerLogin,r.repoName,r.status,r.webhookStatus,r.webhookErrorCode,
        (SELECT MAX(e.receivedAt) FROM github_repository_events e WHERE e.sessionId=r.sessionId) lastEventAt ${from} ORDER BY s.createdAt DESC,r.sessionId OFFSET @2 ROWS FETCH NEXT @3 ROWS ONLY`, params),
      this.db.query(`SELECT COUNT(*) total ${from}`, params),
    ]);
    return { items, total: Number(totals[0]?.total ?? 0), page: q.page, pageSize: q.pageSize };
  }
}
@Controller('admin/system')
@RequirePermissions('settings.read')
class AdminSystemController {
  constructor(private readonly system: AdminSystemService) {}
  @Get('status') status(@CurrentUser('userId') actor: string) { return this.system.status(actor); }
  @Get('repositories') repositories(@CurrentUser('userId') actor: string, @Query() q: RepositoryQuery) { return this.system.repositories(actor, q); }
}
@Module({ imports: [RbacModule, NotificationsModule], controllers: [AdminSystemController], providers: [AdminSystemService] })
export class AdminSystemModule {}
