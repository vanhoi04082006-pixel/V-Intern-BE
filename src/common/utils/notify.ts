import { EntityManager, In } from 'typeorm';
import { Notification } from '../../notifications/entities/notification.entity';
import { NotificationPreference } from '../../notifications/entities/notification-preference.entity';

/**
 * Transaction-safe notification fan-out (Phase 5): preference check + row
 * inserts happen on the CALLER's EntityManager so notifications are
 * atomic with the business change (spec 69 — no partial state).
 * Missing preference row = enabled (the canonical notifications rule).
 */
export async function notifyInTransaction(
  em: EntityManager,
  userIds: string[],
  payload: { type: string; title: string; body?: string; linkUrl?: string; category: string },
): Promise<number> {
  const unique = [...new Set(userIds)].filter((id) => id && id.length > 0);
  if (unique.length === 0) return 0;
  const prefs = await em.getRepository(NotificationPreference).find({
    where: { userId: In(unique), category: payload.category },
  });
  const disabled = new Set(prefs.filter((p) => !p.enabled).map((p) => p.userId));
  const allowed = unique.filter((id) => !disabled.has(id));
  if (allowed.length === 0) return 0;
  await em.insert(
    Notification,
    allowed.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      linkUrl: payload.linkUrl ?? null,
    })),
  );
  return allowed.length;
}
