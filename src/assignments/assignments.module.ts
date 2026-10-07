import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionMember } from '../sessions/entities/session-member.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { User } from '../users/entities/user.entity';
import { Assignment } from './entities/assignment.entity';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

/**
 * All entities written INSIDE the assignment transaction are registered so
 * the transactional EntityManager resolves them on the same connection.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Assignment,
      User,
      Project,
      ProjectMember,
      InternshipSession,
      SessionMember,
      Notification,
      NotificationPreference,
      AuditLog,
      ActivityEvent,
    ]),
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
