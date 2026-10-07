/**
 * DOCUMENTED Phase-5 V1 evaluation template (spec 9) — a VERSIONED policy,
 * not an AI-generated rule. If product docs ever approve different
 * authoritative criteria, they replace this constant and the version bumps;
 * existing cycles keep their persisted criteria snapshots untouched.
 *
 * Scores are 0..100 on every criterion; weights sum to exactly 100.
 */
export const EVALUATION_TEMPLATE_V1 = {
  version: 'evaluation-v1',
  criteria: [
    { code: 'technical_quality', name: 'Chất lượng kỹ thuật', weight: 35, maxScore: 100, isRequired: true, sortOrder: 1 },
    { code: 'delivery_execution', name: 'Mức độ hoàn thành công việc', weight: 30, maxScore: 100, isRequired: true, sortOrder: 2 },
    { code: 'communication_teamwork', name: 'Giao tiếp và làm việc nhóm', weight: 20, maxScore: 100, isRequired: true, sortOrder: 3 },
    { code: 'growth_ownership', name: 'Tinh thần học hỏi và trách nhiệm', weight: 15, maxScore: 100, isRequired: true, sortOrder: 4 },
  ],
} as const;

export type EvaluationTemplateCriterion = (typeof EVALUATION_TEMPLATE_V1.criteria)[number];

/** Total weight of the V1 template — must always be exactly 100. */
export const EVALUATION_TEMPLATE_V1_TOTAL_WEIGHT: number = EVALUATION_TEMPLATE_V1.criteria.reduce(
  (sum, c) => sum + c.weight,
  0,
);
