import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { AiRun } from '../ai/entities/ai-run.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { InterviewAnswer } from './entities/interview-answer.entity';
import { InterviewQuestion } from './entities/interview-question.entity';
import { InterviewSession } from './entities/interview-session.entity';
import { InterviewSessionQuestion } from './entities/interview-session-question.entity';
import { RecruitmentProfile } from './entities/recruitment-profile.entity';
import { RecruitmentResult } from './entities/recruitment-result.entity';
import { InterviewService } from './interview.service';
import { RecruitmentController } from './recruitment.controller';
import { RecruitmentEvaluationService } from './recruitment-evaluation.service';
import { RecruitmentRateLimitGuard } from './recruitment-rate-limit.guard';
import { RecruitmentService } from './recruitment.service';

/**
 * Phase 4 — Recruitment + AI interview module (spec 3).
 * All entities written INSIDE recruitment transactions are registered so
 * the transactional EntityManager resolves them on the same connection.
 */
@Module({
  imports: [
    AiModule,
    TypeOrmModule.forFeature([
      RecruitmentProfile,
      InterviewQuestion,
      InterviewSession,
      InterviewSessionQuestion,
      InterviewAnswer,
      RecruitmentResult,
      AiRun,
      AuditLog,
      ActivityEvent,
      Notification,
      NotificationPreference,
    ]),
  ],
  controllers: [RecruitmentController],
  providers: [RecruitmentService, InterviewService, RecruitmentEvaluationService, RecruitmentRateLimitGuard],
  exports: [RecruitmentService, InterviewService],
})
export class RecruitmentModule {}
