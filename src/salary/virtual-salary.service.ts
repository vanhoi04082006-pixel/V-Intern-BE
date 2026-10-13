import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { isUniqueViolation } from '../common/utils/db-errors';
import { SettingsService } from '../settings/settings.service';
import { notifyInTransaction } from '../common/utils/notify';
import {
  AdjustmentError,
  calculateKpiEarning,
  kpiEarningIdempotencyKey,
  SALARY_ERROR_CODES,
  sumLedgerAmounts,
  validateAdjustment,
} from './salary-calculator';
import { KpiPeriod } from '../kpi/entities/kpi-period.entity';
import { KpiResult } from '../kpi/entities/kpi-result.entity';
import {
  VirtualSalaryLedger,
  VirtualSalaryLedgerType,
  VIRTUAL_SALARY_UNIT_DEFAULT,
} from './entities/virtual-salary-ledger.entity';

export interface ActorContext {
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new ConflictException({ statusCode: 409, code, message, ...(details ? { details } : {}) });
const notFound = (code: string, message: string) =>
  new NotFoundException({ statusCode: 404, code, message });

export const SALARY_BASE_AMOUNT_SETTING = 'virtual_salary.base_amount';
export const SALARY_UNIT_SETTING = 'virtual_salary.unit';

/**
 * VirtualSalaryService (Phase 5, spec 31-40) — LEDGER-AUTHORITATIVE.
 * There is no balance column anywhere: balance is ALWAYS SUM(amount) over
 * the append-only ledger. Generation consumes ONLY finalized KPI results,
 * is idempotent by UNIQUE idempotencyKey, and a missing base-amount
 * setting is a hard VIRTUAL_SALARY_CONFIG_MISSING failure (spec 34) —
 * never an invented number.
 */
@Injectable()
export class VirtualSalaryService {
  constructor(
    @InjectRepository(VirtualSalaryLedger) private readonly ledger: Repository<VirtualSalaryLedger>,
    private readonly settingsService: SettingsService,
    private readonly dataSource: DataSource,
  ) {}

  /** POST /virtual-salary/generate/:kpiPeriodId (spec 36) — idempotent. */
  async generateForPeriod(kpiPeriodId: string, actorId: string, ctx: ActorContext): Promise<{ kpiPeriodId: string; generated: number; skipped: number; unit: string }> {
    // Settings read OUTSIDE the transaction: a missing/invalid base is a
    // fast, honest failure (spec 34) before any row is touched.
    const { baseAmount, unit } = await this.readBaseConfig();

    const period = await this.dataSource.getRepository(KpiPeriod).findOne({ where: { id: kpiPeriodId } });
    if (!period) throw notFound('KPI_PERIOD_NOT_FOUND', 'KPI period not found.');
    if (period.status !== 'finalized') {
      throw conflict(SALARY_ERROR_CODES.PERIOD_NOT_FINALIZED, 'Virtual salary is generated from FINALIZED KPI periods only.');
    }

    const results = await this.dataSource
      .getRepository(KpiResult)
      .find({ where: { periodId: kpiPeriodId, status: 'calculated' } });

    let generated = 0;
    let skipped = 0;
    const notifiedUserIds: string[] = [];

    await this.dataSource.transaction(async (em) => {
      for (const result of results) {
        if (result.finalScore === null) {
          skipped += 1;
          continue;
        }
        const idempotencyKey = kpiEarningIdempotencyKey(kpiPeriodId, result.userId);
        const existing = await em.getRepository(VirtualSalaryLedger).findOne({ where: { idempotencyKey } });
        if (existing) {
          skipped += 1;
          continue;
        }
        const amount = calculateKpiEarning(baseAmount, Number(result.finalScore));
        // A valid zero KPI (or rounded-to-zero earning) produces no ledger
        // movement. The frozen ledger CHECK forbids zero amounts; one such
        // intern must not roll back the entire batch for everyone else.
        if (amount === 0) {
          skipped += 1;
          continue;
        }
        await em.insert(VirtualSalaryLedger, {
          userId: result.userId,
          kpiPeriodId,
          type: 'kpi_earning' as VirtualSalaryLedgerType,
          amount,
          unit,
          sourceType: 'kpi_result',
          sourceId: result.id,
          description: `Lương ảo theo KPI kỳ ${period.code} (${period.ruleVersion}): ${Number(result.finalScore)}/100`,
          createdById: actorId,
          idempotencyKey,
          metadataJson: JSON.stringify({ ruleVersion: result.ruleVersion, finalScore: Number(result.finalScore), baseAmount }),
        });
        generated += 1;
        notifiedUserIds.push(result.userId);
      }
      if (generated > 0) {
        await em.insert(AuditLog, {
          actorId,
          action: 'virtual_salary.generated',
          targetType: 'kpi_period',
          targetId: kpiPeriodId,
          detail: JSON.stringify({ generated, skipped, unit, baseAmount }),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
      }
    });

    if (notifiedUserIds.length > 0) {
      await this.dataSource.transaction(async (em) => {
        await notifyInTransaction(em, notifiedUserIds, {
          type: 'virtual_salary.generated',
          category: 'salary',
          title: 'Lương ảo của bạn đã được cập nhật',
          body: 'Khoản lương ảo theo KPI đã được ghi vào sổ cái của bạn.',
          linkUrl: '/intern/me/virtual-salary',
        });
      });
    }

    return { kpiPeriodId, generated, skipped, unit };
  }

  /**
   * POST /virtual-salary/adjustments (spec 37/38): bonus/penalty/
   * adjustment/reversal — always reason + actor + audit; reversals are
   * derived from the source row and double-reversal is a 409.
   */
  async adjust(input: { userId: string; type: VirtualSalaryLedgerType; amount?: number; sourceId?: string; reason: string; requestId?: string }, actorId: string, ctx: ActorContext): Promise<VirtualSalaryLedger> {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new AdjustmentError('reason is required for every adjustment (audit trail)');
    }
    const unit = (await this.settingsService.get(SALARY_UNIT_SETTING)) ?? VIRTUAL_SALARY_UNIT_DEFAULT;

    if (input.type === 'reversal') {
      if (!input.sourceId) throw conflict(SALARY_ERROR_CODES.INVALID_ADJUSTMENT, 'reversal requires the source ledger row id.');
      return this.dataSource.transaction(async (em) => {
        const source = await em
          .getRepository(VirtualSalaryLedger)
          .createQueryBuilder('l')
          .setLock('pessimistic_write')
          .where('l.id = :id', { id: input.sourceId })
          .getOne();
        if (!source) throw notFound(SALARY_ERROR_CODES.LEDGER_ROW_NOT_FOUND, 'Source ledger row not found.');
        const existingReversal = await em.getRepository(VirtualSalaryLedger).findOne({
          where: { type: 'reversal', sourceId: source.id },
        });
        if (existingReversal) {
          throw conflict(SALARY_ERROR_CODES.ALREADY_REVERSED, 'This ledger row has already been reversed.');
        }
        const reversal = await em.save(
          em.create(VirtualSalaryLedger, {
            userId: source.userId,
            kpiPeriodId: source.kpiPeriodId,
            type: 'reversal' as VirtualSalaryLedgerType,
            amount: -Number(source.amount),
            unit: source.unit,
            sourceType: 'reversal',
            sourceId: source.id,
            description: `Reversal of ledger row ${source.id}: ${input.reason}`,
            createdById: actorId,
            idempotencyKey: `reversal:${source.id}:v1`,
            metadataJson: JSON.stringify({ reversedAmount: Number(source.amount), reason: input.reason }),
          }),
        );
        await em.insert(AuditLog, {
          actorId,
          action: 'virtual_salary.reversed',
          targetType: 'virtual_salary_ledger',
          targetId: reversal.id,
          detail: JSON.stringify({ sourceId: source.id, amount: Number(reversal.amount), reason: input.reason }),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        });
        await notifyInTransaction(em, [source.userId], {
          type: 'virtual_salary.adjusted',
          category: 'salary',
          title: 'Lương ảo của bạn đã được điều chỉnh',
          body: `Một khoản đảo ngược đã được ghi nhận: ${input.reason}`,
        });
        return reversal;
      });
    }

    let validated;
    try {
      validated = validateAdjustment(input.type as 'bonus' | 'penalty' | 'adjustment', input.amount ?? NaN);
    } catch (err) {
      if (err instanceof AdjustmentError) {
        throw conflict(SALARY_ERROR_CODES.INVALID_ADJUSTMENT, err.message);
      }
      throw err;
    }

    // P0 BE-010: client-supplied requestId makes retries idempotent. Without it
    // the key embeds Date.now() and can never dedupe (legacy, documented).
    const idempotencyKey = input.requestId
      ? `adjustment:req:${input.requestId}`
      : `adjustment:${input.userId}:${validated.type}:${Date.now()}:v1`;
    return this.dataSource.transaction(async (em) => {
      if (input.requestId) {
        const existing = await em.getRepository(VirtualSalaryLedger).findOne({ where: { idempotencyKey } });
        if (existing) return existing;
      }
      let row: VirtualSalaryLedger;
      try {
        row = await em.save(
          em.create(VirtualSalaryLedger, {
            userId: input.userId,
            kpiPeriodId: null,
            type: validated.type,
            amount: validated.amount,
            unit,
            sourceType: 'manual_adjustment',
            sourceId: null,
            description: input.reason,
            createdById: actorId,
            idempotencyKey,
            metadataJson: JSON.stringify({ reason: input.reason }),
          }),
        );
      } catch (err) {
        // Concurrent replays racing past the pre-check hit the UNIQUE index;
        // return the winner instead of 500.
        if (input.requestId && isUniqueViolation(err)) {
          const winner = await em.getRepository(VirtualSalaryLedger).findOne({ where: { idempotencyKey } });
          if (winner) return winner;
        }
        throw err;
      }
      await em.insert(AuditLog, {
        actorId,
        action: 'virtual_salary.adjusted',
        targetType: 'virtual_salary_ledger',
        targetId: row.id,
        detail: JSON.stringify({ userId: input.userId, type: validated.type, amount: validated.amount, reason: input.reason }),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      });
      await notifyInTransaction(em, [input.userId], {
        type: 'virtual_salary.adjusted',
        category: 'salary',
        title: 'Lương ảo của bạn đã được điều chỉnh',
        body: input.reason,
      });
      return row;
    });
  }

  /** GET /virtual-salary (admin) — paginated ledger with filters. */
  async listLedger(q: { page: number; pageSize: number; userId?: string; type?: string; kpiPeriodId?: string }) {
    const qb = this.ledger.createQueryBuilder('l').orderBy('l.createdAt', 'DESC');
    if (q.userId) qb.andWhere('l.userId = :userId', { userId: q.userId });
    if (q.type) qb.andWhere('l.type = :type', { type: q.type });
    if (q.kpiPeriodId) qb.andWhere('l.kpiPeriodId = :kpiPeriodId', { kpiPeriodId: q.kpiPeriodId });
    const [items, total] = await qb.skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
    return { items, total };
  }

  /** Balance derived from the ledger — NEVER a stored value (spec 31/40). */
  async balance(userId: string, kpiPeriodId?: string) {
    const unit = (await this.settingsService.get(SALARY_UNIT_SETTING)) ?? VIRTUAL_SALARY_UNIT_DEFAULT;
    const rows = await this.ledger.find({ where: kpiPeriodId ? { userId, kpiPeriodId } : { userId } });
    const balance = sumLedgerAmounts(rows);
    const earnedThisPeriod = kpiPeriodId
      ? balance
      : rows.filter((r) => r.type === 'kpi_earning').reduce((sum, r) => sum + Number(r.amount), 0);
    const latestEntries = await this.ledger.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    return {
      balance,
      unit,
      virtual: true,
      earnedThisPeriod,
      latestEntries,
    };
  }

  /** Intern's own paginated ledger (spec 39). */
  async internLedger(userId: string, q: { page: number; pageSize: number; kpiPeriodId?: string }) {
    const qb = this.ledger
      .createQueryBuilder('l')
      .where('l.userId = :userId', { userId })
      .orderBy('l.createdAt', 'DESC');
    if (q.kpiPeriodId) qb.andWhere('l.kpiPeriodId = :kpiPeriodId', { kpiPeriodId: q.kpiPeriodId });
    const [items, total] = await qb.skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
    return { items, total };
  }

  private async readBaseConfig(): Promise<{ baseAmount: number; unit: string }> {
    const rawBase = await this.settingsService.get(SALARY_BASE_AMOUNT_SETTING);
    const baseAmount = Number(rawBase);
    if (!rawBase || !Number.isFinite(baseAmount) || baseAmount <= 0) {
      throw conflict(
        SALARY_ERROR_CODES.CONFIG_MISSING,
        'virtual_salary.base_amount is missing or invalid — refusing to invent a salary base (spec 34).',
      );
    }
    const unit = (await this.settingsService.get(SALARY_UNIT_SETTING)) ?? VIRTUAL_SALARY_UNIT_DEFAULT;
    return { baseAmount, unit };
  }
}
