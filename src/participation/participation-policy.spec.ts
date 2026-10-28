import {
  assessLateness,
  incidentConsequence,
  validateParticipationPolicy,
  adjustedSubmissionScore,
} from "./participation-policy";
const due = new Date("2026-10-25T09:00:00Z");
const policy = {
  warningFrom: 1,
  penaltyFrom: 2,
  replacementFrom: 3,
  penaltyPoints: 5,
  penaltyCap: 12,
};
describe("participation policy", () => {
  it("uses first valid submission time; slow grading cannot create lateness", () => {
    expect(assessLateness(due, due, new Date("2026-10-26T09:00:00Z"))).toBe(
      "on_time",
    );
    expect(
      assessLateness(
        due,
        new Date(due.getTime() + 1),
        new Date(due.getTime() + 2),
      ),
    ).toBe("late");
  });
  it("marks missing only after the deadline, never on the exact boundary or without a deadline", () => {
    expect(assessLateness(due, null, due)).toBe("waiting");
    expect(assessLateness(due, null, new Date(due.getTime() + 1))).toBe(
      "missing",
    );
    expect(assessLateness(null, null, due)).toBe("no_deadline");
  });
  it("warns first, deducts second and recommends replacement from third without auto-kick", () => {
    expect(incidentConsequence(1, policy, 0)).toEqual({
      warn: true,
      points: 0,
      recommendReplacement: false,
    });
    expect(incidentConsequence(2, policy, 0)).toEqual({
      warn: true,
      points: 5,
      recommendReplacement: false,
    });
    expect(incidentConsequence(3, policy, 5)).toEqual({
      warn: true,
      points: 5,
      recommendReplacement: true,
    });
  });
  it("enforces a total cap and does not deduct when the instructor has not configured an amount", () => {
    expect(incidentConsequence(4, policy, 10).points).toBe(2);
    expect(incidentConsequence(5, policy, 12).points).toBe(0);
    expect(
      incidentConsequence(3, { ...policy, penaltyPoints: null }, 0).points,
    ).toBe(0);
  });
  it("keeps rubric and deduction separate, never produces a negative or cumulative score", () => {
    expect(adjustedSubmissionScore(85, 5)).toEqual({
      baseScore: 85,
      latePenalty: 5,
      score: 80,
    });
    expect(adjustedSubmissionScore(3, 5)).toEqual({
      baseScore: 3,
      latePenalty: 3,
      score: 0,
    });
    expect(adjustedSubmissionScore(85, 5)).toEqual(
      adjustedSubmissionScore(85, 5),
    );
  });
  it.each([
    { ...policy, penaltyFrom: 0 },
    { ...policy, replacementFrom: 1 },
    { ...policy, penaltyPoints: -1 },
    { ...policy, penaltyCap: 101 },
    { ...policy, penaltyPoints: NaN },
  ])("rejects invalid or ambiguous configuration %#", (invalid) => {
    expect(() => validateParticipationPolicy(invalid)).toThrow();
  });
});
