/**
 * KPI rule kpi-v1 (Phase 5, spec 24-26) — DETERMINISTIC, versioned, pure.
 *
 *   delivery   50%  = storyPointCompletionRate ?? taskCompletionRate
 *   quality    30%  = average finalized instructor evaluation score
 *   timeliness 20%  = onTimeCompletionRate
 *
 * MISSING-COMPONENT POLICY (spec 25): an unavailable component is NEVER a
 * zero. Weights renormalize over the AVAILABLE components:
 *   KPI = Σ(value_i × w_i) / Σ(w_i available)
 * ALL components unavailable → insufficient_data (no score, no penalty).
 *
 * All math is integer-based (see common/utils/score-math.ts) and rounded
 * HALF-UP to exactly ONE decimal place.
 */
import { roundHalfUpScaled, scoreToTenths, tenthsToOneDecimal, weightToBasisPoints } from '../common/utils/score-math';

export const KPI_V1_WEIGHTS = {
  delivery: 50,
  quality: 30,
  timeliness: 20,
} as const;

export type KpiV1MetricCode = keyof typeof KPI_V1_WEIGHTS;

export interface KpiComponentInput {
  /** 0..100 (one decimal) or null = unavailable (spec 25). */
  delivery: number | null;
  quality: number | null;
  timeliness: number | null;
}

export interface KpiComponentOutcome {
  metricCode: KpiV1MetricCode;
  configuredWeight: number;
  effectiveWeight: number | null;
  sourceValue: number | null;
  /** value × effectiveWeight / 100 (4dp) — null when unavailable. */
  weightedContribution: number | null;
}

export interface KpiV1Outcome {
  status: 'calculated' | 'insufficient_data';
  /** One-decimal 0..100 or null for insufficient_data. */
  finalScore: number | null;
  components: KpiComponentOutcome[];
  /** Sums the provenance rows carry (audit support). */
  availableWeightSum: number;
}

/**
 * The deterministic kpi-v1 computation.
 * Spec example (§25): delivery=80, quality=90, timeliness=unavailable →
 * (80×50 + 90×30) / 80 = 83.75 → 83.8 (half-up).
 */
export function calculateKpiV1(input: KpiComponentInput): KpiV1Outcome {
  const codes: KpiV1MetricCode[] = ['delivery', 'quality', 'timeliness'];
  const available = codes.filter((c) => input[c] !== null && input[c] !== undefined);

  const components: KpiComponentOutcome[] = codes.map((code) => {
    const configuredWeight = KPI_V1_WEIGHTS[code];
    const sourceValue = input[code] ?? null;
    if (sourceValue === null) {
      return { metricCode: code, configuredWeight, effectiveWeight: null, sourceValue: null, weightedContribution: null };
    }
    const effectiveWeight = Math.round((configuredWeight / sumWeights(available)) * 10000) / 100;
    const contribution = Math.round(((sourceValue * effectiveWeight) / 100) * 10000) / 10000;
    return { metricCode: code, configuredWeight, effectiveWeight, sourceValue, weightedContribution: contribution };
  });

  if (available.length === 0) {
    return { status: 'insufficient_data', finalScore: null, components, availableWeightSum: 0 };
  }

  // Integer half-up aggregation over available components:
  // tenths = Σ(v10 × w100) / Σ(w100 available)
  let numerator = 0;
  let denominator = 0;
  for (const code of available) {
    numerator += scoreToTenths(input[code] as number) * weightToBasisPoints(KPI_V1_WEIGHTS[code]);
    denominator += weightToBasisPoints(KPI_V1_WEIGHTS[code]);
  }
  const finalTenths = roundHalfUpScaled(numerator, denominator, 0);
  return { status: 'calculated', finalScore: tenthsToOneDecimal(finalTenths), components, availableWeightSum: denominator / 100 };
}

function sumWeights(codes: KpiV1MetricCode[]): number {
  return codes.reduce((sum, c) => sum + KPI_V1_WEIGHTS[c], 0);
}
