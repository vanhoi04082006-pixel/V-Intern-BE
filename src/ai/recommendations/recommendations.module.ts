import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai.module';
import { AuditModule } from '../../audit/audit.module';
import { PerformanceModule } from '../../performance/performance.module';
import { Evaluation } from '../../evaluation/entities/evaluation.entity';
import { EvaluationCriterion } from '../../evaluation/entities/evaluation-criterion.entity';
import { EvaluationScore } from '../../evaluation/entities/evaluation-score.entity';
import { KpiResult } from '../../kpi/entities/kpi-result.entity';
import { KpiPeriod } from '../../kpi/entities/kpi-period.entity';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';
import { RecruitmentProfile } from '../../recruitment/entities/recruitment-profile.entity';
import { AiRecommendationSnapshot } from './entities/ai-recommendation-snapshot.entity';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';

/**
 * AI Recommendations module (Phase 6, spec 28-35) — grounded in the
 * deterministic Phase-5 read model, persisted as explainable snapshots.
 */
@Module({
  imports: [
    AiModule,
    AuditModule,
    PerformanceModule,
    TypeOrmModule.forFeature([
      AiRecommendationSnapshot,
      Evaluation,
      EvaluationCriterion,
      EvaluationScore,
      KpiResult,
      KpiPeriod,
      Task,
      User,
      RecruitmentProfile,
    ]),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
