import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { LEARNING_ALERTS_CTE } from './learning-alert-query';
interface LearningAlert { eventKey: string; userId: string; category: string; eventType: string; title: string; body: string; route: string; basePath: string }
interface ScanResult { created: number; muted: number; processed: number; busy: boolean }
@Injectable()
export class LearningAlertsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LearningAlertsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastScanAt: string | null = null;
  private lastResult: ScanResult | null = null;
  private lastErrorCode: string | null = null;
  constructor(private readonly db: DataSource, private readonly config: ConfigService) {}
  status() {
    const configured = Number(this.config.get('LEARNING_ALERTS_INTERVAL_SECONDS', 60));
    return { enabled: this.config.get('NODE_ENV') !== 'test' && this.config.get('LEARNING_ALERTS_ENABLED', 'true') !== 'false',
      intervalSeconds: Number.isFinite(configured) ? Math.min(3600, Math.max(30, configured)) : 60,
      running: this.running, lastScanAt: this.lastScanAt, lastResult: this.lastResult, lastErrorCode: this.lastErrorCode };
  }
  onApplicationBootstrap(): void {
    const { enabled, intervalSeconds } = this.status();
    if (!enabled) return;
    const run = () => void this.scan().catch(() => this.logger.error('Learning alert scan failed; check database connectivity and applied migrations.'));
    this.timer = setInterval(run, intervalSeconds * 1000); this.timer.unref(); run();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
  async scan(): Promise<ScanResult> {
    if (this.running) return { created: 0, muted: 0, processed: 0, busy: true };
    this.running = true;
    try {
      const rows: LearningAlert[] = await this.db.query(`${LEARNING_ALERTS_CTE} SELECT TOP(100) e.*,staff.basePath FROM events e JOIN staff ON staff.id=e.userId
        WHERE NOT EXISTS(SELECT 1 FROM learning_alert_dispatches d WHERE d.eventKey=e.eventKey AND d.userId=e.userId) ORDER BY e.eventKey,e.userId`);
      let created = 0, muted = 0;
      for (const candidate of rows) {
        const result = await this.db.transaction(async em => {
          const prior = await em.query('SELECT eventKey FROM learning_alert_dispatches WITH(UPDLOCK,HOLDLOCK) WHERE eventKey=@0 AND userId=@1', [candidate.eventKey, candidate.userId]);
          if (prior.length) return 'duplicate';
          const [event]: LearningAlert[] = await em.query(`${LEARNING_ALERTS_CTE} SELECT TOP(1) e.*,staff.basePath FROM events e JOIN staff ON staff.id=e.userId WHERE e.eventKey=@0 AND e.userId=@1`, [candidate.eventKey, candidate.userId]);
          if (!event) return 'stale';
          const preference = await em.getRepository(NotificationPreference).findOneBy({ userId: event.userId, category: event.category });
          const notification = preference?.enabled === false ? null : await em.getRepository(Notification).save({ userId: event.userId, type: event.eventType, title: event.title, body: event.body, linkUrl: event.basePath + event.route });
          await em.query('INSERT INTO learning_alert_dispatches(eventKey,userId,notificationId) VALUES(@0,@1,@2)', [event.eventKey, event.userId, notification?.id ?? null]);
          return notification ? 'created' : 'muted';
        });
        if (result === 'created') created++; if (result === 'muted') muted++;
      }
      this.lastErrorCode = null;
      this.lastResult = { created, muted, processed: rows.length, busy: false };
      return this.lastResult;
    } catch (error) {
      this.lastErrorCode = 'LEARNING_ALERT_SCAN_FAILED';
      throw error;
    } finally { this.lastScanAt = new Date().toISOString(); this.running = false; }
  }
}
