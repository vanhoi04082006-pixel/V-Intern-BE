import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';

/** Canonical notification categories (missing preference row = enabled). */
export const NOTIFICATION_CATEGORIES = [
  'system',
  'task',
  'session',
  'evaluation',
  'announcement',
  'recruitment', // Phase 4 (spec 77): recruitment/interview/evaluation events
  'kpi', // Phase 5: KPI finalized
  'salary', // Phase 5: virtual salary generated/adjusted
  'certificate', // Phase 5: certificate issued/revoked
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotifyUsersInput {
  type: string;
  title: string;
  body?: string;
  linkUrl?: string;
  /** Preference category checked per user (defaults to `type`). */
  category?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationPreference) private readonly prefs: Repository<NotificationPreference>,
  ) {}

  async list(
    userId: string,
    q: { page: number; pageSize: number; unread?: boolean },
  ): Promise<{ items: Notification[]; total: number }> {
    const qb = this.notifications.createQueryBuilder('n');
    qb.where('n.userId = :userId', { userId });
    if (q.unread) qb.andWhere('n.readAt IS NULL');
    qb.orderBy('n.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notifications.count({ where: { userId, readAt: IsNull() } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const notification = await this.notifications.findOne({ where: { id } });
    if (!notification) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found.',
      });
    }
    if (notification.userId.toLowerCase() !== userId.toLowerCase()) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NOTIFICATION_FORBIDDEN',
        message: 'Notification belongs to another user.',
      });
    }
    if (notification.readAt === null) {
      await this.notifications.update(id, { readAt: new Date() });
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.notifications
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('userId = :userId AND readAt IS NULL', { userId })
      .execute();
    return result.affected ?? 0;
  }

  async preferences(userId: string): Promise<Array<{ category: string; enabled: boolean }>> {
    const rows = await this.prefs.find({ where: { userId } });
    const map = new Map(rows.map((r) => [r.category, r.enabled]));
    return NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      enabled: map.get(category) ?? true,
    }));
  }

  async setPreference(userId: string, category: string, enabled: boolean): Promise<void> {
    const existing = await this.prefs.findOne({ where: { userId, category } });
    if (existing) {
      await this.prefs.update({ userId, category }, { enabled });
    } else {
      await this.prefs.insert({ userId, category, enabled });
    }
  }

  /**
   * Fan-out notifications honoring per-user preferences.
   * Preference for `category` (default = `type`) missing = enabled.
   */
  async notifyUsers(
    userIds: string[],
    payload: NotifyUsersInput,
  ): Promise<{ sent: number; skipped: number }> {
    const unique = [...new Set(userIds.filter(Boolean).map(id => id.toLowerCase()))];
    if (unique.length === 0) return { sent: 0, skipped: 0 };

    const category = payload.category ?? payload.type;
    const rows = await this.prefs.find({ where: { userId: In(unique), category } });
    const disabled = new Set(rows.filter((r) => !r.enabled).map((r) => r.userId.toLowerCase()));
    const allowed = unique.filter((id) => !disabled.has(id));
    const skipped = unique.length - allowed.length;

    if (allowed.length > 0) {
      await this.notifications.insert(
        allowed.map((userId) => ({
          userId,
          type: payload.type,
          title: payload.title,
          body: payload.body ?? null,
          linkUrl: payload.linkUrl ?? null,
        })),
      );
    }
    return { sent: allowed.length, skipped };
  }
}
