/**
 * Certificate eligibility V-INTERN-COMPLETE v1 (Phase 5, spec 42/43) —
 * DETERMINISTIC over persisted facts; no AI, no attendance requirement
 * (attendance does not exist in this domain). Every reason is structured
 * so the API can answer 409 CERTIFICATE_NOT_ELIGIBLE with safe details.
 */
export const CERTIFICATE_POLICY_CODE = 'V-INTERN-COMPLETE';
export const CERTIFICATE_POLICY_VERSION = 1;

export interface CertificateFacts {
  recruitmentPassed: boolean | null; // null = no recruitment profile
  hasCompletedAssignment: boolean;
  /** Latest finalized evaluation overallScore (null = none). */
  latestFinalizedEvaluationScore: number | null;
  /** Latest FINALIZED-period KPI finalScore (null = none). */
  latestFinalizedKpiScore: number | null;
}

export interface CertificateThresholds {
  minEvaluationScore: number;
  minKpiScore: number;
  requireRecruitmentPassed: boolean;
  requireCompletedAssignment: boolean;
}

export interface CertificateIneligibilityReason {
  requirement: string;
  satisfied: boolean;
  detail: string;
}

export interface CertificateEligibilityOutcome {
  eligible: boolean;
  reasons: CertificateIneligibilityReason[];
}

export function evaluateCertificateEligibility(
  facts: CertificateFacts,
  thresholds: CertificateThresholds,
): CertificateEligibilityOutcome {
  const reasons: CertificateIneligibilityReason[] = [];

  if (thresholds.requireRecruitmentPassed && facts.recruitmentPassed !== true) {
    reasons.push({
      requirement: 'recruitment_passed',
      satisfied: false,
      detail: facts.recruitmentPassed === null ? 'No recruitment profile exists.' : 'Recruitment has not been passed.',
    });
  } else if (thresholds.requireRecruitmentPassed) {
    reasons.push({ requirement: 'recruitment_passed', satisfied: true, detail: 'Recruitment passed.' });
  }

  if (thresholds.requireCompletedAssignment && !facts.hasCompletedAssignment) {
    reasons.push({
      requirement: 'completed_assignment',
      satisfied: false,
      detail: 'At least one COMPLETED internship assignment is required.',
    });
  } else if (thresholds.requireCompletedAssignment) {
    reasons.push({ requirement: 'completed_assignment', satisfied: true, detail: 'A completed assignment exists.' });
  }

  if (facts.latestFinalizedEvaluationScore === null) {
    reasons.push({
      requirement: 'finalized_evaluation',
      satisfied: false,
      detail: 'No finalized instructor evaluation exists.',
    });
  } else if (facts.latestFinalizedEvaluationScore < thresholds.minEvaluationScore) {
    reasons.push({
      requirement: 'finalized_evaluation',
      satisfied: false,
      detail: `Latest finalized evaluation score ${facts.latestFinalizedEvaluationScore} is below the required ${thresholds.minEvaluationScore}.`,
    });
  } else {
    reasons.push({
      requirement: 'finalized_evaluation',
      satisfied: true,
      detail: `Latest finalized evaluation score ${facts.latestFinalizedEvaluationScore}.`,
    });
  }

  if (facts.latestFinalizedKpiScore === null) {
    reasons.push({ requirement: 'finalized_kpi', satisfied: false, detail: 'No finalized KPI result exists.' });
  } else if (facts.latestFinalizedKpiScore < thresholds.minKpiScore) {
    reasons.push({
      requirement: 'finalized_kpi',
      satisfied: false,
      detail: `Latest finalized KPI score ${facts.latestFinalizedKpiScore} is below the required ${thresholds.minKpiScore}.`,
    });
  } else {
    reasons.push({
      requirement: 'finalized_kpi',
      satisfied: true,
      detail: `Latest finalized KPI score ${facts.latestFinalizedKpiScore}.`,
    });
  }

  return { eligible: reasons.every((r) => r.satisfied), reasons };
}

/** Certificate number from the SEQUENCE value: VINT-<year>-<8 digits>. */
export function formatCertificateNumber(sequenceValue: number, issuedAt: Date): string {
  const year = issuedAt.getUTCFullYear();
  return `VINT-${year}-${String(sequenceValue).padStart(8, '0')}`;
}
