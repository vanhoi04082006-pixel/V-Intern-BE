import { AiInvalidResponseError } from '../ai-errors';

/**
 * STRICT structured-output contract for AI evaluation assistance
 * (Phase 6, spec 23/24/47).
 *
 * AUTHORITY: the AI suggestion is NON-AUTHORITATIVE (spec 24/47). It is
 * persisted ONLY as instructor workspace data; it NEVER writes into
 * evaluation_scores and NEVER changes an evaluation's status or overall.
 * Applying values happens exclusively through the normal authorized
 * EvaluationService flow with the Instructor's explicit action.
 *
 * VALIDATION (spec 23):
 * - every criterionCode MUST belong to the evaluation's cycle criteria
 *   (unknown code → AI_INVALID_RESPONSE, whole payload rejected);
 * - suggestedScore must be a finite 0..100 number within the matched
 *   criterion's maxScore (a suggestion the instructor could not legally
 *   enter is rejected, not clamped);
 * - all strings bounded; confidence ∈ [0,1];
 * - provider decision fields beyond the schema are rejected.
 */

export interface AiEvaluationCriterionSuggestion {
  criterionCode: string;
  suggestedScore: number;
  evidence: string[];
  comment: string | null;
}

/** Normalized, validated suggestion payload (nothing authoritative). */
export interface EvaluationSuggestionData {
  criterionSuggestions: AiEvaluationCriterionSuggestion[];
  strengths: string[];
  improvementAreas: string[];
  summary: string;
  confidence: number;
}

/** The cycle-scoped criteria the validator is allowed to accept (spec 23). */
export interface SuggestionCriterionContext {
  code: string;
  maxScore: number;
}

const MAX_CRITERIA_SUGGESTIONS = 32;
const MAX_EVIDENCE_ITEMS = 6;
const MAX_EVIDENCE_CHARS = 300;
const MAX_COMMENT_CHARS = 1000;
const MAX_LIST_ITEMS = 8;
const MAX_LIST_ITEM_CHARS = 300;
const MAX_SUMMARY_CHARS = 2000;

/**
 * Validate a raw provider payload against the REAL criteria of the
 * evaluation's cycle. Anything referencing an unknown criterion code is
 * rejected whole (spec 23/50 — no partial persistence of invalid output).
 */
export function validateEvaluationSuggestion(
  raw: unknown,
  criteria: SuggestionCriterionContext[],
): EvaluationSuggestionData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new AiInvalidResponseError('evaluation suggestion must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const allowed = new Map(criteria.map((c) => [c.code, c]));
  if (allowed.size === 0) {
    throw new AiInvalidResponseError('evaluation cycle has no criteria to suggest against');
  }

  if (!Array.isArray(obj.criterionSuggestions)) {
    throw new AiInvalidResponseError('criterionSuggestions must be an array');
  }
  if (obj.criterionSuggestions.length > MAX_CRITERIA_SUGGESTIONS) {
    throw new AiInvalidResponseError(
      `criterionSuggestions exceeds ${MAX_CRITERIA_SUGGESTIONS} items`,
    );
  }
  const seen = new Set<string>();
  const criterionSuggestions = obj.criterionSuggestions.map((item, i) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new AiInvalidResponseError(`criterionSuggestions[${i}] must be an object`);
    }
    const rec = item as Record<string, unknown>;
    const code =
      typeof rec.criterionCode === 'string' ? rec.criterionCode.trim() : '';
    if (!code || !allowed.has(code)) {
      // Unknown criterion code — the model referenced a criterion that does
      // not exist in this cycle (spec 23/50).
      throw new AiInvalidResponseError(
        `criterionSuggestions[${i}].criterionCode '${code || '<missing>'}' is not a criterion of this evaluation cycle`,
      );
    }
    if (seen.has(code)) {
      throw new AiInvalidResponseError(`criterionSuggestions has duplicate criterionCode '${code}'`);
    }
    seen.add(code);
    const suggestedScore = normalizeSuggestedScore(rec.suggestedScore, `criterionSuggestions[${i}].suggestedScore`);
    const maxScore = allowed.get(code)!.maxScore;
    if (suggestedScore > maxScore) {
      throw new AiInvalidResponseError(
        `criterionSuggestions[${i}].suggestedScore ${suggestedScore} exceeds criterion '${code}' maxScore ${maxScore}`,
      );
    }
    return {
      criterionCode: code,
      suggestedScore,
      evidence: boundedList(rec.evidence, `criterionSuggestions[${i}].evidence`, MAX_EVIDENCE_ITEMS, MAX_EVIDENCE_CHARS),
      comment: optionalBoundedText(rec.comment, `criterionSuggestions[${i}].comment`, MAX_COMMENT_CHARS),
    };
  });

  return {
    criterionSuggestions,
    strengths: boundedList(obj.strengths, 'strengths', MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
    improvementAreas: boundedList(obj.improvementAreas, 'improvementAreas', MAX_LIST_ITEMS, MAX_LIST_ITEM_CHARS),
    summary: boundedText(obj.summary, 'summary', MAX_SUMMARY_CHARS),
    confidence: normalizeConfidence(obj.confidence),
  };
}

/** Scores persist as decimal(5,1): one decimal place, 0..100 (spec 35). */
function normalizeSuggestedScore(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AiInvalidResponseError(`${field} must be a finite number`);
  }
  const rounded = Math.round(value * 10) / 10;
  if (rounded < 0 || rounded > 100) {
    throw new AiInvalidResponseError(`${field} out of bounds (0..100): ${rounded}`);
  }
  return rounded;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new AiInvalidResponseError('confidence must be a number between 0 and 1');
  }
  return Math.round(value * 100) / 100;
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

function optionalBoundedText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  return boundedText(value, field, max);
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
