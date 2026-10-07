import { calculateKpiV1, KPI_V1_WEIGHTS } from './kpi-formula';

describe('kpi-v1 formula (spec 24-26)', () => {
  it('full three components with weights 50/30/20', () => {
    // (80×50 + 90×30 + 87×20) / 100 = (4000+2700+1740)/100 = 84.4
    const out = calculateKpiV1({ delivery: 80, quality: 90, timeliness: 87 });
    expect(out.status).toBe('calculated');
    expect(out.finalScore).toBe(84.4);
    expect(out.components.map((c) => c.configuredWeight)).toEqual([50, 30, 20]);
    expect(out.components.map((c) => c.effectiveWeight)).toEqual([50, 30, 20]);
  });

  it('spec 25 example: timeliness missing → renormalized 83.8 (not zero-penalized)', () => {
    const out = calculateKpiV1({ delivery: 80, quality: 90, timeliness: null });
    expect(out.status).toBe('calculated');
    expect(out.finalScore).toBe(83.8); // (80×50+90×30)/80 = 83.75 → 83.8
    const timeliness = out.components.find((c) => c.metricCode === 'timeliness');
    expect(timeliness?.effectiveWeight).toBeNull();
    expect(timeliness?.weightedContribution).toBeNull();
    expect(out.availableWeightSum).toBe(80);
  });

  it('two components missing → remaining weight carries everything', () => {
    // delivery only: (80×50)/50 = 80.0
    const out = calculateKpiV1({ delivery: 80, quality: null, timeliness: null });
    expect(out.status).toBe('calculated');
    expect(out.finalScore).toBe(80.0);
    const delivery = out.components.find((c) => c.metricCode === 'delivery');
    expect(delivery?.effectiveWeight).toBe(100);
  });

  it('ALL components missing → insufficient_data with no score', () => {
    const out = calculateKpiV1({ delivery: null, quality: null, timeliness: null });
    expect(out.status).toBe('insufficient_data');
    expect(out.finalScore).toBeNull();
    expect(out.availableWeightSum).toBe(0);
    expect(out.components.every((c) => c.effectiveWeight === null)).toBe(true);
  });

  it('rounding is half-up to exactly one decimal', () => {
    // delivery 83.75-equivalent: (83.75×50+90×30+87×20)/100
    const out = calculateKpiV1({ delivery: 83.75 as number, quality: 90, timeliness: 87 });
    // (4187.5 + 2700 + 1740)/100 = 86.275 → 86.3
    expect(out.finalScore).toBe(86.3);
  });

  it('fixed weights are the documented kpi-v1 policy', () => {
    expect(KPI_V1_WEIGHTS).toEqual({ delivery: 50, quality: 30, timeliness: 20 });
  });
});
