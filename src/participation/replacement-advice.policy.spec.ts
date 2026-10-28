import { validateReplacementAdvice } from "./replacement-advice.policy";
const id = "11111111-1111-4111-8111-111111111111",
  foreign = "22222222-2222-4222-8222-222222222222";
const ref = `candidate:${id}:recruitment`,
  incident = "incident:33333333-3333-4333-8333-333333333333";
const candidate = { userId: id, evidenceRef: ref };
const valid = {
  candidateId: id,
  reason: "Ứng viên đã đạt phỏng vấn đúng vai trò và còn khả dụng.",
  evidenceRefs: [ref, incident],
  limitations: ["Giảng viên cần xác nhận lịch làm việc trước khi thay."],
};
it("allows a recommendation only for an offered candidate with scoped evidence", () => {
  expect(validateReplacementAdvice(valid, [candidate], incident)).toEqual(
    valid,
  );
});
it("rejects invented identities and unsupported authority fields", () => {
  expect(() =>
    validateReplacementAdvice(
      { ...valid, candidateId: foreign },
      [candidate],
      incident,
    ),
  ).toThrow();
  expect(() =>
    validateReplacementAdvice(
      { ...valid, autoKick: true },
      [candidate],
      incident,
    ),
  ).toThrow();
});
it("requires the selected candidate evidence and refuses citations from another scope", () => {
  expect(() =>
    validateReplacementAdvice(
      { ...valid, evidenceRefs: [incident] },
      [candidate],
      incident,
    ),
  ).toThrow();
  expect(() =>
    validateReplacementAdvice(
      { ...valid, evidenceRefs: [ref, "private:other-session"] },
      [candidate],
      incident,
    ),
  ).toThrow();
});
it("reports no recommendation honestly without inventing a candidate or a citation", () => {
  expect(
    validateReplacementAdvice(
      { ...valid, candidateId: null, evidenceRefs: [incident] },
      [],
      incident,
    ).candidateId,
  ).toBeNull();
  expect(() => validateReplacementAdvice(valid, [], incident)).toThrow();
});
it("bounds explanatory output and does not silently trim a fabricated evidence reference", () => {
  expect(() =>
    validateReplacementAdvice(
      { ...valid, reason: "x".repeat(2001) },
      [candidate],
      incident,
    ),
  ).toThrow();
  expect(() =>
    validateReplacementAdvice(
      { ...valid, evidenceRefs: [ref + " "] },
      [candidate],
      incident,
    ),
  ).toThrow();
});
