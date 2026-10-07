import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { Task } from '../tasks/entities/task.entity';
import { Project } from '../projects/entities/project.entity';
import { Sprint } from './entities/sprint.entity';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';

/**
 * All entities written INSIDE sprint transactions are registered so the
 * transactional EntityManager resolves them on the same connection.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sprint,
      Project,
      InternshipSession,
      Task,
      Assignment,
      Notification,
      NotificationPreference,
      AuditLog,
      ActivityEvent,
    ]),
  ],
  controllers: [SprintsController],
  providers: [SprintsService],
  exports: [SprintsService],
})
export class SprintsModule {}
