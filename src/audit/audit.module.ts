import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from './entities/activity-event.entity';
import { ActivityService } from './activity.service';
import { AuditLog } from './entities/audit-log.entity';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, ActivityEvent])],
  controllers: [AuditController],
  providers: [AuditService, ActivityService],
  exports: [AuditService, ActivityService],
})
export class AuditModule {}
