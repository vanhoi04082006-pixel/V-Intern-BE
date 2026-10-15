import { AiInvalidResponseError } from './ai-errors';
import { RECRUITMENT_ROLES, isRecruitmentRoleCode } from '../recruitment/recruitment-roles';

/**
 * STRICT structured-output contract for recruitment evaluation
 * (Phase 4, spec 29/30/36).
 *
 * The AI provider MAY return scores/criteria/feedback and even its own
 * `passed` / `decision` fields — they are IGNORED. The Backend is the ONLY
 * authority for PASS/FAIL (spec 5/36). Everything here is validated and
 * bounded so nothing unbounded/untrusted reaches persistence.
 */

export interface AiEvaluationCriterion {
  code: string;
  score: number;
  feedback: string;
}

/** Normalized, validated evaluation payload (provider decision removed). */
export interface RecruitmentEvaluationData {
  technicalScore: number;
  softSkillScore: number;
  criteria: AiEvaluationCriterion[];
  strengths: string[];
  weaknesses: string[];
  feedback: string;
  recommendedRole: string | null;
}

const MAX_CRITERIA = 32;
const MAX_LIST_ITEMS = 10;
const MAX_ITEM_LENGTH = 512;
const MAX_CRITERION_FEEDBACK = 2000;
const MAX_FEEDBACK = 4000;
export const INTERVIEW_CRITERIA = ['knowledge', 'communication', 'problem_solving', 'english', 'confidence', 'reasoning'] as const;

/** New conversational interviews require a complete skill assessment. Legacy results remain readable. */
export function validateDetailedRecruitmentEvaluation(raw: unknown): RecruitmentEvaluationData {
  const result = validateRecruitmentEvaluation(raw);
  const codes = new Set(result.criteria.map(c => c.code));
  if (result.criteria.length !== INTERVIEW_CRITERIA.length || !INTERVIEW_CRITERIA.every(c => codes.has(c))) {
    throw new AiInvalidResponseError('criteria must contain each of the six interview dimensions exactly once');
  }
  return result;
}

/** Scores are persisted decimal(5,1): normalize to one decimal (spec 35). */
export function normalizeScore(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AiInvalidResponseError(`${field} must be a finite number`);
  }
  const rounded = Math.round(value * 10) / 10;
  if (rounded < 0 || rounded > 100) {
    throw new AiInvalidResponseError(`${field} out of bounds (0..100): ${rounded}`);
  }
  return rounded;
}

function boundedString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new AiInvalidResponseError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new AiInvalidResponseError(`${field} must not be empty`);
  }
  if (trimmed.length > max) {
    throw new AiInvalidResponseError(`${field} exceeds ${max} characters`);
  }
  return trimmed;
}

function boundedStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new AiInvalidResponseError(`${field} must be an array`);
  }
  if (value.length > MAX_LIST_ITEMS) {
    throw new AiInvalidResponseError(`${field} exceeds ${MAX_LIST_ITEMS} items`);
  }
  return value.map((item, i) => boundedString(item, `${field}[${i}]`, MAX_ITEM_LENGTH));
}

/**
 * Validate the RAW provider payload. Provider-supplied final decisions
 * (`passed`, `decision`, `overallScore`, `totalScore`) are intentionally
 * NOT read — they cannot influence anything (spec 5/36).
 */
export function validateRecruitmentEvaluation(raw: unknown): RecruitmentEvaluationData {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AiInvalidResponseError('payload must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;

  const technicalScore = normalizeScore(obj.technicalScore, 'technicalScore');
  const softSkillScore = normalizeScore(obj.softSkillScore, 'softSkillScore');

  let criteria: AiEvaluationCriterion[] = [];
  if (obj.criteria !== undefined) {
    if (!Array.isArray(obj.criteria) || obj.criteria.length > MAX_CRITERIA) {
      throw new AiInvalidResponseError(`criteria must be an array of at most ${MAX_CRITERIA}`);
    }
    criteria = obj.criteria.map((item, i) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new AiInvalidResponseError(`criteria[${i}] must be an object`);
      }
      const c = item as Record<string, unknown>;
      return {
        code: boundedString(c.code, `criteria[${i}].code`, 64),
        score: normalizeScore(c.score, `criteria[${i}].score`),
        feedback: boundedString(c.feedback, `criteria[${i}].feedback`, MAX_CRITERION_FEEDBACK),
      };
    });
  }

  const strengths = obj.strengths === undefined ? [] : boundedStringList(obj.strengths, 'strengths');
  const weaknesses =
    obj.weaknesses === undefined ? [] : boundedStringList(obj.weaknesses, 'weaknesses');
  const feedback = boundedString(obj.feedback, 'feedback', MAX_FEEDBACK);

  let recommendedRole: string | null = null;
  if (obj.recommendedRole !== undefined && obj.recommendedRole !== null) {
    const role = boundedString(obj.recommendedRole, 'recommendedRole', 32);
    if (!isRecruitmentRoleCode(role)) {
      throw new AiInvalidResponseError(
        `recommendedRole must be one of: ${RECRUITMENT_ROLES.map((r) => r.code).join(', ')}`,
      );
    }
    recommendedRole = role;
  }

  return { technicalScore, softSkillScore, criteria, strengths, weaknesses, feedback, recommendedRole };
}
