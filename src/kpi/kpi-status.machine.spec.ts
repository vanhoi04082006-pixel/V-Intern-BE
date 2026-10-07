import { canTransitionKpiPeriod, KPI_PERIOD_STATUSES } from './kpi-status.machine';

describe('KpiPeriod state machine (spec 23)', () => {
  it('allows the documented transitions', () => {
    expect(canTransitionKpiPeriod('draft', 'open')).toBe(true);
    expect(canTransitionKpiPeriod('open', 'calculating')).toBe(true);
    expect(canTransitionKpiPeriod('calculating', 'open')).toBe(true);
    expect(canTransitionKpiPeriod('open', 'finalized')).toBe(true);
    expect(canTransitionKpiPeriod('finalized', 'closed')).toBe(true);
  });

  it('rejects finalize from draft/calculating and silent recalculation after finalize', () => {
    expect(canTransitionKpiPeriod('draft', 'finalized')).toBe(false);
    expect(canTransitionKpiPeriod('draft', 'calculating')).toBe(false);
    expect(canTransitionKpiPeriod('calculating', 'finalized')).toBe(false);
    expect(canTransitionKpiPeriod('finalized', 'calculating')).toBe(false);
    expect(canTransitionKpiPeriod('finalized', 'open')).toBe(false);
    expect(canTransitionKpiPeriod('closed', 'open')).toBe(false);
    expect(canTransitionKpiPeriod('closed', 'finalized')).toBe(false);
  });

  it('closed is terminal', () => {
    for (const status of KPI_PERIOD_STATUSES) {
      expect(canTransitionKpiPeriod('closed', status)).toBe(false);
    }
  });
});
