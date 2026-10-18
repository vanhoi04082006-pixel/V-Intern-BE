import { randomBytes } from "crypto";
import { openToken, parseGithubSource, sealToken } from "./github-security";
describe("GitHub trust boundaries", () => {
  it("binds encrypted tokens to an account and rejects tampering", () => {
    const key = randomBytes(32).toString("base64");
    const sealed = sealToken("test-credential", key, "u1");
    expect(sealed).not.toContain("test-credential");
    expect(openToken(sealed, key, "u1")).toBe("test-credential");
    expect(() => openToken(sealed, key, "u2")).toThrow();
    expect(() => openToken(sealed + "a", key, "u1")).toThrow();
    expect(() => sealToken("test", "", "u1")).toThrow();
  });
  it("accepts explicit PRs and immutable commits, requires a ref for a repo", () => {
    expect(
      parseGithubSource("https://github.com/teacher/course/pull/12").pullNumber,
    ).toBe(12);
    expect(
      parseGithubSource(
        `https://github.com/teacher/course/commit/${"a".repeat(40)}`,
      ).kind,
    ).toBe("commit");
    expect(
      parseGithubSource("https://github.com/teacher/course", "feature/task-1")
        .ref,
    ).toBe("feature/task-1");
    expect(() =>
      parseGithubSource("https://github.com/teacher/course"),
    ).toThrow();
  });
  it.each([
    "http://github.com/t/r/pull/1",
    "https://github.com.evil.test/t/r/pull/1",
    "https://user:pass@github.com/t/r/pull/1",
    "https://github.com/t/r/pull/1?x=1",
    "https://github.com/t/r/pull/0",
    "https://github.com/t/r/commit/abc",
    "https://127.0.0.1/t/r/pull/1",
  ])("rejects unsafe or ambiguous source %s", (url) =>
    expect(() => parseGithubSource(url)).toThrow(),
  );
});
