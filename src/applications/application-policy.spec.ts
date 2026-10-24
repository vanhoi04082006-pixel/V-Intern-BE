import {
  validateSlot,
  validateCvFacts,
  validateRoleMatch,
} from "./application-policy";
describe("CV and opened-slot domain authority", () => {
  const now = new Date("2026-10-24T09:00:00Z");
  it("rejects invalid/past slots, timezone, capacity and insufficient preparation", () => {
    const slot = {
      startsAt: "2026-10-25T09:00:00Z",
      endsAt: "2026-10-25T10:00:00Z",
      capacity: 2,
      timezone: "Asia/Ho_Chi_Minh",
      minimumPreparationMinutes: 60,
      credentialsLeadMinutes: 30,
    };
    expect(() => validateSlot(slot, now)).not.toThrow();
    for (const change of [
      { startsAt: now.toISOString() },
      { capacity: 0 },
      { timezone: "Invalid/Zone" },
      { credentialsLeadMinutes: 90 },
      { startsAt: "2026-10-25T09:00:00" },
    ])
      expect(() => validateSlot({ ...slot, ...change }, now)).toThrow();
  });
  it("accepts facts only when the literal quote exists in the cited page or paragraph", () => {
    const segments = [
      {
        ref: "page:1",
        text: "Tôi đã làm một website bằng React và TypeScript.",
      },
    ];
    const raw = {
      confidence: 0.8,
      missing: [],
      facts: [{ skill: "React", ref: "page:1", quote: "website bằng React" }],
    };
    expect(validateCvFacts(raw, segments).facts).toHaveLength(1);
    expect(() =>
      validateCvFacts(
        {
          ...raw,
          facts: [{ skill: "SQL", ref: "page:9", quote: "five years SQL" }],
        },
        segments,
      ),
    ).toThrow();
    expect(() =>
      validateCvFacts(
        {
          ...raw,
          facts: [{ skill: "SQL", ref: "page:1", quote: "five years SQL" }],
        },
        segments,
      ),
    ).toThrow();
  });
  it("supports a sixth career but rejects an archived/invented career or unsupported facts", () => {
    const roles = ["mobile-sixth"];
    expect(
      validateRoleMatch(
        {
          roleCode: "mobile-sixth",
          factIndexes: [0],
          confidence: 0.8,
          reason: "Phù hợp bằng chứng",
        },
        roles,
        1,
      ).roleCode,
    ).toBe("mobile-sixth");
    expect(() =>
      validateRoleMatch(
        {
          roleCode: "archived",
          factIndexes: [0],
          confidence: 1,
          reason: "...",
        },
        roles,
        1,
      ),
    ).toThrow();
    expect(() =>
      validateRoleMatch(
        {
          roleCode: "mobile-sixth",
          factIndexes: [5],
          confidence: 1,
          reason: "...",
        },
        roles,
        1,
      ),
    ).toThrow();
  });
});
