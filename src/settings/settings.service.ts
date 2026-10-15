import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ActorContext } from '../users/users.service';
import { SystemSetting } from './entities/system-setting.entity';

export interface SettingResponse {
  key: string;
  value: string;
  description: string | null;
  updatedAt: Date;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SystemSetting) private readonly repo: Repository<SystemSetting>,
    private readonly audit: AuditService,
  ) {}

  async all(): Promise<SettingResponse[]> {
    const rows = await this.repo.find({ order: { settingKey: 'ASC' } });
    return rows.map((r) => ({
      key: r.settingKey,
      value: r.value,
      description: r.description ?? null,
      updatedAt: r.updatedAt,
    }));
  }

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { settingKey: key } });
    return row?.value ?? null;
  }

  /** Idempotent upsert; every change is audited. */
  async upsert(input: { key: string; value: string; description?: string }, ctx: ActorContext): Promise<void> {
    if (input.key === 'ai.runtime') throw new BadRequestException('Use the validated administrator AI configuration endpoint.');
    const existing = await this.repo.findOne({ where: { settingKey: input.key } });
    if (existing) {
      await this.repo.update(
        { settingKey: input.key },
        { value: input.value, ...(input.description !== undefined ? { description: input.description } : {}) },
      );
    } else {
      await this.repo.insert({
        settingKey: input.key,
        value: input.value,
        description: input.description ?? null,
      });
    }
    await this.audit.record({
      actorId: ctx.actorId ?? null,
      action: existing ? 'settings.updated' : 'settings.created',
      targetType: 'system_setting',
      targetId: input.key,
      detail: { key: input.key },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }
}
