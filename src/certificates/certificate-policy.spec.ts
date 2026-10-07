import {
  CERTIFICATE_POLICY_CODE,
  CERTIFICATE_POLICY_VERSION,
  evaluateCertificateEligibility,
  formatCertificateNumber,
} from './certificate-policy';

const V1 = { minEvaluationScore: 70, minKpiScore: 70, requireRecruitmentPassed: true, requireCompletedAssignment: true };

const ELIGIBLE = {
  recruitmentPassed: true,
  hasCompletedAssignment: true,
  latestFinalizedEvaluationScore: 83.2,
  latestFinalizedKpiScore: 83.8,
};

describe('certificate eligibility V-INTERN-COMPLETE v1 (spec 42)', () => {
  it('marks a fully qualified intern eligible', () => {
    const out = evaluateCertificateEligibility(ELIGIBLE, V1);
    expect(out.eligible).toBe(true);
    expect(out.reasons.every((r) => r.satisfied)).toBe(true);
  });

  it('rejects when recruitment was not passed (each major reason separately testable)', () => {
    const out = evaluateCertificateEligibility({ ...ELIGIBLE, recruitmentPassed: false }, V1);
    expect(out.eligible).toBe(false);
    expect(out.reasons.find((r) => r.requirement === 'recruitment_passed')?.satisfied).toBe(false);
  });

  it('rejects when no recruitment profile exists', () => {
    const out = evaluateCertificateEligibility({ ...ELIGIBLE, recruitmentPassed: null }, V1);
    expect(out.eligible).toBe(false);
  });

  it('rejects when no completed assignment exists', () => {
    const out = evaluateCertificateEligibility({ ...ELIGIBLE, hasCompletedAssignment: false }, V1);
    expect(out.eligible).toBe(false);
    expect(out.reasons.find((r) => r.requirement === 'completed_assignment')?.satisfied).toBe(false);
  });

  it('rejects when the evaluation score is below 70', () => {
    const out = evaluateCertificateEligibility({ ...ELIGIBLE, latestFinalizedEvaluationScore: 69.9 }, V1);
    expect(out.eligible).toBe(false);
    expect(out.reasons.find((r) => r.requirement === 'finalized_evaluation')?.satisfied).toBe(false);
  });

  it('rejects when no finalized evaluation exists (missing ≠ 0-pass)', () => {
    const out = evaluateCertificateEligibility({ ...ELIGIBLE, latestFinalizedEvaluationScore: null }, V1);
    expect(out.eligible).toBe(false);
  });

  it('rejects when the KPI score is below 70', () => {
    const out = evaluateCertificateEligibility({ ...ELIGIBLE, latestFinalizedKpiScore: 69.9 }, V1);
    expect(out.eligible).toBe(false);
    expect(out.reasons.find((r) => r.requirement === 'finalized_kpi')?.satisfied).toBe(false);
  });

  it('threshold is inclusive at exactly 70', () => {
    expect(evaluateCertificateEligibility({ ...ELIGIBLE, latestFinalizedEvaluationScore: 70, latestFinalizedKpiScore: 70 }, V1).eligible).toBe(true);
  });

  it('policy identity is the documented V1', () => {
    expect(CERTIFICATE_POLICY_CODE).toBe('V-INTERN-COMPLETE');
    expect(CERTIFICATE_POLICY_VERSION).toBe(1);
  });

  it('certificate numbers use the SEQUENCE with zero padding and UTC year', () => {
    expect(formatCertificateNumber(1, new Date('2026-03-05T00:00:00Z'))).toBe('VINT-2026-00000001');
    expect(formatCertificateNumber(123456789, new Date('2026-03-05T00:00:00Z'))).toBe('VINT-2026-123456789');
  });
});
