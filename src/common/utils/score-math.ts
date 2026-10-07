/**
 * Deterministic score math (Phase 5) — PURE integer arithmetic.
 *
 * Floating-point aggregation (0.35*85 + 0.30*90 + ...) drifts
 * (83.14999999999999 → wrong rounding). Every Phase 5 score is therefore
 * computed in SCALED INTEGERS and rounded HALF-UP exactly once:
 *
 *   roundHalfUpScaled(numerator, denominator, decimals)
 *     = floor( numerator * 10^decimals / denominator + 1/2 )  (integers)
 *
 * Weights/scores cross the boundary as scaled integers:
 *   score (1dp)  → s10  = round(score * 10)        ∈ [0, 1000]
 *   weight (2dp) → w100 = round(weight * 100)      ∈ [0, 10000]
 */

/** Round `value` (any finite number) to `decimals` decimals, half-up. */
export function roundHalfUp(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  // Guard against FP drift of the scaled value itself.
  const scaled = value * factor;
  const floored = Math.floor(scaled);
  const fraction = scaled - floored;
  const rounded = fraction >= 0.5 ? floored + 1 : floored;
  return rounded / factor;
}

/**
 * Half-up integer division with explicit decimals:
 * roundHalfUp(numerator/denominator) * 10^decimals, as an INTEGER.
 */
export function roundHalfUpScaled(numerator: number, denominator: number, decimals: number): number {
  if (denominator <= 0) throw new Error('roundHalfUpScaled: denominator must be > 0');
  const scale = Math.pow(10, decimals);
  const scaled = numerator * scale;
  const quotient = Math.floor(scaled / denominator);
  const remainder = scaled - quotient * denominator;
  return remainder * 2 >= denominator ? quotient + 1 : quotient;
}

/** Normalized weight units: w100 = round(weight% * 100) → sums to 10000. */
export function weightToBasisPoints(weightPercent: number): number {
  return Math.round(weightPercent * 100);
}

/** Normalized score units: s10 = round(score * 10) → ∈ [0, 1000] for 0..100. */
export function scoreToTenths(score: number): number {
  return Math.round(score * 10);
}

/**
 * Weighted overall score (evaluation finalization — spec 12):
 *   overall = Σ(score_i × weight_i) / Σ(weight_i of SCORED criteria)
 * rounded HALF-UP to exactly one decimal.
 *
 * The denominator is the sum of the weights of the criteria that WERE
 * scored (documented renormalization — mirrors the KPI missing-component
 * policy). When every criterion is scored and weights total 100 this is
 * exactly the spec-12 formula Σ(score × weight) / 100.
 *
 * @param scored Array of { scoreTenths, weightBasisPoints }
 */
export function weightedOverallTenths(scored: Array<{ scoreTenths: number; weightBasisPoints: number }>): number {
  if (scored.length === 0) throw new Error('weightedOverallTenths: no scored criteria');
  let numerator = 0;
  let denominator = 0;
  for (const { scoreTenths, weightBasisPoints } of scored) {
    numerator += scoreTenths * weightBasisPoints;
    denominator += weightBasisPoints;
  }
  // overall(points) = N / (10*D); overall(tenths) = N / D — one integer division.
  return roundHalfUpScaled(numerator, denominator, 0);
}

/** Tenths (integer) → one-decimal number (e.g. 832 → 83.2). */
export function tenthsToOneDecimal(tenths: number): number {
  return tenths / 10;
}
