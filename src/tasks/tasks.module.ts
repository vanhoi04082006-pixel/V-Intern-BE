import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { RbacModule } from '../rbac/rbac.module';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Project } from '../projects/entities/project.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { User } from '../users/entities/user.entity';
import { Task } from './entities/task.entity';
import { TaskComment } from './entities/task-comment.entity';
import { TaskStatusHistory } from './entities/task-status-history.entity';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

/**
 * All entities written INSIDE task transactions are registered so the
 * transactional EntityManager resolves them on the same connection.
 * RbacModule provides PermissionsService for the assignee-OR-manage
 * access checks (DB-resolved, never role-name inference).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskComment,
      TaskStatusHistory,
      Sprint,
      Project,
      User,
      Assignment,
      Notification,
      NotificationPreference,
      AuditLog,
      ActivityEvent,
    ]),
    RbacModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
