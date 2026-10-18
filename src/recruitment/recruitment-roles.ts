/**
 * Recruitment roles (Phase 4, spec 8/9) — APPROVED stable codes.
 *
 * These are RECRUITMENT domain codes, deliberately NOT RBAC Role records:
 * "frontend" (recruitment) does not mean "intern" (authorization).
 * Keep the concepts separate — no RBAC rows are created for these.
 * Display labels stay in one place here; relational identifiers are the
 * codes only (never a human label).
 */
export interface RecruitmentRoleDef {
  code: string;
  label: string;
}

export const RECRUITMENT_ROLES: readonly RecruitmentRoleDef[] = [
  { code: 'frontend', label: 'Frontend Developer' },
  { code: 'backend', label: 'Backend Developer' },
  { code: 'fullstack', label: 'Fullstack Developer' },
  { code: 'qa', label: 'QA Tester' },
  { code: 'business_analyst', label: 'Business Analyst' },
] as const;

export const RECRUITMENT_ROLE_CODES: readonly string[] = RECRUITMENT_ROLES.map((r) => r.code);

export function isRecruitmentRoleCode(code: unknown): code is string {
  return typeof code === 'string' && RECRUITMENT_ROLE_CODES.includes(code);
}

export function recruitmentRoleLabel(code: string): string {
  return RECRUITMENT_ROLES.find((r) => r.code === code)?.label ?? code;
}
