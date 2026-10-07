import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Project } from '../projects/entities/project.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { EvaluationCycle } from './entities/evaluation-cycle.entity';
import { EvaluationCriterion } from './entities/evaluation-criterion.entity';
import { EvaluationRevision } from './entities/evaluation-revision.entity';
import { EvaluationScore } from './entities/evaluation-score.entity';
import { Evaluation } from './entities/evaluation.entity';
import { EvaluationCyclesController, EvaluationInternController, EvaluationsController } from './evaluation.controller';
import { RbacModule } from '../rbac/rbac.module';
import { EvaluationService } from './evaluation.service';

/**
 * Phase 5 — Evaluation module (spec 5-15). All entities written INSIDE
 * evaluation transactions are registered so the transactional
 * EntityManager resolves them on the same connection.
 */
@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([
      EvaluationCycle,
      EvaluationCriterion,
      Evaluation,
      EvaluationScore,
      EvaluationRevision,
      Assignment,
      Project,
      SessionInstructor,
      AuditLog,
      ActivityEvent,
      Notification,
      NotificationPreference,
    ]),
  ],
  controllers: [EvaluationCyclesController, EvaluationsController, EvaluationInternController],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
