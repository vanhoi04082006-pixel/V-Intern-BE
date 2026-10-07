import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { KpiModule } from '../kpi/kpi.module';
import { KpiPeriod } from '../kpi/entities/kpi-period.entity';
import { KpiResult } from '../kpi/entities/kpi-result.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { SettingsModule } from '../settings/settings.module';
import { VirtualSalaryLedger } from './entities/virtual-salary-ledger.entity';
import { VirtualSalaryController, VirtualSalaryInternController } from './virtual-salary.controller';
import { VirtualSalaryService } from './virtual-salary.service';

/**
 * Phase 5 — Virtual salary module (spec 31-40). One-way flow KPI → salary
 * (spec 56): the ledger consumes FINALIZED kpi_results and never the
 * other way around.
 */
@Module({
  imports: [
    KpiModule,
    SettingsModule,
    TypeOrmModule.forFeature([
      VirtualSalaryLedger,
      KpiPeriod,
      KpiResult,
      AuditLog,
      ActivityEvent,
      Notification,
      NotificationPreference,
    ]),
  ],
  controllers: [VirtualSalaryController, VirtualSalaryInternController],
  providers: [VirtualSalaryService],
  exports: [VirtualSalaryService],
})
export class VirtualSalaryModule {}
