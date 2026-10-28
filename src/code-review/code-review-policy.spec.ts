import { canRetryUnavailableRunner, reviewDecision, validateCodeReview } from "./code-review-policy";
describe('retry after runner infrastructure recovery', () => {
  it.each(['failed', 'not_configured'])('allows a needs-changes review to rerun when trusted tests were %s', status => {
    expect(canRetryUnavailableRunner({ status: 'needs_changes', evidenceJson: JSON.stringify({ trustedTests: { status, passed: 0, failed: 0 } }) })).toBe(true);
  });
  it('preserves a completed negative test result instead of repeatedly billing AI', () => {
    expect(canRetryUnavailableRunner({ status: 'needs_changes', evidenceJson: JSON.stringify({ trustedTests: { status: 'completed', passed: 1, failed: 1 } }) })).toBe(false);
  });
  it.each(['running', 'awaiting_instructor', 'failed', 'inconclusive'])('does not alter the normal lease/reuse handling for %s', status => {
    expect(canRetryUnavailableRunner({ status, evidenceJson: JSON.stringify({ trustedTests: { status: 'failed' } }) })).toBe(false);
  });
  it('fails closed for absent or corrupt stored evidence', () => {
    for (const evidenceJson of [null, '{broken', 'null', '{}', '{"trustedTests":null}']) {
      expect(canRetryUnavailableRunner({ status: 'needs_changes', evidenceJson })).toBe(false);
    }
  });
});
describe("code review evidence and authority", () => {
  const raw = {
    rubric: {
      functional: 90,
      quality: 90,
      testing: 90,
      errors: 90,
      security: 90,
      dod: 90,
    },
    summary: "The submitted implementation meets the task requirements.",
    findings: [],
    limitations: [],
  };
  const files = [
    {
      path: "src/main.ts",
      content: "one\ntwo",
      lineCount: 2,
      sha: "a".repeat(40),
      patch: "",
    },
  ];
  it("never invents PASS when code coverage or trusted tests are unavailable", () => {
    const result = validateCodeReview(raw, files);
    expect(
      reviewDecision(result, true, {
        status: "not_configured",
        passed: 0,
        failed: 0,
      }),
    ).toBe("inconclusive");
    expect(
      reviewDecision(result, false, {
        status: "completed",
        passed: 5,
        failed: 0,
      }),
    ).toBe("inconclusive");
    expect(
      reviewDecision(result, true, {
        status: "completed",
        passed: 0,
        failed: 0,
      }),
    ).toBe("inconclusive");
    expect(
      reviewDecision(result, true, {
        status: "completed",
        passed: 5,
        failed: 0,
      }),
    ).toBe("awaiting_instructor");
    expect(
      reviewDecision(result, true, {
        status: "completed",
        passed: 5,
        failed: 1,
      }),
    ).toBe("needs_changes");
  });
  it("rejects invented file locations, out-of-bounds lines and provider pass decisions", () => {
    expect(() => validateCodeReview({ ...raw, passed: true }, files)).toThrow();
    expect(() =>
      validateCodeReview(
        {
          ...raw,
          findings: [
            {
              severity: "major",
              file: "secret.ts",
              line: 1,
              message: "Bad code",
            },
          ],
        },
        files,
      ),
    ).toThrow();
    expect(() =>
      validateCodeReview(
        {
          ...raw,
          findings: [
            {
              severity: "major",
              file: "src/main.ts",
              line: 3,
              message: "Bad code",
            },
          ],
        },
        files,
      ),
    ).toThrow();
    expect(() =>
      validateCodeReview(
        { ...raw, rubric: { ...raw.rubric, functional: 101 } },
        files,
      ),
    ).toThrow();
  });
});
