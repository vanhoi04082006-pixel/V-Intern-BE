import {
  calculateKpiEarning,
  AdjustmentError,
  kpiEarningIdempotencyKey,
  sumLedgerAmounts,
  validateAdjustment,
} from './salary-calculator';

describe('virtual salary calculator (spec 34-38)', () => {
  it('spec 35 example: base 10,000,000 × 83.8% → 8,380,000', () => {
    expect(calculateKpiEarning(10_000_000, 83.8)).toBe(8_380_000);
  });

  it('rounds half-up to integer virtual units', () => {
    expect(calculateKpiEarning(10_000_000, 83.75)).toBe(8_375_000);
    expect(calculateKpiEarning(999, 50)).toBe(500); // 499.5 → 500
  });

  it('missing/invalid base configuration is a hard failure (spec 34)', () => {
    expect(() => calculateKpiEarning(0, 83.8)).toThrow('VIRTUAL_SALARY_CONFIG_MISSING');
    expect(() => calculateKpiEarning(NaN, 83.8)).toThrow('VIRTUAL_SALARY_CONFIG_MISSING');
    expect(() => calculateKpiEarning(10_000_000, 101)).toThrow('finalScore out of bounds');
  });

  it('adjustments: bonus positive, penalty stored negative, adjustment signed, zero forbidden', () => {
    expect(validateAdjustment('bonus', 500_000)).toEqual({ type: 'bonus', amount: 500_000 });
    expect(validateAdjustment('penalty', 200_000)).toEqual({ type: 'penalty', amount: -200_000 });
    expect(validateAdjustment('adjustment', -50)).toEqual({ type: 'adjustment', amount: -50 });
    expect(validateAdjustment('adjustment', 50)).toEqual({ type: 'adjustment', amount: 50 });
    expect(() => validateAdjustment('bonus', 0)).toThrow(AdjustmentError);
    expect(() => validateAdjustment('penalty', 0)).toThrow(AdjustmentError);
    expect(() => validateAdjustment('adjustment', 0)).toThrow(AdjustmentError);
    expect(() => validateAdjustment('reversal', 100)).toThrow(AdjustmentError);
  });

  it('idempotency key is deterministic per period+user (spec 36)', () => {
    expect(kpiEarningIdempotencyKey('p1', 'u1')).toBe('kpi-period:p1:user:u1:kpi-earning:v1');
    expect(kpiEarningIdempotencyKey('p1', 'u1')).toBe(kpiEarningIdempotencyKey('p1', 'u1'));
    expect(kpiEarningIdempotencyKey('p1', 'u2')).not.toBe(kpiEarningIdempotencyKey('p1', 'u1'));
  });

  it('balance is derived from the ledger (spec 31) — signed sum', () => {
    expect(sumLedgerAmounts([{ amount: 8_380_000 }, { amount: 500_000 }, { amount: -200_000 }])).toBe(8_680_000);
    expect(sumLedgerAmounts([])).toBe(0);
  });
});
