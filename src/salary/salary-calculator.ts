/**
 * Virtual salary calculations (Phase 5, spec 34/35/37/38) — PURE.
 * The base amount ALWAYS comes from the virtual_salary.base_amount system
 * setting; a missing/invalid setting is a hard failure, never an invented
 * number (spec 34).
 */
export const SALARY_ERROR_CODES = {
  CONFIG_MISSING: 'VIRTUAL_SALARY_CONFIG_MISSING',
  ALREADY_GENERATED: 'VIRTUAL_SALARY_ALREADY_GENERATED',
  INVALID_ADJUSTMENT: 'VIRTUAL_SALARY_INVALID_ADJUSTMENT',
  PERIOD_NOT_FINALIZED: 'KPI_PERIOD_NOT_FINALIZED',
  LEDGER_ROW_NOT_FOUND: 'VIRTUAL_SALARY_LEDGER_ROW_NOT_FOUND',
  ALREADY_REVERSED: 'VIRTUAL_SALARY_ALREADY_REVERSED',
} as const;

/**
 * earned = baseAmount × (KPI score / 100), rounded HALF-UP to integer
 * virtual units (spec 35: 10,000,000 base × 83.8% → 8,380,000).
 */
export function calculateKpiEarning(baseAmount: number, finalScore: number): number {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    throw new Error(SALARY_ERROR_CODES.CONFIG_MISSING);
  }
  if (!Number.isFinite(finalScore) || finalScore < 0 || finalScore > 100) {
    throw new Error('KPI finalScore out of bounds');
  }
  return roundHalfUpInt((baseAmount * finalScore) / 100);
}

function roundHalfUpInt(value: number): number {
  return Math.floor(value + 0.5);
}

export type SalaryAdjustmentType = 'bonus' | 'penalty' | 'adjustment' | 'reversal';

export interface AdjustmentValidation {
  /** Signed amount persisted to the ledger (bonus > 0, penalty < 0). */
  amount: number;
  type: SalaryAdjustmentType;
}

export class AdjustmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdjustmentError';
  }
}

/**
 * Adjustment validation (spec 37/38) — signed decimal semantics:
 *   bonus      → amount must be > 0 (stored positive)
 *   penalty    → amount must be > 0 (stored NEGATIVE)
 *   adjustment → signed, may be positive or negative, never zero
 *   reversal   → amount is IGNORED (derived from the source row); requires
 *                a referenced source ledger row.
 */
export function validateAdjustment(type: SalaryAdjustmentType, rawAmount: number): AdjustmentValidation {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) {
    throw new AdjustmentError('amount must be a finite number');
  }
  switch (type) {
    case 'bonus':
      if (amount <= 0) throw new AdjustmentError('bonus amount must be greater than 0');
      return { type, amount };
    case 'penalty':
      if (amount <= 0) throw new AdjustmentError('penalty amount must be greater than 0');
      return { type, amount: -amount };
    case 'adjustment':
      if (amount === 0) throw new AdjustmentError('adjustment amount must not be zero');
      return { type, amount };
    case 'reversal':
      throw new AdjustmentError('reversal must reference an existing ledger row (amount is derived)');
    default:
      throw new AdjustmentError('unknown adjustment type');
  }
}

/** The deterministic idempotency key for a KPI earning (spec 36). */
export function kpiEarningIdempotencyKey(periodId: string, userId: string): string {
  return `kpi-period:${periodId}:user:${userId}:kpi-earning:v1`;
}

/** Ledger-derived balance (spec 31/40) — NEVER a stored mutable balance. */
export function sumLedgerAmounts(rows: Array<{ amount: number }>): number {
  return Math.round(rows.reduce((sum, r) => sum + Number(r.amount), 0) * 100) / 100;
}
