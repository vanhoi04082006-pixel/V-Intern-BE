import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { PerformanceModule } from '../performance/performance.module';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { RbacModule } from '../rbac/rbac.module';
import { KpiMetricResult } from './entities/kpi-metric-result.entity';
import { KpiPeriod } from './entities/kpi-period.entity';
import { KpiResult } from './entities/kpi-result.entity';
import { KpiInternController, KpiPeriodsController, KpiResultsController } from './kpi.controller';
import { KpiService } from './kpi.service';

/**
 * Phase 5 — KPI module (spec 22-30): one-way flow Performance → KPI
 * (spec 55/56); KPI NEVER depends on salary or certificates.
 */
@Module({
  imports: [
    RbacModule,
    PerformanceModule,
    TypeOrmModule.forFeature([
      KpiPeriod,
      KpiResult,
      KpiMetricResult,
      RecruitmentProfile,
      Assignment,
      AuditLog,
      ActivityEvent,
      Notification,
      NotificationPreference,
    ]),
  ],
  controllers: [KpiPeriodsController, KpiResultsController, KpiInternController],
  providers: [KpiService],
  exports: [KpiService],
})
export class KpiModule {}
