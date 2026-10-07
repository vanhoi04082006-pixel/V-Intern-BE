/**
 * AUTHORITATIVE recruitment scoring (Phase 4, spec 4/35/36) — pure math.
 *
 *   Overall = round1( round1(technical) * 0.7 + round1(soft) * 0.3 )
 *   PASS    = Overall >= 70.0
 *
 * The Backend computes this — the AI provider NEVER determines the
 * decision (spec 5/36). Required exact results (unit-tested):
 *   85/72 → 81.1 (PASS)   — NOT 81.2
 *   58/72 → 62.2 (FAIL)
 *   70/70 → 70.0 (PASS)   — threshold inclusive
 *   69.9  → FAIL
 */
export const TECHNICAL_WEIGHT = 0.7;
export const SOFT_WEIGHT = 0.3;
export const PASS_THRESHOLD = 70.0;

/** Round to exactly ONE decimal place (spec 4), drift-safe. */
export function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function calculateOverallScore(technical: number, soft: number): number {
  const t = roundToOneDecimal(technical);
  const s = roundToOneDecimal(soft);
  return roundToOneDecimal(t * TECHNICAL_WEIGHT + s * SOFT_WEIGHT);
}

export type RecruitmentDecision = 'passed' | 'failed';

/** Single decision function — threshold inclusive (>= 70.0). */
export function decideRecruitment(overallScore: number): RecruitmentDecision {
  return overallScore >= PASS_THRESHOLD ? 'passed' : 'failed';
}

export function isRecruitmentPass(overallScore: number): boolean {
  return decideRecruitment(overallScore) === 'passed';
}
