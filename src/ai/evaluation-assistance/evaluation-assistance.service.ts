import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, IsNull, Not } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { AiService } from '../ai.service';
import { aiErrorCode } from '../ai-errors';
import { Evaluation } from '../../evaluation/entities/evaluation.entity';
import { EvaluationCycle } from '../../evaluation/entities/evaluation-cycle.entity';
import { EvaluationCriterion } from '../../evaluation/entities/evaluation-criterion.entity';
import { EvaluationScore } from '../../evaluation/entities/evaluation-score.entity';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';
import { RecruitmentProfile } from '../../recruitment/entities/recruitment-profile.entity';
import { PerformanceService } from '../../performance/performance.service';
import { PermissionsService } from '../../rbac/permissions.service';
import { EvaluationAiSuggestion } from './entities/evaluation-ai-suggestion.entity';
import { generateSuggestionWithRepair } from './suggestion-repair';
import {
  EVALUATION_ASSISTANCE_PROMPT_VERSION,
  EVALUATION_ASSISTANCE_TASK,
  buildEvaluationAssistanceInput,
  buildEvaluationAssistanceSystemPrompt,
} from './evaluation-assistance-prompt';
import {
  EvaluationSuggestionData,
  SuggestionCriterionContext,
  validateEvaluationSuggestion,
} from './evaluation-suggestion-schema';

export interface ActorContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const notFound = (code: string, message: string) =>
  new NotFoundException({ statusCode: 404, code, message });
const forbidden = (code: string, message: string) =>
  new ForbiddenException({ statusCode: 403, code, message });
const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new ConflictException({ statusCode: 409, code, message, ...(details ? { details } : {}) });
const aiFailure = (code: string, message: string, details?: Record<string, unknown>) =>
  new ServiceUnavailableException({
    statusCode: 503,
    code,
    message,
    ...(details ? { details } : {}),
  });

const OPEN_TASK_LIMIT = 5;
const PREVIOUS_EVALUATION_LIMIT = 3;

/**
 * EvaluationAssistanceService (Phase 6, spec 20-27) — AI DRAFT suggestions
 * for the instructor's evaluation workspace.
 *
 * AUTHORITY BOUNDARY (spec 24/47 — enforced by construction):
 * - suggestions live ONLY in evaluation_ai_suggestions (append-only);
 * - NOTHING here writes evaluation_scores / evaluations;
 * - applying values is the instructor's explicit act through the normal
 *   authorized EvaluationService flow (not implemented as an AI apply —
 *   the UI edits from the suggestion, per spec 26).
 *
 * OWNERSHIP (spec 27/48/64): generation/reading is allowed for the
 * evaluator-of-record or an admin ONLY. Any other instructor → 403
 * AI_EVALUATION_NOT_ALLOWED; interns hold no ai.evaluation.assist
 * permission at all (guard-level 403).
 */
@Injectable()
export class EvaluationAssistanceService {
  private readonly logger = new Logger(EvaluationAssistanceService.name);

  constructor(
    @InjectRepository(EvaluationAiSuggestion) private readonly suggestions: Repository<EvaluationAiSuggestion>,
    @InjectRepository(Evaluation) private readonly evaluations: Repository<Evaluation>,
    @InjectRepository(EvaluationCycle) private readonly cycles: Repository<EvaluationCycle>,
    @InjectRepository(EvaluationCriterion) private readonly criteria: Repository<EvaluationCriterion>,
    @InjectRepository(EvaluationScore) private readonly scores: Repository<EvaluationScore>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RecruitmentProfile) private readonly recruitmentProfiles: Repository<RecruitmentProfile>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly aiService: AiService,
    private readonly performanceService: PerformanceService,
    private readonly auditService: AuditService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Generate a NEW suggestion version (spec 25 — regeneration appends
   * history; nothing is overwritten in place).
   */
  async generate(principal: { userId: string; isAdmin: boolean }, evaluationId: string, ctx: ActorContext) {
    const evaluation = await this.evaluations.findOne({ where: { id: evaluationId } });
    if (!evaluation) {
      throw notFound('EVALUATION_NOT_FOUND', 'Evaluation not found.');
    }
    await this.assertOwnership(principal, evaluation);

    if (evaluation.status === 'finalized') {
      // The authoring window is closed — finalized evaluations remain
      // Phase-5-authoritative (revision path handles corrections).
      throw conflict(
        'EVALUATION_ALREADY_FINALIZED',
        'This evaluation is finalized; AI suggestions are only available while authoring (draft/submitted).',
      );
    }

    const cycle = await this.cycles.findOne({ where: { id: evaluation.cycleId } });
    if (!cycle) {
      throw notFound('EVALUATION_CYCLE_NOT_FOUND', 'Evaluation cycle not found.');
    }
    const criteria = await this.criteria.find({
      where: { cycleId: cycle.id },
      order: { sortOrder: 'ASC' },
    });
    if (criteria.length === 0) {
      throw conflict(
        'EVALUATION_CRITERIA_INCOMPLETE',
        'The cycle has no criteria to suggest against.',
      );
    }

    // ── Deterministic backend facts (spec 21/22 — the AI computes NOTHING) ──
    const [intern, profile, ownPerformance, existingScores, previous] = await Promise.all([
      this.users.findOne({ where: { id: evaluation.internId } }),
      this.recruitmentProfiles.findOne({ where: { userId: evaluation.internId } }),
      this.performanceService.ownMetrics(evaluation.internId, {}),
      this.scores.find({ where: { evaluationId: evaluation.id } }),
      this.evaluations.find({
        where: { internId: evaluation.internId, status: 'finalized', id: Not(evaluation.id) },
        order: { finalizedAt: 'DESC' },
        take: PREVIOUS_EVALUATION_LIMIT,
      }),
    ]);
    const openTasks = await this.tasks.find({
      where: [
        { assigneeId: evaluation.internId, status: In(['todo', 'doing', 'review']), deletedAt: IsNull() },
      ],
      order: { dueDate: 'ASC' },
      take: OPEN_TASK_LIMIT,
    });
    const previousRows = await Promise.all(
      previous.map(async (p) => {
        const pCycle = await this.cycles.findOne({ where: { id: p.cycleId } });
        return { cycleCode: pCycle?.code ?? '', overallScore: Number(p.overallScore ?? 0) };
      }),
    );
    const criterionById = new Map(criteria.map((c) => [c.id, c]));
    const input = buildEvaluationAssistanceInput({
      cycleCode: cycle.code,
      cycleName: cycle.name,
      evaluationStatus: evaluation.status,
      existingScores: existingScores.map((s) => ({
        criterionCode: criterionById.get(s.criterionId)?.code ?? '',
        score: Number(s.score),
        comment: s.comment ?? null,
      })),
      existingSummary: evaluation.summary ?? null,
      internDisplayName: intern?.displayName ?? '',
      internRecruitmentRole: profile?.selectedRole ?? null,
      criteria: criteria.map((c) => ({
        code: c.code,
        name: c.name,
        weight: Number(c.weight),
        maxScore: Number(c.maxScore),
        description: c.description ?? null,
      })),
      metrics: ownPerformance.metrics,
      openTasks: openTasks.map((t) => ({
        code: t.code,
        title: t.title,
        status: t.status,
        storyPoints: t.storyPoints ?? null,
        overdue: t.dueDate !== null && t.dueDate.getTime() < Date.now(),
      })),
      previousFinalizedEvaluations: previousRows,
    });

    // ── AI run (provenance inside AiService) + strict validation ─────────
    let suggestion: EvaluationSuggestionData;
    let runId: string | null = null;
    try {
      const result = await generateSuggestionWithRepair(this.aiService, {
        feature: EVALUATION_ASSISTANCE_TASK,
        userId: evaluation.internId,
        actorId: principal.userId,
        resourceType: 'evaluation',
        resourceId: evaluation.id,
        promptVersion: EVALUATION_ASSISTANCE_PROMPT_VERSION,
        request: {
          task: EVALUATION_ASSISTANCE_TASK,
          systemPrompt: buildEvaluationAssistanceSystemPrompt(),
          input: { evaluationContext: input },
          schemaName: 'EvaluationSuggestion',
          validate: (raw) =>
            validateEvaluationSuggestion(
              raw,
              criteria.map<SuggestionCriterionContext>((c) => ({
                code: c.code,
                maxScore: Number(c.maxScore),
              })),
            ),
          modelOptions: { temperature: 0.2, maxOutputTokens: 4096 },
        },
      });
      suggestion = result.data;
      runId = result.run.id;
    } catch (err) {
      const code = aiErrorCode(err);
      this.logger.warn(`AI evaluation assistance failed for evaluation ${evaluation.id}: ${code}`);
      throw aiFailure(
        code,
        'The AI evaluation assistant is temporarily unavailable. Try again shortly.',
        err instanceof Error && 'reason' in err ? { reason: (err as { reason?: string }).reason } : undefined,
      );
    }

    // ── Append-only persistence (spec 25) + audit ────────────────────────
    const row = await this.suggestions.save(
      this.suggestions.create({
        evaluationId: evaluation.id,
        aiRunId: runId,
        promptVersion: EVALUATION_ASSISTANCE_PROMPT_VERSION,
        status: 'generated' as const,
        suggestionJson: JSON.stringify(suggestion),
      }),
    );
    await this.auditService.record({
      actorId: principal.userId,
      action: 'ai_evaluation.suggestion_generated',
      targetType: 'evaluation',
      targetId: evaluation.id,
      detail: { suggestionId: row.id, aiRunId: runId },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return this.toDto(row);
  }

  /** Suggestion history for ONE evaluation (ownership enforced, spec 27). */
  async listSuggestions(principal: { userId: string; isAdmin: boolean }, evaluationId: string) {
    const evaluation = await this.evaluations.findOne({ where: { id: evaluationId } });
    if (!evaluation) {
      throw notFound('EVALUATION_NOT_FOUND', 'Evaluation not found.');
    }
    await this.assertOwnership(principal, evaluation);
    const rows = await this.suggestions.find({
      where: { evaluationId: evaluation.id },
      order: { createdAt: 'DESC' },
    });
    return { items: rows.map((r) => this.toDto(r)) };
  }

  async getSuggestion(
    principal: { userId: string; isAdmin: boolean },
    evaluationId: string,
    suggestionId: string,
  ) {
    const evaluation = await this.evaluations.findOne({ where: { id: evaluationId } });
    if (!evaluation) {
      throw notFound('EVALUATION_NOT_FOUND', 'Evaluation not found.');
    }
    await this.assertOwnership(principal, evaluation);
    const row = await this.suggestions.findOne({
      where: { id: suggestionId, evaluationId: evaluation.id },
    });
    if (!row) {
      throw notFound('AI_EVALUATION_SUGGESTION_NOT_FOUND', 'AI suggestion not found.');
    }
    return this.toDto(row);
  }

  // ─────────────────────────── internals ───────────────────────────────

  /** Evaluator-of-record or admin; everyone else → 403 (spec 27/48/64). */
  private async assertOwnership(
    principal: { userId: string; isAdmin: boolean },
    evaluation: Evaluation,
  ): Promise<void> {
    if (principal.isAdmin) return;
    if (evaluation.evaluatorId === principal.userId) return;
    // Secondary authorization path (Phase-5 ownership model): an
    // evaluations.manage holder who manages the intern's session/project
    // may assist only if they could legally manage the evaluation itself.
    const permissionCodes = await this.permissionsService.getEffectivePermissionCodes(principal.userId);
    if (permissionCodes.has('evaluations.manage') && (await this.hasScopeAuthority(principal.userId, evaluation))) {
      return;
    }
    throw forbidden(
      'AI_EVALUATION_NOT_ALLOWED',
      'AI evaluation assistance is restricted to the evaluation\'s evaluator (or an administrator).',
    );
  }

  /**
   * Scope authority mirrors Phase 5's evaluation ownership: session
   * instructor of the evaluation's session, or project mentor of its
   * project. The ROLE alone is never sufficient (spec 64).
   */
  private async hasScopeAuthority(userId: string, evaluation: Evaluation): Promise<boolean> {
    if (evaluation.sessionId) {
      const sessionInstructor = await this.dataSource.query(
        `SELECT 1 AS ok FROM session_instructors WHERE sessionId = @0 AND instructorId = @1`,
        [evaluation.sessionId, userId],
      );
      if (Array.isArray(sessionInstructor) && sessionInstructor.length > 0) return true;
    }
    if (evaluation.projectId) {
      const project = await this.dataSource.query(
        `SELECT 1 AS ok FROM projects WHERE id = @0 AND mentorId = @1`,
        [evaluation.projectId, userId],
      );
      if (Array.isArray(project) && project.length > 0) return true;
    }
    return false;
  }

  private toDto(row: EvaluationAiSuggestion) {
    return {
      id: row.id,
      evaluationId: row.evaluationId,
      aiRunId: row.aiRunId,
      promptVersion: row.promptVersion,
      status: row.status,
      suggestion: JSON.parse(row.suggestionJson) as EvaluationSuggestionData,
      generatedAt: row.createdAt,
      acceptedAt: row.acceptedAt,
      acceptedById: row.acceptedById,
    };
  }
}
