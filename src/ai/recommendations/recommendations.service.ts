import { ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { AiService } from '../ai.service';
import { aiErrorCode } from '../ai-errors';
import { Evaluation } from '../../evaluation/entities/evaluation.entity';
import { EvaluationCriterion } from '../../evaluation/entities/evaluation-criterion.entity';
import { EvaluationScore } from '../../evaluation/entities/evaluation-score.entity';
import { KpiResult } from '../../kpi/entities/kpi-result.entity';
import { KpiPeriod } from '../../kpi/entities/kpi-period.entity';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';
import { RecruitmentProfile } from '../../recruitment/entities/recruitment-profile.entity';
import { PerformanceService } from '../../performance/performance.service';
import { AiRecommendationSnapshot } from './entities/ai-recommendation-snapshot.entity';
import {
  RECOMMENDATION_PROMPT_VERSION,
  RECOMMENDATION_TASK,
  RecommendationSourceFacts,
  buildRecommendationInput,
  buildRecommendationSystemPrompt,
} from './recommendations-prompt';
import { RecommendationData, validateRecommendations } from './recommendations-schema';

export interface ActorContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const notFound = (code: string, message: string) =>
  new NotFoundException({ statusCode: 404, code, message });
const forbidden = (code: string, message: string) =>
  new ForbiddenException({ statusCode: 403, code, message });
const aiFailure = (code: string, message: string, details?: Record<string, unknown>) =>
  new ServiceUnavailableException({
    statusCode: 503,
    code,
    message,
    ...(details ? { details } : {}),
  });

/**
 * RECOMMENDATION_SOURCE_SCHEMA_VERSION (spec 34) — bump when the shape of
 * RecommendationSourceFacts changes; it is part of the hashed payload so a
 * schema change can never silently reuse an older snapshot.
 */
export const RECOMMENDATION_SOURCE_SCHEMA_VERSION = 1;

/**
 * RecommendationsService (Phase 6, spec 28-35) — metric-grounded,
 * snapshot-persisted development recommendations.
 *
 * DETERMINISM (spec 34/35):
 * - source facts are computed by the SAME deterministic Phase-5 read model;
 * - sourceHash = sha256(stableStringify(facts)) — identical facts produce
 *   an identical hash, and refresh REUSES the latest snapshot (no provider
 *   call) while facts are unchanged;
 * - facts always carry the schema version; null metrics stay null
 *   (unavailable — never 0).
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectRepository(AiRecommendationSnapshot) private readonly snapshots: Repository<AiRecommendationSnapshot>,
    @InjectRepository(Evaluation) private readonly evaluations: Repository<Evaluation>,
    @InjectRepository(EvaluationCriterion) private readonly criteria: Repository<EvaluationCriterion>,
    @InjectRepository(EvaluationScore) private readonly scores: Repository<EvaluationScore>,
    @InjectRepository(KpiResult) private readonly kpiResults: Repository<KpiResult>,
    @InjectRepository(KpiPeriod) private readonly kpiPeriods: Repository<KpiPeriod>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RecruitmentProfile) private readonly recruitmentProfiles: Repository<RecruitmentProfile>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly performanceService: PerformanceService,
    private readonly aiService: AiService,
    private readonly auditService: AuditService,
  ) {}

  /** Latest persisted snapshot for the intern (404 when none — spec 33). */
  async latestOwn(userId: string) {
    const row = await this.snapshots.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!row) {
      throw notFound(
        'AI_RECOMMENDATION_NOT_AVAILABLE',
        'No AI recommendations have been generated yet. Use the refresh endpoint first.',
      );
    }
    return this.toDto(row, { reused: false });
  }

  /**
   * Refresh (spec 35): compute source facts + hash. When the hash matches
   * the latest snapshot the EXISTING snapshot is returned WITHOUT a new
   * provider call; otherwise a new AI run + snapshot is persisted.
   */
  async refresh(principal: { userId: string; isAdmin: boolean }, targetUserId: string, ctx: ActorContext) {
    if (targetUserId !== principal.userId && !principal.isAdmin) {
      // Instructor scoped view goes through the ownership-checked method
      // below; direct refresh for another user is forbidden here (spec 33).
      throw forbidden('AI_RECOMMENDATION_FORBIDDEN', 'You can only refresh your own recommendations.');
    }
    const facts = await this.buildSourceFacts(targetUserId);
    const sourceHash = this.sourceHash(facts);
    const latest = await this.snapshots.findOne({
      where: { userId: targetUserId },
      order: { createdAt: 'DESC' },
    });
    if (latest && latest.sourceHash === sourceHash) {
      // Source facts unchanged — deterministic reuse, no provider call
      // (spec 35: never call the provider repeatedly for identical input).
      return this.toDto(latest, { reused: true });
    }

    let recommendation: RecommendationData;
    let runId: string | null = null;
    try {
      const result = await this.aiService.generateStructuredWithRun<RecommendationData>({
        feature: RECOMMENDATION_TASK,
        userId: targetUserId,
        resourceType: 'ai_recommendation_snapshot',
        resourceId: targetUserId,
        promptVersion: RECOMMENDATION_PROMPT_VERSION,
        request: {
          task: RECOMMENDATION_TASK,
          systemPrompt: buildRecommendationSystemPrompt(),
          input: buildRecommendationInput(facts),
          schemaName: 'Recommendations',
          validate: validateRecommendations,
          modelOptions: { temperature: 0.3, maxOutputTokens: 4096 },
        },
      });
      recommendation = result.data;
      runId = result.run.id;
    } catch (err) {
      const code = aiErrorCode(err);
      this.logger.warn(`AI recommendation failed for user ${targetUserId}: ${code}`);
      throw aiFailure(
        code,
        'The AI recommendation service is temporarily unavailable. Try again shortly.',
        err instanceof Error && 'reason' in err ? { reason: (err as { reason?: string }).reason } : undefined,
      );
    }

    const row = await this.snapshots.save(
      this.snapshots.create({
        userId: targetUserId,
        aiRunId: runId,
        scope: 'intern_own',
        promptVersion: RECOMMENDATION_PROMPT_VERSION,
        sourceHash,
        sourceSnapshotJson: JSON.stringify(facts),
        recommendationsJson: JSON.stringify(recommendation),
      }),
    );
    await this.auditService.record({
      actorId: principal.userId,
      action: 'ai_recommendation.generated',
      targetType: 'ai_recommendation_snapshot',
      targetId: row.id,
      detail: { userId: targetUserId, sourceHash, aiRunId: runId },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return this.toDto(row, { reused: false });
  }

  /**
   * Instructor scoped read (spec 33) — strict ownership: the instructor
   * must manage the intern's session (session instructor) or project
   * (project mentor). Role alone is never sufficient (spec 64).
   */
  async latestForInstructor(principal: { userId: string; isAdmin: boolean }, targetUserId: string) {
    if (!principal.isAdmin && principal.userId !== targetUserId) {
      const authorized = await this.hasInternScopeAuthority(principal.userId, targetUserId);
      if (!authorized) {
        throw forbidden(
          'PERFORMANCE_SCOPE_FORBIDDEN',
          'You do not manage this intern.',
        );
      }
    }
    const row = await this.snapshots.findOne({
      where: { userId: targetUserId },
      order: { createdAt: 'DESC' },
    });
    if (!row) {
      throw notFound('AI_RECOMMENDATION_NOT_AVAILABLE', 'No AI recommendations exist for this intern yet.');
    }
    return this.toDto(row, { reused: false });
  }

  // ─────────────────────────── internals ───────────────────────────────

  /**
   * Deterministic source facts (spec 30) — same read model as Phase 5;
   * absent facts stay null (unavailable ≠ 0, spec 43).
   */
  private async buildSourceFacts(userId: string): Promise<RecommendationSourceFacts> {
    const [user, profile, own] = await Promise.all([
      this.users.findOne({ where: { id: userId } }),
      this.recruitmentProfiles.findOne({ where: { userId } }),
      this.performanceService.ownMetrics(userId, {}),
    ]);
    const ownTasks = await this.tasks.find({
      where: { assigneeId: userId, deletedAt: IsNull() },
    });
    const taskStatusCounts = { todo: 0, doing: 0, review: 0, done: 0 };
    for (const t of ownTasks) taskStatusCounts[t.status] += 1;

    const latestKpi = await this.kpiResults
      .createQueryBuilder('r')
      .innerJoin(KpiPeriod, 'p', 'p.id = r.periodId')
      .where('r.userId = :userId', { userId })
      .andWhere('p.status = :status', { status: 'finalized' })
      .orderBy('r.calculatedAt', 'DESC')
      .getOne();
    let kpi: RecommendationSourceFacts['kpi'] = null;
    if (latestKpi) {
      const period = await this.kpiPeriods.findOne({ where: { id: latestKpi.periodId } });
      kpi = {
        periodCode: period?.code ?? '',
        ruleVersion: latestKpi.ruleVersion,
        status: latestKpi.status,
        finalScore: latestKpi.finalScore === null ? null : Number(latestKpi.finalScore),
      };
    }

    const latestEvaluation = await this.evaluations.findOne({
      where: { internId: userId, status: 'finalized' },
      order: { finalizedAt: 'DESC' },
    });
    let latestEvaluationCriteria: RecommendationSourceFacts['latestEvaluationCriteria'] = null;
    if (latestEvaluation) {
      const scoreRows = await this.scores.find({ where: { evaluationId: latestEvaluation.id } });
      const criterionIds = scoreRows.map((s) => s.criterionId);
      const criteriaRows = criterionIds.length
        ? await this.criteria.find({ where: criterionIds.map((id) => ({ id })) })
        : [];
      const byId = new Map(criteriaRows.map((c) => [c.id, c]));
      latestEvaluationCriteria = scoreRows
        .map((s) => {
          const c = byId.get(s.criterionId);
          return {
            code: c?.code ?? '',
            score: Number(s.score),
            weight: c ? Number(c.weight) : 0,
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code));
    }

    return {
      intern: {
        displayName: user?.displayName ?? '',
        recruitmentRole: profile?.selectedRole ?? null,
      },
      metrics: {
        completedTaskCount: own.metrics.completedTaskCount,
        totalTaskCount: own.metrics.totalTaskCount,
        taskCompletionRate: own.metrics.taskCompletionRate,
        storyPointCompletionRate: own.metrics.storyPointCompletionRate,
        onTimeCompletionRate: own.metrics.onTimeCompletionRate,
        averageEvaluationScore: own.metrics.averageEvaluationScore,
        overdueOpenTaskCount: own.metrics.overdueOpenTaskCount,
        completedStoryPoints: own.metrics.completedStoryPoints,
        committedStoryPoints: own.metrics.committedStoryPoints,
        activeSprintProgress: own.metrics.activeSprintProgress,
      },
      kpi,
      latestEvaluationCriteria,
      taskStatusCounts,
    };
  }

  /** sha256 over a key-sorted canonical serialization (spec 35). */
  private sourceHash(facts: RecommendationSourceFacts): string {
    const canonical = stableStringify({ schemaVersion: RECOMMENDATION_SOURCE_SCHEMA_VERSION, facts });
    return createHash('sha256').update(canonical).digest('hex');
  }

  /** Session instructor of the intern's session or mentor of their project. */
  private async hasInternScopeAuthority(instructorId: string, internId: string): Promise<boolean> {
    const sessionHit = await this.dataSource.query(
      `SELECT 1 AS ok FROM session_instructors si
         WHERE si.userId = @0
           AND EXISTS (SELECT 1 FROM assignments a WHERE a.internId = @1 AND a.sessionId = si.sessionId)`,
      [instructorId, internId],
    );
    if (Array.isArray(sessionHit) && sessionHit.length > 0) return true;
    const projectHit = await this.dataSource.query(
      `SELECT 1 AS ok FROM projects p
         WHERE p.mentorId = @0
           AND EXISTS (SELECT 1 FROM assignments a WHERE a.internId = @1 AND a.projectId = p.id)`,
      [instructorId, internId],
    );
    return Array.isArray(projectHit) && projectHit.length > 0;
  }

  private toDto(row: AiRecommendationSnapshot, meta: { reused: boolean }) {
    return {
      id: row.id,
      userId: row.userId,
      aiRunId: row.aiRunId,
      scope: row.scope,
      promptVersion: row.promptVersion,
      sourceHash: row.sourceHash,
      sourceFacts: JSON.parse(row.sourceSnapshotJson) as RecommendationSourceFacts,
      recommendations: JSON.parse(row.recommendationsJson) as RecommendationData,
      createdAt: row.createdAt,
      reused: meta.reused,
    };
  }
}

/**
 * Canonical JSON: object keys sorted recursively, arrays in order. Both
 * snapshot hashing and reuse lookups depend on this stability.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
