export interface ParticipationPolicy {
  warningFrom: number;
  penaltyFrom: number;
  replacementFrom: number;
  penaltyPoints: number | null;
  penaltyCap: number;
}
export const DEFAULT_PARTICIPATION_POLICY: Readonly<ParticipationPolicy> =
  Object.freeze({
    warningFrom: 1,
    penaltyFrom: 2,
    replacementFrom: 3,
    penaltyPoints: null,
    penaltyCap: 20,
  });
const cents = (value: number) => Math.round(value * 100);
export function validateParticipationPolicy(policy: ParticipationPolicy): void {
  if (
    ![policy.warningFrom, policy.penaltyFrom, policy.replacementFrom].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= 50,
    ) ||
    policy.warningFrom > policy.penaltyFrom ||
    policy.penaltyFrom > policy.replacementFrom ||
    !Number.isFinite(policy.penaltyCap) ||
    policy.penaltyCap < 0 ||
    policy.penaltyCap > 100 ||
    (policy.penaltyPoints !== null &&
      (!Number.isFinite(policy.penaltyPoints) ||
        policy.penaltyPoints < 0 ||
        policy.penaltyPoints > 100))
  )
    throw Error("PARTICIPATION_POLICY_INVALID");
}
export function assessLateness(
  due: Date | null,
  firstValidSubmission: Date | null,
  now: Date,
): "no_deadline" | "waiting" | "on_time" | "late" | "missing" {
  if (!due) return "no_deadline";
  if (firstValidSubmission)
    return firstValidSubmission <= due ? "on_time" : "late";
  return now > due ? "missing" : "waiting";
}
export function incidentConsequence(
  ordinal: number,
  policy: ParticipationPolicy,
  alreadyCharged: number,
) {
  validateParticipationPolicy(policy);
  const points =
    ordinal >= policy.penaltyFrom && policy.penaltyPoints !== null
      ? Math.max(
          0,
          Math.min(
            cents(policy.penaltyPoints),
            cents(policy.penaltyCap) - cents(alreadyCharged),
          ),
        ) / 100
      : 0;
  return {
    warn: ordinal >= policy.warningFrom,
    points,
    recommendReplacement: ordinal >= policy.replacementFrom,
  };
}
export function adjustedSubmissionScore(baseScore: number, penalty: number) {
  if (
    !Number.isFinite(baseScore) ||
    baseScore < 0 ||
    baseScore > 100 ||
    !Number.isFinite(penalty) ||
    penalty < 0
  )
    throw Error("PARTICIPATION_SCORE_INVALID");
  const deduction = Math.min(cents(baseScore), cents(penalty));
  return {
    baseScore,
    latePenalty: deduction / 100,
    score: (cents(baseScore) - deduction) / 100,
  };
}
