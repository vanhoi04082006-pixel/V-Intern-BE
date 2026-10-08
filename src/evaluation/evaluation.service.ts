import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { scoreToTenths, tenthsToOneDecimal, weightToBasisPoints, weightedOverallTenths } from '../common/utils/score-math';
import { notifyInTransaction } from '../common/utils/notify';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Project } from '../projects/entities/project.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import {
  canTransitionEvaluation,
  canTransitionEvaluationCycle,
  EVALUATION_ERROR_CODES,
  EvaluationCycleStatus,
  EvaluationCycleType,
} from './evaluation-status.machine';
import { EVALUATION_TEMPLATE_V1 } from './evaluation-template';
import { EvaluationCycle } from './entities/evaluation-cycle.entity';
import { EvaluationCriterion } from './entities/evaluation-criterion.entity';
import { EvaluationRevision } from './entities/evaluation-revision.entity';
import { EvaluationScore } from './entities/evaluation-score.entity';
import { Evaluation } from './entities/evaluation.entity';

export interface ActorContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}
type EvaluationPrincipal = { userId: string; isAdmin: boolean };
const cycleScopeSql = (alias: string) => `(EXISTS (SELECT 1 FROM projects p WHERE p.id = ${alias}.projectId AND p.mentorId = :scopeUserId) OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.sessionId = ${alias}.sessionId AND si.instructorId = :scopeUserId))`;

const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new ConflictException({ statusCode: 409, code, message, ...(details ? { details } : {}) });
const notFound = (code: string, message: string) =>
  new NotFoundException({ statusCode: 404, code, message });
const forbidden = (code: string, message: string) =>
  new ForbiddenException({ statusCode: 403, code, message });
const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new BadRequestException({ statusCode: 400, code, message, ...(details ? { details } : {}) });

/**
 * EvaluationService (Phase 5, spec 5-15) — instructor-owned, human-authored
 * evaluations. ALL authority lives here: weights are validated on the
 * server (sum == 100 on open), overall scores are ALWAYS computed by the
 * backend from criterion scores × weights (spec 12), finalization is
 * immutable (spec 11/14) and privileged revisions always leave a
 * revision-history row (spec 14).
 */
@Injectable()
export class EvaluationService {
  constructor(
    @InjectRepository(EvaluationCycle) private readonly cycles: Repository<EvaluationCycle>,
    @InjectRepository(EvaluationCriterion) private readonly criteriaRepo: Repository<EvaluationCriterion>,
    @InjectRepository(Evaluation) private readonly evaluationsRepo: Repository<Evaluation>,
    @InjectRepository(EvaluationScore) private readonly scoresRepo: Repository<EvaluationScore>,
    @InjectRepository(EvaluationRevision) private readonly revisionsRepo: Repository<EvaluationRevision>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    private readonly dataSource: DataSource,
  ) {}

  // ───────────────────────────── cycles ─────────────────────────────────

  async listCycles(q: { page: number; pageSize: number; status?: string; sessionId?: string; projectId?: string }, principal?: EvaluationPrincipal) {
    const qb = this.cycles.createQueryBuilder('c').orderBy('c.startDate', 'DESC');
    if (principal && !principal.isAdmin) qb.andWhere(cycleScopeSql('c'), { scopeUserId: principal.userId });
    if (q.status) qb.andWhere('c.status = :status', { status: q.status });
    if (q.sessionId) qb.andWhere('c.sessionId = :sessionId', { sessionId: q.sessionId });
    if (q.projectId) qb.andWhere('c.projectId = :projectId', { projectId: q.projectId });
    const [items, total] = await qb.skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
    return { items, total };
  }

  async getCycle(id: string, principal?: EvaluationPrincipal): Promise<EvaluationCycle> {
    const cycle = await this.cycles.findOne({ where: { id } });
    if (!cycle) throw notFound(EVALUATION_ERROR_CODES.CYCLE_NOT_FOUND, 'Evaluation cycle not found.');
    if (principal) await this.assertCycleScope(this.dataSource.manager, principal, cycle);
    return cycle;
  }

  async createCycle(
    input: {
      code: string;
      name: string;
      sessionId?: string | null;
      projectId?: string | null;
      type: string;
      startDate: string;
      endDate: string;
      dueDate?: string | null;
      useDefaultTemplate?: boolean;
    },
    ctx: ActorContext,
    principal?: EvaluationPrincipal,
  ): Promise<EvaluationCycle> {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (!(endDate.getTime() > startDate.getTime())) {
      throw badRequest(EVALUATION_ERROR_CODES.WEIGHT_INVALID, 'endDate must be after startDate.');
    }
    return this.dataSource.transaction(async (em) => {
      if (principal) await this.assertCycleScope(em, principal, { sessionId: input.sessionId ?? null, projectId: input.projectId ?? null });
      const existing = await em.getRepository(EvaluationCycle).findOne({ where: { code: input.code } });
      if (existing) throw conflict(EVALUATION_ERROR_CODES.ALREADY_EXISTS, 'Cycle code already exists.');
      const cycle = await em.save(
        em.create(EvaluationCycle, {
          code: input.code,
          name: input.name,
          sessionId: input.sessionId ?? null,
          projectId: input.projectId ?? null,
          type: input.type as EvaluationCycleType,
          status: 'draft',
          startDate,
          endDate,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          createdById: ctx.actorId ?? null,
        }),
      );
      if (input.useDefaultTemplate !== false) {
        for (const criterion of EVALUATION_TEMPLATE_V1.criteria) {
          await em.insert(EvaluationCriterion, {
            cycleId: cycle.id,
            code: criterion.code,
            name: criterion.name,
            description: null,
            weight: criterion.weight,
            maxScore: criterion.maxScore,
            sortOrder: criterion.sortOrder,
            isRequired: criterion.isRequired,
          });
        }
      }
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'evaluation.cycle_created',
        targetType: 'evaluation_cycle',
        targetId: cycle.id,
        detail: JSON.stringify({ code: cycle.code, type: cycle.type, template: input.useDefaultTemplate !== false ? EVALUATION_TEMPLATE_V1.version : null }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return cycle;
    });
  }

  /** Only DRAFT cycles are editable (spec 7) — name/dates/dueDate. */
  async updateCycle(id: string, input: { name?: string; startDate?: string; endDate?: string; dueDate?: string | null }, ctx: ActorContext): Promise<EvaluationCycle> {
    return this.dataSource.transaction(async (em) => {
      const cycle = await this.lockCycle(em, id);
      if (cycle.status !== 'draft') throw conflict(EVALUATION_ERROR_CODES.CYCLE_NOT_EDITABLE, 'Only draft cycles can be edited.');
      if (input.name !== undefined) cycle.name = input.name;
      if (input.startDate !== undefined) cycle.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) cycle.endDate = new Date(input.endDate);
      if (input.dueDate !== undefined) cycle.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      if (!(cycle.endDate.getTime() > cycle.startDate.getTime())) {
        throw badRequest(EVALUATION_ERROR_CODES.WEIGHT_INVALID, 'endDate must be after startDate.');
      }
      await em.save(cycle);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'evaluation.cycle_updated',
        targetType: 'evaluation_cycle',
        targetId: cycle.id,
        detail: JSON.stringify({ name: input.name ?? null }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return cycle;
    });
  }

  /** Explicit status transition (spec 7); opening requires weighted criteria. */
  async changeCycleStatus(id: string, to: string, ctx: ActorContext): Promise<EvaluationCycle> {
    return this.dataSource.transaction(async (em) => {
      const cycle = await this.lockCycle(em, id);
      if (!canTransitionEvaluationCycle(cycle.status, to as EvaluationCycleStatus)) {
        throw conflict(
          EVALUATION_ERROR_CODES.INVALID_CYCLE_TRANSITION,
          `Evaluation cycle cannot move from '${cycle.status}' to '${to}'.`,
        );
      }
      if (to === 'open') {
        const criteria = await em.getRepository(EvaluationCriterion).find({ where: { cycleId: cycle.id } });
        if (criteria.length === 0) {
          throw conflict(EVALUATION_ERROR_CODES.CRITERIA_INCOMPLETE, 'The cycle has no criteria — add weighted criteria before opening.');
        }
        const totalWeight = criteria.reduce((sum, c) => sum + weightToBasisPoints(Number(c.weight)), 0);
        if (totalWeight !== 10_000) {
          throw conflict(
            EVALUATION_ERROR_CODES.WEIGHT_INVALID,
            `Active criteria weights must total exactly 100% (currently ${(totalWeight / 100).toFixed(2)}%).`,
          );
        }
      }
      cycle.status = to as EvaluationCycleStatus;
      await em.save(cycle);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: `evaluation.cycle_${to === 'open' ? 'opened' : to === 'closed' ? 'closed' : to === 'archived' ? 'archived' : 'reverted_to_draft'}`,
        targetType: 'evaluation_cycle',
        targetId: cycle.id,
        detail: JSON.stringify({ from: cycle.status, to }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return cycle;
    });
  }

  // ───────────────────────────── criteria ───────────────────────────────

  async listCriteria(cycleId: string): Promise<EvaluationCriterion[]> {
    await this.getCycle(cycleId);
    return this.criteriaRepo.find({ where: { cycleId }, order: { sortOrder: 'ASC', code: 'ASC' } });
  }

  async addCriterion(cycleId: string, input: { code: string; name: string; description?: string | null; weight: number; maxScore?: number; sortOrder?: number; isRequired?: boolean }, ctx: ActorContext): Promise<EvaluationCriterion> {
    return this.dataSource.transaction(async (em) => {
      const cycle = await this.lockCycle(em, cycleId);
      if (cycle.status !== 'draft') throw conflict(EVALUATION_ERROR_CODES.CYCLE_NOT_EDITABLE, 'Criteria can only be changed while the cycle is draft.');
      const duplicate = await em.getRepository(EvaluationCriterion).findOne({ where: { cycleId, code: input.code } });
      if (duplicate) throw conflict(EVALUATION_ERROR_CODES.ALREADY_EXISTS, 'A criterion with this code already exists in the cycle.');
      const criterion = await em.save(
        em.create(EvaluationCriterion, {
          cycleId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          weight: input.weight,
          maxScore: input.maxScore ?? 100,
          sortOrder: input.sortOrder ?? 0,
          isRequired: input.isRequired ?? true,
        }),
      );
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'evaluation.criterion_added',
        targetType: 'evaluation_cycle',
        targetId: cycleId,
        detail: JSON.stringify({ criterionId: criterion.id, code: criterion.code, weight: criterion.weight }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return criterion;
    });
  }

  async updateCriterion(cycleId: string, criterionId: string, input: { code?: string; name?: string; description?: string | null; weight?: number; maxScore?: number; sortOrder?: number; isRequired?: boolean }, ctx: ActorContext): Promise<EvaluationCriterion> {
    return this.dataSource.transaction(async (em) => {
      const cycle = await this.lockCycle(em, cycleId);
      if (cycle.status !== 'draft') throw conflict(EVALUATION_ERROR_CODES.CYCLE_NOT_EDITABLE, 'Criteria can only be changed while the cycle is draft.');
      const criterion = await em.getRepository(EvaluationCriterion).findOne({ where: { id: criterionId, cycleId } });
      if (!criterion) throw notFound(EVALUATION_ERROR_CODES.CRITERION_NOT_FOUND, 'Criterion not found in this cycle.');
      if (input.code !== undefined && input.code !== criterion.code) {
        const duplicate = await em.getRepository(EvaluationCriterion).findOne({ where: { cycleId, code: input.code } });
        if (duplicate) throw conflict(EVALUATION_ERROR_CODES.ALREADY_EXISTS, 'A criterion with this code already exists in the cycle.');
        criterion.code = input.code;
      }
      if (input.name !== undefined) criterion.name = input.name;
      if (input.description !== undefined) criterion.description = input.description;
      if (input.weight !== undefined) criterion.weight = input.weight;
      if (input.maxScore !== undefined) criterion.maxScore = input.maxScore;
      if (input.sortOrder !== undefined) criterion.sortOrder = input.sortOrder;
      if (input.isRequired !== undefined) criterion.isRequired = input.isRequired;
      await em.save(criterion);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'evaluation.criterion_updated',
        targetType: 'evaluation_cycle',
        targetId: cycleId,
        detail: JSON.stringify({ criterionId, weight: input.weight ?? null }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return criterion;
    });
  }

  async deleteCriterion(cycleId: string, criterionId: string, ctx: ActorContext): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const cycle = await this.lockCycle(em, cycleId);
      if (cycle.status !== 'draft') throw conflict(EVALUATION_ERROR_CODES.CYCLE_NOT_EDITABLE, 'Criteria can only be changed while the cycle is draft.');
      const criterion = await em.getRepository(EvaluationCriterion).findOne({ where: { id: criterionId, cycleId } });
      if (!criterion) throw notFound(EVALUATION_ERROR_CODES.CRITERION_NOT_FOUND, 'Criterion not found in this cycle.');
      await em.getRepository(EvaluationCriterion).delete({ id: criterionId });
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'evaluation.criterion_deleted',
        targetType: 'evaluation_cycle',
        targetId: cycleId,
        detail: JSON.stringify({ criterionId, code: criterion.code }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
    });
  }

  // ──────────────────────────── evaluations ─────────────────────────────

  async listEvaluations(q: { page: number; pageSize: number; cycleId?: string; internId?: string; evaluatorId?: string; status?: string }, principal?: EvaluationPrincipal) {
    const qb = this.evaluationsRepo.createQueryBuilder('e').orderBy('e.updatedAt', 'DESC');
    if (principal && !principal.isAdmin) qb.andWhere(`EXISTS (SELECT 1 FROM evaluation_cycles c WHERE c.id = e.cycleId AND ${cycleScopeSql('c')})`, { scopeUserId: principal.userId });
    if (q.cycleId) qb.andWhere('e.cycleId = :cycleId', { cycleId: q.cycleId });
    if (q.internId) qb.andWhere('e.internId = :internId', { internId: q.internId });
    if (q.evaluatorId) qb.andWhere('e.evaluatorId = :evaluatorId', { evaluatorId: q.evaluatorId });
    if (q.status) qb.andWhere('e.status = :status', { status: q.status });
    const [items, total] = await qb.skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
    return { items, total };
  }

  /**
   * Create a DRAFT evaluation. The cycle must be open (spec 7/15); the
   * evaluator defaults to the principal and instructors may only
   * self-assign; the intern must belong to the cycle scope; the evaluator
   * must own the scope (session instructor / project mentor / admin).
   */
  async createEvaluation(input: { cycleId: string; internId: string; evaluatorId?: string }, principal: { userId: string; isAdmin: boolean }, ctx: ActorContext): Promise<Evaluation> {
    return this.dataSource.transaction(async (em) => {
      const cycle = await this.lockCycle(em, input.cycleId);
      if (cycle.status !== 'open') {
        throw conflict(EVALUATION_ERROR_CODES.CYCLE_NOT_OPEN, `Evaluations can only be created while the cycle is open (status '${cycle.status}').`);
      }
      const evaluatorId = input.evaluatorId ?? principal.userId;
      if (evaluatorId !== principal.userId && !principal.isAdmin) {
        throw forbidden(EVALUATION_ERROR_CODES.SCOPE_FORBIDDEN, 'Instructors can only create evaluations under their own name.');
      }
      await this.assertCycleScope(em, principal, cycle);
      await this.assertInternInCycleScope(em, cycle, input.internId);
      const duplicate = await em.getRepository(Evaluation).findOne({
        where: { cycleId: cycle.id, internId: input.internId, evaluatorId },
      });
      if (duplicate) throw conflict(EVALUATION_ERROR_CODES.ALREADY_EXISTS, 'This evaluator already has an evaluation for this intern in the cycle.');
      const evaluation = await em.save(
        em.create(Evaluation, {
          cycleId: cycle.id,
          internId: input.internId,
          evaluatorId,
          projectId: cycle.projectId,
          sessionId: cycle.sessionId,
          status: 'draft',
          revisionNumber: 0,
        }),
      );
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? principal.userId,
        action: 'evaluation.created',
        targetType: 'evaluation',
        targetId: evaluation.id,
        detail: JSON.stringify({ cycleId: cycle.id, internId: input.internId, evaluatorId }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return evaluation;
    });
  }

  async getEvaluation(id: string, principal?: EvaluationPrincipal): Promise<{ evaluation: Evaluation; scores: EvaluationScore[] }> {
    const evaluation = await this.evaluationsRepo.findOne({ where: { id } });
    if (!evaluation) throw notFound(EVALUATION_ERROR_CODES.NOT_FOUND, 'Evaluation not found.');
    if (principal) await this.getCycle(evaluation.cycleId, principal);
    const scores = await this.scoresRepo.find({ where: { evaluationId: id } });
    return { evaluation, scores };
  }

  /**
   * Save scores + summary on a DRAFT or SUBMITTED evaluation (drafts are
   * work-in-progress; submitted evaluations stay editable until finalize).
   * Finalized evaluations are IMMUTABLE here — revisions use the
   * privileged path (spec 11/14). Scores are upserted per criterion;
   * overallScore recomputed server-side whenever all required criteria
   * have scores.
   */
  async updateEvaluation(id: string, input: { scores: Array<{ criterionId: string; score: number; comment?: string | null }>; summary?: string | null }, principal: { userId: string; isAdmin: boolean }, ctx: ActorContext): Promise<{ evaluation: Evaluation; scores: EvaluationScore[] }> {
    return this.dataSource.transaction(async (em) => {
      const evaluation = await this.lockEvaluation(em, id);
      if (evaluation.status === 'finalized') {
        throw conflict(EVALUATION_ERROR_CODES.ALREADY_FINALIZED, 'Finalized evaluations are immutable — use the privileged revision endpoint.');
      }
      if (evaluation.evaluatorId !== principal.userId && !principal.isAdmin) {
        throw forbidden(EVALUATION_ERROR_CODES.SCOPE_FORBIDDEN, 'Only the owning evaluator (or an admin) can edit this evaluation.');
      }
      const criteria = await em.getRepository(EvaluationCriterion).find({ where: { cycleId: evaluation.cycleId } });
      const criterionById = new Map(criteria.map((c) => [c.id, c]));
      for (const scoreInput of input.scores) {
        const criterion = criterionById.get(scoreInput.criterionId);
        if (!criterion) throw badRequest(EVALUATION_ERROR_CODES.CRITERION_NOT_FOUND, 'Score references a criterion outside this cycle.', { criterionId: scoreInput.criterionId });
        if (scoreInput.score < 0 || scoreInput.score > Number(criterion.maxScore)) {
          throw badRequest(
            EVALUATION_ERROR_CODES.SCORE_OUT_OF_BOUNDS,
            `Score must be between 0 and ${Number(criterion.maxScore)} for criterion '${criterion.code}'.`,
          );
        }
      }
      for (const scoreInput of input.scores) {
        const existing = await em.getRepository(EvaluationScore).findOne({
          where: { evaluationId: id, criterionId: scoreInput.criterionId },
        });
        if (existing) {
          existing.score = scoreInput.score;
          existing.comment = scoreInput.comment ?? null;
          await em.save(existing);
        } else {
          await em.insert(EvaluationScore, {
            evaluationId: id,
            criterionId: scoreInput.criterionId,
            score: scoreInput.score,
            comment: scoreInput.comment ?? null,
          });
        }
      }
      if (input.summary !== undefined) evaluation.summary = input.summary;
      const overall = await this.computeOverall(em, evaluation.cycleId, id);
      evaluation.overallScore = overall;
      await em.save(evaluation);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? principal.userId,
        action: 'evaluation.updated',
        targetType: 'evaluation',
        targetId: id,
        detail: JSON.stringify({ scoredCriteria: input.scores.length, overallScore: overall }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      const scores = await em.getRepository(EvaluationScore).find({ where: { evaluationId: id } });
      return { evaluation, scores };
    });
  }

  /** draft → submitted. Validates required criteria + weights (spec 13). */
  async submitEvaluation(id: string, principal: { userId: string; isAdmin: boolean }, ctx: ActorContext): Promise<Evaluation> {
    return this.dataSource.transaction(async (em) => {
      const evaluation = await this.lockEvaluation(em, id);
      if (!canTransitionEvaluation(evaluation.status, 'submitted')) {
        throw conflict(EVALUATION_ERROR_CODES.INVALID_EVALUATION_TRANSITION, `Evaluation cannot move from '${evaluation.status}' to 'submitted'.`);
      }
      if (evaluation.evaluatorId !== principal.userId && !principal.isAdmin) {
        throw forbidden(EVALUATION_ERROR_CODES.SCOPE_FORBIDDEN, 'Only the owning evaluator (or an admin) can submit this evaluation.');
      }
      const cycle = await em.getRepository(EvaluationCycle).findOne({ where: { id: evaluation.cycleId } });
      if (!cycle) throw notFound(EVALUATION_ERROR_CODES.CYCLE_NOT_FOUND, 'Evaluation cycle not found.');
      if (cycle.status !== 'open') {
        throw conflict(EVALUATION_ERROR_CODES.CYCLE_NOT_OPEN, `The cycle is not open (status '${cycle.status}') — submissions are rejected.`);
      }
      await this.validateCompleteness(em, cycle.id, id);
      evaluation.status = 'submitted';
      evaluation.overallScore = await this.computeOverall(em, cycle.id, id);
      evaluation.submittedAt = new Date();
      await em.save(evaluation);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? principal.userId,
        action: 'evaluation.submitted',
        targetType: 'evaluation',
        targetId: id,
        detail: JSON.stringify({ overallScore: evaluation.overallScore }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return evaluation;
    });
  }

  /**
   * submitted → finalized (spec 13): recalculates the weighted overall,
   * locks the evaluation, and notifies the intern — all in ONE transaction
   * with audit + activity (spec 69).
   */
  async finalizeEvaluation(id: string, principal: { userId: string; isAdmin: boolean }, ctx: ActorContext): Promise<Evaluation> {
    return this.dataSource.transaction(async (em) => {
      const evaluation = await this.lockEvaluation(em, id);
      if (evaluation.status === 'finalized') {
        throw conflict(EVALUATION_ERROR_CODES.ALREADY_FINALIZED, 'Evaluation is already finalized.');
      }
      if (!canTransitionEvaluation(evaluation.status, 'finalized')) {
        throw conflict(EVALUATION_ERROR_CODES.INVALID_EVALUATION_TRANSITION, `Evaluation cannot move from '${evaluation.status}' to 'finalized'.`);
      }
      if (evaluation.evaluatorId !== principal.userId && !principal.isAdmin) {
        throw forbidden(EVALUATION_ERROR_CODES.SCOPE_FORBIDDEN, 'Only the owning evaluator (or an admin) can finalize this evaluation.');
      }
      const cycle = await em.getRepository(EvaluationCycle).findOne({ where: { id: evaluation.cycleId } });
      if (!cycle) throw notFound(EVALUATION_ERROR_CODES.CYCLE_NOT_FOUND, 'Evaluation cycle not found.');
      if (cycle.status !== 'open') {
        throw conflict(EVALUATION_ERROR_CODES.CYCLE_NOT_OPEN, `The cycle is not open (status '${cycle.status}') — finalization is rejected.`);
      }
      await this.validateCompleteness(em, cycle.id, id);
      const overall = await this.computeOverall(em, cycle.id, id);
      evaluation.status = 'finalized';
      evaluation.overallScore = overall;
      evaluation.finalizedAt = new Date();
      await em.save(evaluation);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? principal.userId,
        action: 'evaluation.finalized',
        targetType: 'evaluation',
        targetId: id,
        detail: JSON.stringify({ overallScore: overall, cycleId: cycle.id }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      await em.insert(ActivityEvent, {
        actorId: ctx.actorId ?? principal.userId,
        module: 'evaluation',
        action: 'finalized',
        targetType: 'evaluation',
        targetId: id,
        summary: 'Đánh giá thực tập sinh đã được chốt',
      });
      await notifyInTransaction(em, [evaluation.internId], {
        type: 'evaluation.finalized',
        category: 'evaluation',
        title: 'Bạn có một đánh giá mới đã được chốt',
        body: 'Giảng viên đã chốt đánh giá của bạn. Vào workspace để xem chi tiết.',
        linkUrl: '/intern/me/evaluations',
      });
      return evaluation;
    });
  }

  /**
   * PRIVILEGED correction (spec 14): admin-only; the evaluation stays
   * finalized; every change writes an immutable revision row with the
   * previous/new overall + reason. Never a silent mutation.
   */
  async reviseEvaluation(id: string, input: { scores?: Array<{ criterionId: string; score: number; comment?: string | null }>; summary?: string; reason: string }, adminId: string, ctx: ActorContext): Promise<{ evaluation: Evaluation; revision: EvaluationRevision }> {
    return this.dataSource.transaction(async (em) => {
      const evaluation = await this.lockEvaluation(em, id);
      if (evaluation.status !== 'finalized') {
        throw conflict(EVALUATION_ERROR_CODES.INVALID_EVALUATION_TRANSITION, 'Revisions apply to FINALIZED evaluations only.');
      }
      const previousOverall = evaluation.overallScore;
      if (input.scores && input.scores.length > 0) {
        const criteria = await em.getRepository(EvaluationCriterion).find({ where: { cycleId: evaluation.cycleId } });
        const criterionById = new Map(criteria.map((c) => [c.id, c]));
        for (const scoreInput of input.scores) {
          const criterion = criterionById.get(scoreInput.criterionId);
          if (!criterion) throw badRequest(EVALUATION_ERROR_CODES.CRITERION_NOT_FOUND, 'Score references a criterion outside this cycle.', { criterionId: scoreInput.criterionId });
          if (scoreInput.score < 0 || scoreInput.score > Number(criterion.maxScore)) {
            throw badRequest(EVALUATION_ERROR_CODES.SCORE_OUT_OF_BOUNDS, `Score must be between 0 and ${Number(criterion.maxScore)}.`);
          }
        }
        for (const scoreInput of input.scores) {
          const existing = await em.getRepository(EvaluationScore).findOne({
            where: { evaluationId: id, criterionId: scoreInput.criterionId },
          });
          if (existing) {
            existing.score = scoreInput.score;
            existing.comment = scoreInput.comment ?? existing.comment;
            await em.save(existing);
          } else {
            await em.insert(EvaluationScore, {
              evaluationId: id,
              criterionId: scoreInput.criterionId,
              score: scoreInput.score,
              comment: scoreInput.comment ?? null,
            });
          }
        }
        await this.validateCompleteness(em, evaluation.cycleId, id);
      }
      if (input.summary !== undefined) evaluation.summary = input.summary;
      const newOverall = await this.computeOverall(em, evaluation.cycleId, id);
      const revisionNumber = evaluation.revisionNumber + 1;
      evaluation.overallScore = newOverall;
      evaluation.revisionNumber = revisionNumber;
      await em.save(evaluation);
      const revision = await em.save(
        em.create(EvaluationRevision, {
          evaluationId: id,
          revisionNumber,
          previousOverallScore: previousOverall,
          newOverallScore: newOverall,
          reason: input.reason,
          changedById: adminId,
        }),
      );
      await em.insert(AuditLog, {
        actorId: adminId,
        action: 'evaluation.revised',
        targetType: 'evaluation',
        targetId: id,
        detail: JSON.stringify({ revisionNumber, previousOverall: previousOverall, newOverall, reason: input.reason }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      await notifyInTransaction(em, [evaluation.internId], {
        type: 'evaluation.revised',
        category: 'evaluation',
        title: 'Đánh giá của bạn đã được điều chỉnh',
        body: 'Một điều chỉnh chính thức đã được áp dụng cho đánh giá của bạn (có lịch sử phiên bản).',
      });
      return { evaluation, revision };
    });
  }

  // ───────────────────────── intern self-view ───────────────────────────

  /** Interns see their FINALIZED evaluations only (documented). */
  async internList(userId: string): Promise<Array<Evaluation & { scores: EvaluationScore[] }>> {
    const evaluations = await this.evaluationsRepo.find({
      where: { internId: userId, status: 'finalized' },
      order: { finalizedAt: 'DESC' },
    });
    if (evaluations.length === 0) return [];
    const scores = await this.scoresRepo.find({ where: { evaluationId: In(evaluations.map((e) => e.id)) } });
    return evaluations.map((e) => ({ ...e, scores: scores.filter((s) => s.evaluationId === e.id) }));
  }

  async internGet(userId: string, id: string): Promise<Evaluation & { scores: EvaluationScore[] }> {
    const evaluation = await this.evaluationsRepo.findOne({ where: { id } });
    // 404-safe for foreign/unfinished evaluations (never leak existence).
    if (!evaluation || evaluation.internId !== userId || evaluation.status !== 'finalized') {
      throw notFound(EVALUATION_ERROR_CODES.NOT_FOUND, 'Evaluation not found.');
    }
    const scores = await this.scoresRepo.find({ where: { evaluationId: id } });
    return { ...evaluation, scores };
  }

  // ─────────────────────────── shared internals ─────────────────────────

  private async lockCycle(em: EntityManager, id: string): Promise<EvaluationCycle> {
    const cycle = await em
      .getRepository(EvaluationCycle)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :id', { id })
      .getOne();
    if (!cycle) throw notFound(EVALUATION_ERROR_CODES.CYCLE_NOT_FOUND, 'Evaluation cycle not found.');
    return cycle;
  }

  private async lockEvaluation(em: EntityManager, id: string): Promise<Evaluation> {
    const evaluation = await em
      .getRepository(Evaluation)
      .createQueryBuilder('e')
      .setLock('pessimistic_write')
      .where('e.id = :id', { id })
      .getOne();
    if (!evaluation) throw notFound(EVALUATION_ERROR_CODES.NOT_FOUND, 'Evaluation not found.');
    return evaluation;
  }

  /**
   * Scope ownership (spec 61): admin passes; otherwise the actor must be a
   * session instructor (cycle.sessionId) or project mentor
   * (cycle.projectId). Cycles with NO scope are admin-managed.
   */
  private async assertCycleScope(em: EntityManager, principal: { userId: string; isAdmin: boolean }, cycle: Pick<EvaluationCycle, 'sessionId' | 'projectId'>): Promise<void> {
    if (principal.isAdmin) return;
    if (cycle.sessionId) {
      const instructor = await em.getRepository(SessionInstructor).findOne({
        where: { sessionId: cycle.sessionId, instructorId: principal.userId },
      });
      if (instructor) return;
    }
    if (cycle.projectId) {
      const project = await em.getRepository(Project).findOne({ where: { id: cycle.projectId } });
      if (project && project.mentorId === principal.userId) return;
    }
    throw forbidden(EVALUATION_ERROR_CODES.SCOPE_FORBIDDEN, 'You do not manage this evaluation cycle scope.');
  }

  /** The intern must hold an assignment matching the cycle scope (spec 13). */
  private async assertInternInCycleScope(em: EntityManager, cycle: EvaluationCycle, internId: string): Promise<void> {
    const qb = em
      .getRepository(Assignment)
      .createQueryBuilder('a')
      .where('a.internId = :internId', { internId })
      .andWhere('a.status IN (:...statuses)', { statuses: ['active', 'completed'] });
    if (cycle.sessionId) qb.andWhere('a.sessionId = :sessionId', { sessionId: cycle.sessionId });
    if (cycle.projectId) qb.andWhere('a.projectId = :projectId', { projectId: cycle.projectId });
    const found = await qb.getOne();
    if (!found) {
      throw conflict(EVALUATION_ERROR_CODES.INTERN_NOT_IN_SCOPE, 'The intern does not belong to this evaluation cycle scope.');
    }
  }

  /** All REQUIRED criteria scored + active weights total exactly 100. */
  private async validateCompleteness(em: EntityManager, cycleId: string, evaluationId: string): Promise<void> {
    const criteria = await em.getRepository(EvaluationCriterion).find({ where: { cycleId } });
    const totalWeight = criteria.reduce((sum, c) => sum + weightToBasisPoints(Number(c.weight)), 0);
    if (totalWeight !== 10_000) {
      throw conflict(EVALUATION_ERROR_CODES.WEIGHT_INVALID, `Active criteria weights must total exactly 100% (currently ${(totalWeight / 100).toFixed(2)}%).`);
    }
    const required = criteria.filter((c) => c.isRequired);
    const scored = await em.getRepository(EvaluationScore).find({ where: { evaluationId } });
    const scoredIds = new Set(scored.map((s) => s.criterionId));
    const missing = required.filter((c) => !scoredIds.has(c.id));
    if (missing.length > 0) {
      throw conflict(EVALUATION_ERROR_CODES.CRITERIA_INCOMPLETE, 'All required criteria must be scored.', {
        missingCriteria: missing.map((c) => c.code),
      });
    }
  }

  /**
   * THE backend formula (spec 12): overall = Σ(score × weight) / Σ(weight
   * of scored criteria), rounded half-up to one decimal — integer math.
   * Returns null when nothing is scored yet.
   */
  private async computeOverall(em: EntityManager, cycleId: string, evaluationId: string): Promise<number | null> {
    const criteria = await em.getRepository(EvaluationCriterion).find({ where: { cycleId } });
    const criterionById = new Map(criteria.map((c) => [c.id, c]));
    const scores = await em.getRepository(EvaluationScore).find({ where: { evaluationId } });
    const scored = scores
      .filter((s) => criterionById.has(s.criterionId))
      .map((s) => ({
        scoreTenths: scoreToTenths(Number(s.score)),
        weightBasisPoints: weightToBasisPoints(Number(criterionById.get(s.criterionId)!.weight)),
      }));
    if (scored.length === 0) return null;
    return tenthsToOneDecimal(weightedOverallTenths(scored));
  }
}
