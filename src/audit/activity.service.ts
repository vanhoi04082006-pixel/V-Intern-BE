import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEvent } from './entities/activity-event.entity';

export interface RecordActivityInput {
  actorId?: string | null;
  module: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  summary?: string | null;
}

/** User-facing activity feed writer (separate from the audit trail). */
@Injectable()
export class ActivityService {
  constructor(@InjectRepository(ActivityEvent) private readonly repo: Repository<ActivityEvent>) {}

  async record(input: RecordActivityInput): Promise<void> {
    try {
      await this.repo.insert({
        actorId: input.actorId ?? null,
        module: input.module,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        summary: input.summary ?? null,
      });
    } catch {
      // Activity feed is best-effort — never breaks business operations.
    }
  }

  async list(filters: {
    page: number;
    pageSize: number;
    actorId?: string;
    module?: string;
  }): Promise<{ items: ActivityEvent[]; total: number }> {
    const qb = this.repo.createQueryBuilder('e');
    if (filters.actorId) qb.andWhere('e.actorId = :actorId', { actorId: filters.actorId });
    if (filters.module) qb.andWhere('e.module = :module', { module: filters.module });
    qb.orderBy('e.createdAt', 'DESC')
      .skip((filters.page - 1) * filters.pageSize)
      .take(filters.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
