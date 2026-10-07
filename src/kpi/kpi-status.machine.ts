/**
 * KpiPeriod state machine (Phase 5, spec 23/27/28) — explicit transitions.
 *
 *   draft → open
 *   open → calculating        (a calculation batch starts)
 *   calculating → open        (batch finished/failed — results persisted,
 *                              recalculation stays allowed pre-finalize)
 *   open → finalized          (explicit finalize; locks the period)
 *   finalized → closed        (terminal bookkeeping step)
 *   closed → (terminal)
 */
export const KPI_PERIOD_STATUSES = ['draft', 'open', 'calculating', 'finalized', 'closed'] as const;
export type KpiPeriodStatus = (typeof KPI_PERIOD_STATUSES)[number];

export const KPI_PERIOD_TRANSITIONS: Record<KpiPeriodStatus, readonly KpiPeriodStatus[]> = {
  draft: ['open'],
  open: ['calculating', 'finalized'],
  calculating: ['open'],
  finalized: ['closed'],
  closed: [],
};

export function canTransitionKpiPeriod(from: KpiPeriodStatus, to: KpiPeriodStatus): boolean {
  return KPI_PERIOD_TRANSITIONS[from].includes(to);
}

export const KPI_RULE_VERSION_V1 = 'kpi-v1';

/** Error codes (spec 65). */
export const KPI_ERROR_CODES = {
  PERIOD_NOT_FOUND: 'KPI_PERIOD_NOT_FOUND',
  PERIOD_NOT_CALCULABLE: 'KPI_PERIOD_NOT_CALCULABLE',
  INSUFFICIENT_DATA: 'KPI_INSUFFICIENT_DATA',
  ALREADY_FINALIZED: 'KPI_ALREADY_FINALIZED',
  INVALID_TRANSITION: 'INVALID_KPI_PERIOD_TRANSITION',
  CALCULATION_IN_PROGRESS: 'KPI_CALCULATION_IN_PROGRESS',
  PERIOD_NOT_EDITABLE: 'KPI_PERIOD_NOT_EDITABLE',
  PERIOD_NOT_FINALIZED: 'KPI_PERIOD_NOT_FINALIZED',
  RESULT_NOT_FOUND: 'KPI_RESULT_NOT_FOUND',
} as const;
