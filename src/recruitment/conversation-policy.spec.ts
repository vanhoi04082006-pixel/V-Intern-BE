import {
  assertCurrentQuestion,
  validateInterviewerResponse,
} from "./conversation-policy";
describe("interview conversation contract", () => {
  it("does not allow skipping forward or rewriting submitted answers", () => {
    const questions = [
      { id: "A", position: 1 },
      { id: "B", position: 2 },
    ];
    expect(() =>
      assertCurrentQuestion(questions, new Set(["a"]), "b"),
    ).not.toThrow();
    expect(() => assertCurrentQuestion(questions, new Set(), "b")).toThrow();
    expect(() =>
      assertCurrentQuestion(questions, new Set(["a"]), "a"),
    ).toThrow();
  });
  it("rejects grading/decision fields in an interviewer response", () => {
    expect(
      validateInterviewerResponse({
        message: "Bạn có thể giới thiệu về mình không?",
      }).message,
    ).toContain("giới thiệu");
    expect(() =>
      validateInterviewerResponse({
        message: "This is a question",
        passed: true,
      }),
    ).toThrow();
    expect(() =>
      validateInterviewerResponse({ message: "x".repeat(2001) }),
    ).toThrow();
    expect(() => validateInterviewerResponse(null)).toThrow();
  });
});
