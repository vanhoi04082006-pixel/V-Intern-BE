import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai.module';
import { AuditModule } from '../../audit/audit.module';
import { PerformanceModule } from '../../performance/performance.module';
import { RbacModule } from '../../rbac/rbac.module';
import { Evaluation } from '../../evaluation/entities/evaluation.entity';
import { EvaluationCycle } from '../../evaluation/entities/evaluation-cycle.entity';
import { EvaluationCriterion } from '../../evaluation/entities/evaluation-criterion.entity';
import { EvaluationScore } from '../../evaluation/entities/evaluation-score.entity';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';
import { RecruitmentProfile } from '../../recruitment/entities/recruitment-profile.entity';
import { EvaluationAiSuggestion } from './entities/evaluation-ai-suggestion.entity';
import { EvaluationAssistanceService } from './evaluation-assistance.service';
import { EvaluationAssistanceController } from './evaluation-assistance.controller';

/**
 * AI Evaluation Assistance module (Phase 6, spec 20-27) — instructor
 * workspace over the Phase-4 AI core. ZERO authority over evaluation data.
 */
@Module({
  imports: [
    AiModule,
    AuditModule,
    PerformanceModule,
    RbacModule,
    TypeOrmModule.forFeature([
      EvaluationAiSuggestion,
      Evaluation,
      EvaluationCycle,
      EvaluationCriterion,
      EvaluationScore,
      Task,
      User,
      RecruitmentProfile,
    ]),
  ],
  controllers: [EvaluationAssistanceController],
  providers: [EvaluationAssistanceService],
  exports: [EvaluationAssistanceService],
})
export class EvaluationAssistanceModule {}
