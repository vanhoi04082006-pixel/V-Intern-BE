import {
  PASS_THRESHOLD,
  calculateOverallScore,
  decideRecruitment,
  roundToOneDecimal,
} from './scoring';

/**
 * AUTHORITATIVE scoring tests (Phase 4 spec 4/35/62) — the exact approved
 * values, including the historical 81.1-NOT-81.2 case.
 */
describe('recruitment scoring — Overall = 0.7×Technical + 0.3×Soft (spec 4/62)', () => {
  it('85 technical / 72 soft → 81.1 PASS (approved example — NOT 81.2)', () => {
    expect(calculateOverallScore(85, 72)).toBe(81.1);
    expect(decideRecruitment(calculateOverallScore(85, 72))).toBe('passed');
  });

  it('58 technical / 72 soft → 62.2 FAIL (approved example)', () => {
    expect(calculateOverallScore(58, 72)).toBe(62.2);
    expect(decideRecruitment(calculateOverallScore(58, 72))).toBe('failed');
  });

  it('70/70 → 70.0 PASS (threshold inclusive)', () => {
    expect(calculateOverallScore(70, 70)).toBe(70);
    expect(decideRecruitment(70)).toBe('passed');
    expect(decideRecruitment(PASS_THRESHOLD)).toBe('passed');
  });

  it('69.9/69.9 → 69.9 FAIL (just below threshold)', () => {
    expect(calculateOverallScore(69.9, 69.9)).toBe(69.9);
    expect(decideRecruitment(69.9)).toBe('failed');
  });

  it('rounds to exactly ONE decimal (spec 4)', () => {
    expect(roundToOneDecimal(81.10000000000001)).toBe(81.1);
    expect(roundToOneDecimal(62.20000000000001)).toBe(62.2);
    expect(roundToOneDecimal(70.049999)).toBe(70);
    expect(roundToOneDecimal(70.05)).toBe(70.1);
    // 0.7*83 + 0.3*71 = 58.1 + 21.3 = 79.4
    expect(calculateOverallScore(83, 71)).toBe(79.4);
  });

  it('normalizes fractional AI scores before weighting (spec 35)', () => {
    // 85.5 → 59.85; 72.4 → 21.72; sum 81.57 → 81.6
    expect(calculateOverallScore(85.5, 72.4)).toBe(81.6);
    // 0/0 → 0.0 FAIL; 100/100 → 100.0 PASS
    expect(calculateOverallScore(0, 0)).toBe(0);
    expect(decideRecruitment(calculateOverallScore(0, 0))).toBe('failed');
    expect(calculateOverallScore(100, 100)).toBe(100);
    expect(decideRecruitment(calculateOverallScore(100, 100))).toBe('passed');
  });

  it('decision boundary sweep around 70', () => {
    expect(decideRecruitment(69.95)).toBe('failed'); // rounds to 70.0? no: 69.95 < 70 → failed
    expect(decideRecruitment(70.0)).toBe('passed');
    expect(decideRecruitment(70.1)).toBe('passed');
  });
});
