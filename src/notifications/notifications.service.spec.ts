import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import { NotificationsService, NOTIFICATION_CATEGORIES } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';

/**
 * Preference-filter + ownership coverage (mocked repos).
 * Missing preference row = enabled (default ON).
 */
function makeService(overrides: {
  prefs?: Array<Partial<NotificationPreference>>;
  notifications?: Array<Partial<Notification>>;
  inserted?: Array<Record<string, unknown>>;
  updated?: unknown[];
}) {
  const inserted: Array<Record<string, unknown>> = overrides.inserted ?? [];
  const notificationsRepo = {
    createQueryBuilder: jest.fn(() => {
      const qb: Record<string, jest.Mock> = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };
      return qb;
    }),
    count: jest.fn().mockResolvedValue(3),
    findOne: jest.fn(async (opts: { where: { id: string } }) => {
      const found = (overrides.notifications ?? []).find((n) => n.id === opts.where.id);
      return found ? ({ userId: 'u-1', readAt: null, ...found } as Notification) : null;
    }),
    update: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn(async (rows: Array<Record<string, unknown>>) => {
      inserted.push(...rows);
    }),
    find: jest.fn().mockResolvedValue([]),
  };
  const prefsRepo = {
    find: jest.fn(async () => (overrides.prefs ?? []) as NotificationPreference[]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue(undefined),
  };
  const service = new NotificationsService(
    notificationsRepo as unknown as Repository<Notification>,
    prefsRepo as unknown as Repository<NotificationPreference>,
  );
  return { service, notificationsRepo, prefsRepo, inserted };
}

describe('NotificationsService', () => {
  it('notifyUsers: missing preference row = enabled; disabled category = skipped', async () => {
    const { service, inserted } = makeService({
      prefs: [{ userId: 'u-off', category: 'system', enabled: false }],
    });
    const result = await service.notifyUsers(['u-off', 'u-on', 'u-default'], {
      type: 'system',
      title: 'Xin chào',
    });
    expect(result).toEqual({ sent: 2, skipped: 1 });
    expect(inserted.map((r) => r.userId).sort()).toEqual(['u-default', 'u-on']);
  });

  it('notifyUsers: empty input → nothing sent', async () => {
    const { service, inserted } = makeService({});
    expect(await service.notifyUsers([], { type: 'system', title: 'x' })).toEqual({ sent: 0, skipped: 0 });
    expect(inserted).toHaveLength(0);
  });

  it('preferences: missing rows resolve to enabled for every canonical category', async () => {
    const { service } = makeService({ prefs: [] });
    const prefs = await service.preferences('u-1');
    expect(prefs.map((p) => p.category)).toEqual([...NOTIFICATION_CATEGORIES]);
    expect(prefs.every((p) => p.enabled)).toBe(true);
  });

  it('markRead: other user’s notification → 403 NOTIFICATION_FORBIDDEN', async () => {
    const { service } = makeService({ notifications: [{ id: 'n-1', userId: 'u-other' }] });
    let caught: unknown;
    try {
      await service.markRead('u-1', 'n-1');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    const body = (caught as ForbiddenException).getResponse() as Record<string, unknown>;
    expect(body.code).toBe('NOTIFICATION_FORBIDDEN');
  });

  it('markRead: unknown notification → 404', async () => {
    const { service } = makeService({});
    let caught: unknown;
    try {
      await service.markRead('u-1', 'missing');
    } catch (err) {
      caught = err;
    }
    expect((caught as { status?: number }).status ?? (caught as { getStatus: () => number }).getStatus?.()).toBe(404);
  });

  it('unreadCount counts readAt IS NULL (mocked)', async () => {
    const { service, notificationsRepo } = makeService({});
    expect(await service.unreadCount('u-1')).toBe(3);
    expect(notificationsRepo.count).toHaveBeenCalledWith({ where: { userId: 'u-1', readAt: IsNull() } });
  });
});
