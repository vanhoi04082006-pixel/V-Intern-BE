import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface RecordAuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit writer. Never redacts callers: failures are logged
 * server-side and swallowed so a broken audit sink cannot break business
 * operations (availability trumps audit completeness here; the error log
 * is the reconciliation source).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.repo.insert({
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        detail: input.detail === undefined ? null : JSON.stringify(input.detail),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      });
    } catch (err) {
      this.logger.error(
        `audit insert failed for action=${input.action}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async list(filters: {
    page: number;
    pageSize: number;
    actorId?: string;
    action?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ items: AuditLog[]; total: number }> {
    const qb = this.repo.createQueryBuilder('a');
    if (filters.actorId) qb.andWhere('a.actorId = :actorId', { actorId: filters.actorId });
    if (filters.action) qb.andWhere('a.action = :action', { action: filters.action });
    if (filters.from) qb.andWhere('a.createdAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('a.createdAt <= :to', { to: filters.to });
    qb.orderBy('a.createdAt', 'DESC')
      .skip((filters.page - 1) * filters.pageSize)
      .take(filters.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }
}
