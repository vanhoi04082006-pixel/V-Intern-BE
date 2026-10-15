import { Module } from '@nestjs/common';
import { RecruitmentResult } from '../../recruitment/entities/recruitment-result.entity';
import { GithubModule } from '../../github/github.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai.module';
import { AuditModule } from '../../audit/audit.module';
import { PerformanceModule } from '../../performance/performance.module';
import { VirtualSalaryModule } from '../../salary/virtual-salary.module';
import { CertificatesModule } from '../../certificates/certificates.module';
import { User } from '../../users/entities/user.entity';
import { RecruitmentProfile } from '../../recruitment/entities/recruitment-profile.entity';
import { Assignment } from '../../assignments/entities/assignment.entity';
import { Project } from '../../projects/entities/project.entity';
import { InternshipSession } from '../../sessions/entities/internship-session.entity';
import { Sprint } from '../../sprints/entities/sprint.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Evaluation } from '../../evaluation/entities/evaluation.entity';
import { EvaluationScore } from '../../evaluation/entities/evaluation-score.entity';
import { EvaluationCriterion } from '../../evaluation/entities/evaluation-criterion.entity';
import { EvaluationCycle } from '../../evaluation/entities/evaluation-cycle.entity';
import { KpiResult } from '../../kpi/entities/kpi-result.entity';
import { KpiMetricResult } from '../../kpi/entities/kpi-metric-result.entity';
import { KpiPeriod } from '../../kpi/entities/kpi-period.entity';
import { AiMentorConversation } from './entities/ai-mentor-conversation.entity';
import { AiMentorMessage } from './entities/ai-mentor-message.entity';
import { AiMentorContextService } from './ai-mentor-context.service';
import { AiMentorService } from './ai-mentor.service';
import { AiMentorController } from './ai-mentor.controller';

/**
 * AI Mentor module (Phase 6, spec 7-19). Composes the AUTHORIZED context
 * builder (own data only) with the conversation persistence and the
 * Phase-4 AI core (the single provider abstraction — no second AI
 * framework, no direct vendor calls from domain code, spec 3/19).
 */
@Module({
  imports: [
    AiModule,
    GithubModule,
    AuditModule,
    PerformanceModule,
    VirtualSalaryModule,
    CertificatesModule,
    TypeOrmModule.forFeature([
      AiMentorConversation,
      AiMentorMessage,
      User,
      RecruitmentProfile,
      RecruitmentResult,
      Assignment,
      Project,
      InternshipSession,
      Sprint,
      Task,
      Evaluation,
      EvaluationScore,
      EvaluationCriterion,
      EvaluationCycle,
      KpiResult,
      KpiMetricResult,
      KpiPeriod,
    ]),
  ],
  controllers: [AiMentorController],
  providers: [AiMentorContextService, AiMentorService],
  exports: [AiMentorService],
})
export class AiMentorModule {}
