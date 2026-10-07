import { AiInvalidResponseError } from '../ai-errors';

/**
 * STRICT structured-output contract for AI recommendations
 * (Phase 6, spec 29-31/50).
 *
 * GROUNDING (spec 31): every recommendation's evidenceMetricCodes MUST
 * reference metrics the Backend actually supplied in the source snapshot.
 * An unknown metric code rejects the WHOLE provider output
 * (AI_INVALID_RESPONSE) — nothing partial is persisted (spec 50).
 *
 * CATEGORIES (spec 29): fixed enum only — the model never invents types.
 * The recommendation is ADVISORY: it never mutates tasks/evaluations/KPI.
 */

/** Fixed recommendation categories (spec 29 — no random categories). */
export const RECOMMENDATION_TYPES = [
  'skill_focus',
  'delivery_improvement',
  'quality_improvement',
  'time_management',
  'communication',
  'next_task_focus',
  'sprint_focus',
  'career_growth',
] as const;

export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

/**
 * The ONLY metric codes the provider may cite as evidence (spec 30/31) —
 * exactly the deterministic metrics supplied in the source snapshot.
 */
export const RECOMMENDATION_METRIC_CODES = [
  'taskCompletionRate',
  'storyPointCompletionRate',
  'onTimeCompletionRate',
  'averageEvaluationScore',
  'kpiFinalScore',
  'overdueOpenTaskCount',
  'activeSprintProgress',
  'completedTaskCount',
  'totalTaskCount',
  'completedStoryPoints',
  'committedStoryPoints',
] as const;

export type RecommendationMetricCode = (typeof RECOMMENDATION_METRIC_CODES)[number];

export type RecommendationPriority = 'high' | 'medium' | 'low';

export interface AiRecommendation {
  type: RecommendationType;
  priority: RecommendationPriority;
  title: string;
  reason: string;
  actions: string[];
  evidenceMetricCodes: RecommendationMetricCode[];
}

/** Normalized, validated recommendation payload. */
export interface RecommendationData {
  recommendations: AiRecommendation[];
  summary: string;
}

const MAX_RECOMMENDATIONS = 8;
const MAX_TITLE_CHARS = 200;
const MAX_REASON_CHARS = 800;
const MAX_ACTIONS = 5;
const MAX_ACTION_CHARS = 200;
const MAX_EVIDENCE_CODES = 5;
const MAX_SUMMARY_CHARS = 1000;

export function validateRecommendations(raw: unknown): RecommendationData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiInvalidResponseError('recommendations must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.recommendations)) {
    throw new AiInvalidResponseError('recommendations must be an array');
  }
  if (obj.recommendations.length < 1) {
    throw new AiInvalidResponseError('recommendations must contain at least one item');
  }
  if (obj.recommendations.length > MAX_RECOMMENDATIONS) {
    throw new AiInvalidResponseError(`recommendations exceeds ${MAX_RECOMMENDATIONS} items`);
  }
  const items = obj.recommendations.map((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new AiInvalidResponseError(`recommendations[${i}] must be an object`);
    }
    const rec = item as Record<string, unknown>;
    const type = typeof rec.type === 'string' ? rec.type : '';
    if (!(RECOMMENDATION_TYPES as readonly string[]).includes(type)) {
      throw new AiInvalidResponseError(`recommendations[${i}].type '${type}' is not an allowed category`);
    }
    const priority = typeof rec.priority === 'string' ? rec.priority : '';
    if (!(['high', 'medium', 'low'] as string[]).includes(priority)) {
      throw new AiInvalidResponseError(`recommendations[${i}].priority must be high|medium|low`);
    }
    const evidenceCodes = rec.evidenceMetricCodes;
    if (!Array.isArray(evidenceCodes) || evidenceCodes.length === 0) {
      throw new AiInvalidResponseError(
        `recommendations[${i}].evidenceMetricCodes must be a non-empty array`,
      );
    }
    if (evidenceCodes.length > MAX_EVIDENCE_CODES) {
      throw new AiInvalidResponseError(
        `recommendations[${i}].evidenceMetricCodes exceeds ${MAX_EVIDENCE_CODES} items`,
      );
    }
    const codes = evidenceCodes.map((c) => {
      if (typeof c !== 'string') {
        throw new AiInvalidResponseError(`recommendations[${i}].evidenceMetricCodes must be strings`);
      }
      if (!(RECOMMENDATION_METRIC_CODES as readonly string[]).includes(c)) {
        // Unknown/made-up metric reference (spec 50) — reject whole output.
        throw new AiInvalidResponseError(
          `recommendations[${i}].evidenceMetricCodes references unknown metric '${c}'`,
        );
      }
      return c as RecommendationMetricCode;
    });
    return {
      type: type as RecommendationType,
      priority: priority as RecommendationPriority,
      title: boundedText(rec.title, `recommendations[${i}].title`, MAX_TITLE_CHARS),
      reason: boundedText(rec.reason, `recommendations[${i}].reason`, MAX_REASON_CHARS),
      actions: boundedList(rec.actions, `recommendations[${i}].actions`, MAX_ACTIONS, MAX_ACTION_CHARS),
      evidenceMetricCodes: [...new Set(codes)],
    };
  });
  return {
    recommendations: items,
    summary: boundedText(obj.summary, 'summary', MAX_SUMMARY_CHARS),
  };
}

function boundedText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new AiInvalidResponseError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new AiInvalidResponseError(`${field} must not be empty`);
  if (trimmed.length > max) throw new AiInvalidResponseError(`${field} exceeds ${max} characters`);
  return trimmed;
}

function boundedList(value: unknown, field: string, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) {
    throw new AiInvalidResponseError(`${field} must be an array`);
  }
  if (value.length > maxItems) {
    throw new AiInvalidResponseError(`${field} exceeds ${maxItems} items`);
  }
  return value.map((item, i) => boundedText(item, `${field}[${i}]`, maxChars));
}
