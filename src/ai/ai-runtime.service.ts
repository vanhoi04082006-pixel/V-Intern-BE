import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { PermissionsService } from '../rbac/permissions.service';
import { AiRuntimePolicy, validateAiRuntimePolicy } from './ai-runtime-policy';
@Injectable()
export class AiRuntimeService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService, private readonly permissions: PermissionsService) {}
  async effective() {
    const [row]: Array<{ value: string }> = await this.db.query("SELECT value FROM system_settings WHERE settingKey='ai.runtime'");
    const defaults: AiRuntimePolicy = { model: this.config.get<string>('AI_MODEL', ''), timeoutMs: Number(this.config.get('AI_TIMEOUT_MS', 60000)), maxRetries: Number(this.config.get('AI_MAX_RETRIES', 2)), version: 0 };
    if (!row) return { policy: defaults, source: 'environment' as const };
    try { return { policy: validateAiRuntimePolicy(JSON.parse(row.value)), source: 'database' as const }; }
    catch { return { policy: defaults, source: 'invalid_database_fallback' as const }; }
  }
  private async authorize(actor: string) { if (!await this.permissions.hasRole(actor, 'admin')) throw new ForbiddenException('AI runtime configuration is restricted to administrators.'); }
  async get(actor: string) {
    await this.authorize(actor);
    return { ...await this.effective(), provider: this.config.get<string>('AI_PROVIDER', '') || null, credentialsConfigured: Boolean(this.config.get('AI_API_KEY')), appliesTo: ['interviewer', 'interview-evaluator', 'planner', 'mentor', 'code-review', 'evaluation-assistance', 'recommendations'] };
  }
  async update(actor: string, raw: unknown) {
    await this.authorize(actor); const input = validateAiRuntimePolicy(raw);
    await this.db.transaction(async em => {
      const [row]: Array<{ value: string }> = await em.query("SELECT value FROM system_settings WITH(UPDLOCK,HOLDLOCK) WHERE settingKey='ai.runtime'");
      let version = 0;
      if (row) { try { version = validateAiRuntimePolicy(JSON.parse(row.value)).version; } catch { /* Allow an administrator to repair malformed stored configuration. */ } }
      if (input.version !== version) throw new ConflictException({ code: 'AI_CONFIG_VERSION_CONFLICT', message: 'Cấu hình đã thay đổi. Hãy tải lại trước khi lưu.' });
      const policy = { ...input, version: version + 1 };
      if (row) await em.query("UPDATE system_settings SET value=@0,updatedAt=SYSUTCDATETIME() WHERE settingKey='ai.runtime'", [JSON.stringify(policy)]);
      else await em.query("INSERT INTO system_settings(settingKey,value,description) VALUES('ai.runtime',@0,N'Cấu hình model và giới hạn lời gọi AI; không chứa secret.')", [JSON.stringify(policy)]);
      await em.insert(AuditLog, { actorId: actor, action: 'ai.configuration.updated', targetType: 'system_setting', targetId: 'ai.runtime', detail: JSON.stringify(policy), ip: null, userAgent: null });
    });
    return this.get(actor);
  }
}
