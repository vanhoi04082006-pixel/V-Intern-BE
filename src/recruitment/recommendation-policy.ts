import { AiInvalidResponseError } from '../ai/ai-errors';
import { validateDetailedRecruitmentEvaluation, validateRecruitmentEvaluation, type RecruitmentEvaluationData } from '../ai/evaluation-schema';
import { calculateOverallScore, classifyRecruitmentScore } from './scoring';
import { RECRUITMENT_ROLES, type RecruitmentRoleDef } from './recruitment-roles';

/** Validate answer-backed guidance while retaining the existing result/storage contract. */
export function validateRoleAwareRecruitmentEvaluation(raw: unknown, context: {
  roleCode: string;
  detailed: boolean;
  answers: readonly { position: number; answerText: string; followUp?: { answer: string } }[];
  availableRoles?: readonly RecruitmentRoleDef[];
}): RecruitmentEvaluationData {
  const catalog = context.availableRoles ?? RECRUITMENT_ROLES;
  const allowedCodes = catalog.map(role => role.code);
  const result = context.detailed ? validateDetailedRecruitmentEvaluation(raw, allowedCodes) : validateRecruitmentEvaluation(raw, allowedCodes);
  const overall = calculateOverallScore(result.technicalScore, result.softSkillScore);
  if (classifyRecruitmentScore(overall) !== 'role_recommended') return result;
  if (!catalog.some(role => role.code !== context.roleCode)) {
    if (result.recommendedRole !== null) throw new AiInvalidResponseError('No alternative career is recruiting; recommendedRole must be null.');
    const feedback = `${result.feedback}\n\nHiện chưa có nghề nghiệp thay thế đang nhận hồ sơ. Giữ nguyên kết quả và liên hệ giảng viên để được hướng dẫn; hệ thống không tự tạo một vị trí khác.`;
    if (feedback.length > 4000) throw new AiInvalidResponseError('Combined feedback exceeds 4000 characters.');
    return { ...result, recommendedRole: null, feedback };
  }
  if (!result.recommendedRole || result.recommendedRole === context.roleCode) {
    throw new AiInvalidResponseError('A score from 50 through 70 requires a supported alternative role.');
  }
  const recommendation = (raw as Record<string, unknown>).roleRecommendation;
  if (!recommendation || typeof recommendation !== 'object' || Array.isArray(recommendation)) {
    throw new AiInvalidResponseError('Alternative-role guidance requires a reason and answer evidence.');
  }
  const { reason, evidencePositions } = recommendation as Record<string, unknown>;
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1200) {
    throw new AiInvalidResponseError('Alternative-role reason must contain 1..1200 characters.');
  }
  if (!Array.isArray(evidencePositions) || evidencePositions.length < 1 || evidencePositions.length > 10) {
    throw new AiInvalidResponseError('Alternative-role evidence must reference 1..10 submitted answers.');
  }
  const answeredPositions = new Set(context.answers.filter((answer) => answer.answerText.trim() || answer.followUp?.answer.trim()).map((answer) => answer.position));
  if (evidencePositions.some((position) => !Number.isInteger(position) || !answeredPositions.has(position as number))) {
    throw new AiInvalidResponseError('Role guidance must reference an actual submitted answer.');
  }
  const references = [...new Set(evidencePositions as number[])].map((position) => `Câu hỏi ${position}`).join(', ');
  const feedback = `${result.feedback}\n\nĐề xuất khám phá ${catalog.find(role => role.code === result.recommendedRole)!.label}: ${reason.trim()}\nCăn cứ: ${references}.`;
  if (feedback.length > 4000) throw new AiInvalidResponseError('Combined feedback and role-guidance evidence exceeds 4000 characters.');
  return { ...result, feedback };
}
