import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { notifyInTransaction } from '../common/utils/notify';
import { Assignment } from '../assignments/entities/assignment.entity';
import { PerformanceService } from '../performance/performance.service';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { KPI_ERROR_CODES, KPI_RULE_VERSION_V1, canTransitionKpiPeriod, KpiPeriodStatus } from './kpi-status.machine';
import { calculateKpiV1, KpiV1Outcome } from './kpi-formula';
import { KpiMetricResult } from './entities/kpi-metric-result.entity';
import { KpiPeriod } from './entities/kpi-period.entity';
import { KpiResult } from './entities/kpi-result.entity';

export interface ActorContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new ConflictException({ statusCode: 409, code, message, ...(details ? { details } : {}) });
const notFound = (code: string, message: string) =>
  new NotFoundException({ statusCode: 404, code, message });

/**
 * KpiService (Phase 5, spec 22-30) — versioned, deterministic, auditable.
 *
 * FLOW: calculate locks the period (open → calculating) so concurrent
 * calculate requests converge on ONE 409 KPI_CALCULATION_IN_PROGRESS;
 * each eligible intern's result + component provenance rows persist in
 * their own short transaction (spec 71 — no giant transaction); the
 * period returns to `open` afterwards (controlled recalculation allowed
 * pre-finalize, spec 28). finalize (open → finalized) locks the period
 * permanently: no silent recalculation ever after (spec 28/58).
 */
@Injectable()
export class KpiService {
  constructor(
    @InjectRepository(KpiPeriod) private readonly periods: Repository<KpiPeriod>,
    @InjectRepository(KpiResult) private readonly results: Repository<KpiResult>,
    @InjectRepository(KpiMetricResult) private readonly metricResults: Repository<KpiMetricResult>,
    @InjectRepository(RecruitmentProfile) private readonly recruitmentProfiles: Repository<RecruitmentProfile>,
    @InjectRepository(Assignment) private readonly assignments: Repository<Assignment>,
    private readonly performanceService: PerformanceService,
    private readonly dataSource: DataSource,
  ) {}

  async listPeriods(q: { page: number; pageSize: number; status?: string }) {
    const qb = this.periods.createQueryBuilder('p').orderBy('p.startDate', 'DESC');
    if (q.status) qb.andWhere('p.status = :status', { status: q.status });
    const [items, total] = await qb.skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
    return { items, total };
  }

  async getPeriod(id: string): Promise<KpiPeriod> {
    const period = await this.periods.findOne({ where: { id } });
    if (!period) throw notFound(KPI_ERROR_CODES.PERIOD_NOT_FOUND, 'KPI period not found.');
    return period;
  }

  async createPeriod(input: { code: string; name: string; startDate: string; endDate: string }, ctx: ActorContext): Promise<KpiPeriod> {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    if (!(endDate.getTime() > startDate.getTime())) {
      throw new BadRequestException({ statusCode: 400, code: 'KPI_PERIOD_INVALID_DATES', message: 'endDate must be after startDate.' });
    }
    return this.dataSource.transaction(async (em) => {
      const existing = await em.getRepository(KpiPeriod).findOne({ where: { code: input.code } });
      if (existing) throw conflict(KPI_ERROR_CODES.PERIOD_NOT_FOUND, 'KPI period code already exists.');
      const period = await em.save(
        em.create(KpiPeriod, {
          code: input.code,
          name: input.name,
          startDate,
          endDate,
          status: 'draft',
          ruleVersion: KPI_RULE_VERSION_V1,
          createdById: ctx.actorId ?? null,
        }),
      );
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'kpi.period_created',
        targetType: 'kpi_period',
        targetId: period.id,
        detail: JSON.stringify({ code: period.code, ruleVersion: period.ruleVersion }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return period;
    });
  }

  /** Only draft/open periods are editable; code + ruleVersion immutable (spec 76). */
  async updatePeriod(id: string, input: { name?: string; startDate?: string; endDate?: string }, ctx: ActorContext): Promise<KpiPeriod> {
    return this.dataSource.transaction(async (em) => {
      const period = await this.lockPeriod(em, id);
      if (period.status !== 'draft' && period.status !== 'open') {
        throw conflict(KPI_ERROR_CODES.PERIOD_NOT_EDITABLE, `Period cannot be edited while '${period.status}'.`);
      }
      if (input.name !== undefined) period.name = input.name;
      if (input.startDate !== undefined) period.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) period.endDate = new Date(input.endDate);
      if (!(period.endDate.getTime() > period.startDate.getTime())) {
        throw new BadRequestException({ statusCode: 400, code: 'KPI_PERIOD_INVALID_DATES', message: 'endDate must be after startDate.' });
      }
      await em.save(period);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: 'kpi.period_updated',
        targetType: 'kpi_period',
        targetId: id,
        detail: JSON.stringify(input),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return period;
    });
  }

  /** Explicit status transition (draft→open, open→finalized, finalized→closed). */
  async changeStatus(id: string, to: string, ctx: ActorContext): Promise<KpiPeriod> {
    return this.dataSource.transaction(async (em) => {
      const period = await this.lockPeriod(em, id);
      if (!canTransitionKpiPeriod(period.status, to as KpiPeriodStatus)) {
        throw conflict(KPI_ERROR_CODES.INVALID_TRANSITION, `KPI period cannot move from '${period.status}' to '${to}'.`);
      }
      period.status = to as KpiPeriodStatus;
      await em.save(period);
      await em.insert(AuditLog, {
        actorId: ctx.actorId ?? null,
        action: `kpi.period_${to}`,
        targetType: 'kpi_period',
        targetId: id,
        detail: JSON.stringify({ from: period.status, to }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      return period;
    });
  }

  /**
   * POST /kpi-periods/:id/calculate — batch calculation (spec 27/71).
   * Period-level lock serializes batches; per-user short transactions
   * persist results + provenance; failures revert the period to `open`.
   */
  async calculate(id: string, actorId: string | null, ctx: ActorContext): Promise<{ period: KpiPeriod; calculated: number; insufficientData: number }> {
    // Phase A: lock + claim the period (open → calculating).
    await this.dataSource.transaction(async (em) => {
      const period = await this.lockPeriod(em, id);
      if (period.status === 'calculating') {
        throw conflict(KPI_ERROR_CODES.CALCULATION_IN_PROGRESS, 'A calculation batch is already running for this period.');
      }
      if (period.status === 'draft') {
        throw conflict(KPI_ERROR_CODES.PERIOD_NOT_CALCULABLE, 'Open the period before calculating.');
      }
      if (period.status === 'finalized' || period.status === 'closed') {
        throw conflict(KPI_ERROR_CODES.ALREADY_FINALIZED, 'Finalized periods are locked — no silent recalculation (spec 28).');
      }
      if (!canTransitionKpiPeriod(period.status, 'calculating')) {
        throw conflict(KPI_ERROR_CODES.INVALID_TRANSITION, `Period cannot move from '${period.status}' to 'calculating'.`);
      }
      period.status = 'calculating';
      await em.save(period);
    });

    try {
      // Phase B: deterministic per-user computation (short transactions).
      const period = await this.periods.findOneOrFail({ where: { id } });
      const eligible = await this.eligibleInterns(period);
      let calculated = 0;
      let insufficientData = 0;
      for (const userId of eligible) {
        const outcome = await this.computeOutcomeForUser(userId, period);
        await this.persistResult(period, userId, outcome, actorId);
        if (outcome.status === 'calculated') calculated += 1;
        else insufficientData += 1;
      }

      // Phase C: release the period (calculating → open; recalc allowed).
      const released = await this.dataSource.transaction(async (em) => {
        const p = await this.lockPeriod(em, id);
        if (!canTransitionKpiPeriod(p.status, 'open')) return false;
        p.status = 'open';
        await em.save(p);
        await em.insert(AuditLog, {
          actorId: actorId,
          action: 'kpi.calculated',
          targetType: 'kpi_period',
          targetId: id,
          detail: JSON.stringify({ calculated, insufficientData, ruleVersion: p.ruleVersion }),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
        return true;
      });
      if (!released) throw conflict(KPI_ERROR_CODES.INVALID_TRANSITION, 'Period could not return to open after calculation.');
      const fresh = await this.periods.findOneOrFail({ where: { id } });
      return { period: fresh, calculated, insufficientData };
    } catch (err) {
      // ALWAYS release the lock on failure — the period returns to open.
      await this.dataSource
        .transaction(async (em) => {
          const p = await this.lockPeriod(em, id);
          if (p.status === 'calculating') {
            p.status = 'open';
            await em.save(p);
          }
        })
        .catch(() => undefined);
      throw err;
    }
  }

  /**
   * POST /kpi-periods/:id/finalize — open → finalized (spec 27/28).
   * Locks the period permanently; notifies interns with calculated
   * results; audit + activity in the SAME transaction.
   */
  async finalize(id: string, actorId: string, ctx: ActorContext): Promise<KpiPeriod> {
    return this.dataSource.transaction(async (em) => {
      const period = await this.lockPeriod(em, id);
      if (period.status === 'finalized' || period.status === 'closed') {
        throw conflict(KPI_ERROR_CODES.ALREADY_FINALIZED, 'Period is already finalized.');
      }
      if (!canTransitionKpiPeriod(period.status, 'finalized')) {
        throw conflict(KPI_ERROR_CODES.INVALID_TRANSITION, `Period cannot move from '${period.status}' to 'finalized'.`);
      }
      period.status = 'finalized';
      await em.save(period);
      const results = await em.getRepository(KpiResult).find({ where: { periodId: id, status: 'calculated' } });
      await em.insert(AuditLog, {
        actorId,
        action: 'kpi.finalized',
        targetType: 'kpi_period',
        targetId: id,
        detail: JSON.stringify({ calculatedResults: results.length, ruleVersion: period.ruleVersion }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      await em.insert(ActivityEvent, {
        actorId,
        module: 'kpi',
        action: 'finalized',
        targetType: 'kpi_period',
        targetId: id,
        summary: 'KPI kỳ đánh giá đã được chốt',
      });
      if (results.length > 0) {
        await notifyInTransaction(em, results.map((r) => r.userId), {
          type: 'kpi.finalized',
          category: 'kpi',
          title: 'KPI của bạn đã được chốt',
          body: 'Kết quả KPI cho kỳ đánh giá đã chính thức được chốt.',
          linkUrl: '/intern/me/kpi',
        });
      }
      return period;
    });
  }

  async listResults(periodId: string, q: { page: number; pageSize: number }) {
    await this.getPeriod(periodId);
    const qb = this.results
      .createQueryBuilder('r')
      .where('r.periodId = :periodId', { periodId })
      .orderBy('r.finalScore', 'DESC')
        .addOrderBy('r.id', 'ASC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getResult(id: string): Promise<{ result: KpiResult; metrics: KpiMetricResult[] }> {
    const result = await this.results.findOne({ where: { id } });
    if (!result) throw notFound(KPI_ERROR_CODES.RESULT_NOT_FOUND, 'KPI result not found.');
    const metrics = await this.metricResults.find({ where: { kpiResultId: id } });
    return { result, metrics };
  }

  // ───────────────────────── intern self-view ───────────────────────────

  async internResults(userId: string): Promise<Array<KpiResult & { period: KpiPeriod }>> {
    const results = await this.results.find({
      where: { userId },
      order: { calculatedAt: 'DESC' },
    });
    if (results.length === 0) return [];
    const periods = await this.periods.find({ where: results.map((r) => ({ id: r.periodId })) });
    const periodById = new Map(periods.map((p) => [p.id, p]));
    return results.map((r) => ({ ...r, period: periodById.get(r.periodId) as KpiPeriod }));
  }

  async internResult(userId: string, id: string): Promise<KpiResult & { metrics: KpiMetricResult[] }> {
    const result = await this.results.findOne({ where: { id } });
    if (!result || result.userId !== userId) {
      // 404-safe for foreign results.
      throw notFound(KPI_ERROR_CODES.RESULT_NOT_FOUND, 'KPI result not found.');
    }
    const metrics = await this.metricResults.find({ where: { kpiResultId: id } });
    return { ...result, metrics };
  }

  // ─────────────────────────── internals ───────────────────────────────

  private async lockPeriod(em: EntityManager, id: string): Promise<KpiPeriod> {
    const period = await em
      .getRepository(KpiPeriod)
      .createQueryBuilder('p')
      .setLock('pessimistic_write')
      .where('p.id = :id', { id })
      .getOne();
    if (!period) throw notFound(KPI_ERROR_CODES.PERIOD_NOT_FOUND, 'KPI period not found.');
    return period;
  }

  /**
   * Eligibility (spec 29): recruitment PASSED and assignment activity
   * overlapping the period ([assignedAt, completedAt|∞) ∩ [start, end) ≠ ∅).
   */
  private async eligibleInterns(period: KpiPeriod): Promise<string[]> {
    const passedProfiles = await this.recruitmentProfiles.find({ where: { status: 'passed' } });
    const passedUserIds = passedProfiles.map((p) => p.userId);
    if (passedUserIds.length === 0) return [];
    const assignments = await this.assignments.find({
      where: { internId: In(passedUserIds), status: In(['active', 'completed']) },
    });
    const eligible = new Set<string>();
    for (const a of assignments) {
      const start = a.assignedAt.getTime();
      const end = a.completedAt ? a.completedAt.getTime() : Number.POSITIVE_INFINITY;
      if (start < period.endDate.getTime() && end >= period.startDate.getTime()) {
        eligible.add(a.internId);
      }
    }
    return [...eligible];
  }

  /** Deterministic components for ONE user over the period window. */
  private async computeOutcomeForUser(userId: string, period: KpiPeriod): Promise<KpiV1Outcome> {
    const performance = await this.performanceService.ownMetrics(userId, {
      from: period.startDate.toISOString(),
      to: period.endDate.toISOString(),
    });
    const metrics = performance.metrics;
    // kpi-v1 mapping (spec 24): delivery = SP rate ?? task rate; quality =
    // average finalized evaluation; timeliness = on-time rate. An
    // unavailable source is null — never zero (spec 25).
    return calculateKpiV1({
      delivery: metrics.storyPointCompletionRate ?? metrics.taskCompletionRate,
      quality: metrics.averageEvaluationScore,
      timeliness: metrics.onTimeCompletionRate,
    });
  }

  /** Upsert ONE user's snapshot: result + replace provenance rows. */
  private async persistResult(period: KpiPeriod, userId: string, outcome: KpiV1Outcome, actorId: string | null): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(KpiResult);
      let result = await repo.findOne({ where: { periodId: period.id, userId } });
      const calculatedAt = new Date();
      if (result) {
        // Controlled recalculation (pre-finalize): the snapshot is REPLACED
        // wholesale — the previous values remain in audit logs only.
        result.ruleVersion = period.ruleVersion;
        result.status = outcome.status;
        result.finalScore = outcome.finalScore;
        result.calculatedAt = calculatedAt;
        result.calculatedById = actorId;
        await em.save(result);
        await em.getRepository(KpiMetricResult).delete({ kpiResultId: result.id });
      } else {
        result = await em.save(
          em.create(KpiResult, {
            periodId: period.id,
            userId,
            ruleVersion: period.ruleVersion,
            status: outcome.status,
            finalScore: outcome.finalScore,
            calculatedAt,
            calculatedById: actorId,
          }),
        );
      }
      for (const component of outcome.components) {
        await em.insert(KpiMetricResult, {
          kpiResultId: result.id,
          metricCode: component.metricCode,
          configuredWeight: component.configuredWeight,
          effectiveWeight: component.effectiveWeight,
          sourceValue: component.sourceValue,
          weightedContribution: component.weightedContribution,
          sourceJson: JSON.stringify({
            formula: 'kpi-v1',
            renormalizedOver: outcome.availableWeightSum,
            policy: 'missing components are excluded and weights renormalize — never zero-penalized (spec 25)',
          }),
        });
      }
    });
  }
}
