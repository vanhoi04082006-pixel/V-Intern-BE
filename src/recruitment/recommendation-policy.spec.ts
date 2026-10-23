import { validateRoleAwareRecruitmentEvaluation } from './recommendation-policy';
import { classifyRecruitmentScore } from './scoring';

const evidence = [{ position: 1, answerText: 'Tôi kiểm tra đầu vào và mô tả các tình huống biên.' }];
const base = {
  technicalScore: 60, softSkillScore: 60, feedback: 'Có tư duy kiểm tra tình huống biên.',
  strengths: ['Nêu ví dụ kiểm thử'], weaknesses: ['Cần củng cố kiến thức frontend'],
  recommendedRole: 'qa', criteria: [],
  roleRecommendation: { reason: 'Câu trả lời 1 phân tích được các trường hợp lỗi và cách tái hiện, phù hợp để khám phá QA.', evidencePositions: [1] },
};
const validate = (raw: unknown) => validateRoleAwareRecruitmentEvaluation(raw, { roleCode: 'frontend', detailed: false, answers: evidence });

describe('three-band recruitment policy', () => {
  it.each([[0, 'failed'], [49.9, 'failed'], [50, 'role_recommended'], [62.2, 'role_recommended'], [70, 'role_recommended'], [70.1, 'passed'], [100, 'passed']] as const)('%s maps to %s', (score, outcome) => {
    expect(classifyRecruitmentScore(score)).toBe(outcome);
  });
  it('persists an alternative role rationale with references to real submitted answers in existing feedback', () => {
    const out = validate(base);
    expect(out.recommendedRole).toBe('qa');
    expect(out.feedback).toContain(base.roleRecommendation.reason);
    expect(out.feedback).toContain('Câu hỏi 1');
  });
  it.each([null, 'frontend'])('does not invent a fallback when recommendedRole is %s', (recommendedRole) => {
    expect(() => validate({ ...base, recommendedRole })).toThrow(/alternative role/);
  });
  it('requires a reason and references instead of a bare role label', () => {
    expect(() => validate({ ...base, roleRecommendation: undefined })).toThrow(/evidence/);
    expect(() => validate({ ...base, roleRecommendation: { reason: ' ', evidencePositions: [1] } })).toThrow(/reason/);
  });
  it('rejects fabricated question references and evidence from unanswered questions', () => {
    expect(() => validate({ ...base, roleRecommendation: { ...base.roleRecommendation, evidencePositions: [99] } })).toThrow(/submitted answer/);
    expect(() => validateRoleAwareRecruitmentEvaluation(base, { roleCode: 'frontend', detailed: false, answers: [{ position: 1, answerText: '' }] })).toThrow(/submitted answer/);
  });
  it.each([49.9, 70.1])('does not require a role switch for score %s', (score) => {
    expect(validate({ ...base, technicalScore: score, softSkillScore: score, recommendedRole: null, roleRecommendation: undefined }).recommendedRole).toBeNull();
  });
});
