import {
  roundHalfUp,
  roundHalfUpScaled,
  scoreToTenths,
  tenthsToOneDecimal,
  weightedOverallTenths,
  weightToBasisPoints,
} from './score-math';

describe('score-math (Phase 5 deterministic rounding)', () => {
  it('roundHalfUp: 83.75 → 83.8 (half-up, not banker rounding)', () => {
    expect(roundHalfUp(83.75, 1)).toBe(83.8);
  });

  it('roundHalfUp: 62.24999999 (FP drift) → 62.2', () => {
    expect(roundHalfUp(62.24999999999999, 1)).toBe(62.2);
  });

  it('roundHalfUpScaled: integer half-up division', () => {
    expect(roundHalfUpScaled(5, 2, 0)).toBe(3); // 2.5 → 3
    expect(roundHalfUpScaled(675, 10, 0)).toBe(68); // 67.5 → 68
    expect(roundHalfUpScaled(674, 10, 0)).toBe(67); // 67.4 → 67
  });

  it('weightedOverallTenths: 85/90/72/80 with 35/30/20/15 → 83.2', () => {
    const tenths = weightedOverallTenths([
      { scoreTenths: scoreToTenths(85), weightBasisPoints: weightToBasisPoints(35) },
      { scoreTenths: scoreToTenths(90), weightBasisPoints: weightToBasisPoints(30) },
      { scoreTenths: scoreToTenths(72), weightBasisPoints: weightToBasisPoints(20) },
      { scoreTenths: scoreToTenths(80), weightBasisPoints: weightToBasisPoints(15) },
    ]);
    expect(tenthsToOneDecimal(tenths)).toBe(83.2); // 83.15 → 83.2 half-up
  });

  it('weightedOverallTenths renormalizes over SCORED criteria only', () => {
    // 85 (w35) + 90 (w30) scored; 72 (w20) + 80 (w15) missing:
    // (85×35 + 90×30)/65 = (2975+2700)/65 = 87.307… → 87.3
    const tenths = weightedOverallTenths([
      { scoreTenths: scoreToTenths(85), weightBasisPoints: weightToBasisPoints(35) },
      { scoreTenths: scoreToTenths(90), weightBasisPoints: weightToBasisPoints(30) },
    ]);
    expect(tenthsToOneDecimal(tenths)).toBe(87.3);
  });

  it('weightedOverallTenths: full 100-weight scoring equals Σ(score×weight)/100', () => {
    // 80×50 + 90×50 = 85.0 exactly
    const tenths = weightedOverallTenths([
      { scoreTenths: scoreToTenths(80), weightBasisPoints: weightToBasisPoints(50) },
      { scoreTenths: scoreToTenths(90), weightBasisPoints: weightToBasisPoints(50) },
    ]);
    expect(tenthsToOneDecimal(tenths)).toBe(85.0);
  });

  it('weightToBasisPoints / scoreToTenths are exact scalings', () => {
    expect(weightToBasisPoints(35)).toBe(3500);
    expect(weightToBasisPoints(12.5)).toBe(1250);
    expect(scoreToTenths(85.3)).toBe(853);
  });
});
