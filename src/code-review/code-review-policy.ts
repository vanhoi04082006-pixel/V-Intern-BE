import { AiInvalidResponseError } from "../ai/ai-errors";
import {
  RUBRIC_WEIGHTS,
  scoreSubmission,
  type SubmissionRubric,
} from "../submissions/submission-policy";
import type { EvidenceFile } from "../github/github-evidence.service";

/** A real code defect can coexist with unavailable execution evidence. */
export function canRetryUnavailableRunner(review: { status: string; evidenceJson: string | null }): boolean {
  if (review.status !== 'needs_changes' || !review.evidenceJson) return false;
  try {
    const evidence = JSON.parse(review.evidenceJson) as { trustedTests?: { status?: string } } | null;
    return evidence?.trustedTests?.status === 'failed' || evidence?.trustedTests?.status === 'not_configured';
  } catch {
    return false;
  }
}

export interface CodeFinding {
  severity: "critical" | "major" | "minor";
  file: string;
  line: number;
  message: string;
}
export interface CodeReviewResult {
  rubric: SubmissionRubric;
  summary: string;
  findings: CodeFinding[];
  limitations: string[];
  score: number;
}
function fail(): never {
  throw new AiInvalidResponseError(
    "Code review has invalid scores or unsupported evidence references.",
  );
}
export function validateCodeReview(
  raw: unknown,
  files: EvidenceFile[],
): CodeReviewResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail();
  const v = raw as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) => !["rubric", "summary", "findings", "limitations"].includes(k),
    )
  )
    fail();
  const rubric = v.rubric as Record<string, unknown> | null;
  if (
    !rubric ||
    typeof rubric !== "object" ||
    Array.isArray(rubric) ||
    Object.keys(rubric).length !== Object.keys(RUBRIC_WEIGHTS).length
  )
    fail();
  for (const key of Object.keys(RUBRIC_WEIGHTS))
    if (
      typeof rubric[key] !== "number" ||
      !Number.isFinite(rubric[key]) ||
      Number(rubric[key]) < 0 ||
      Number(rubric[key]) > 100
    )
      fail();
  if (
    typeof v.summary !== "string" ||
    v.summary.length < 10 ||
    v.summary.length > 4000 ||
    !Array.isArray(v.findings) ||
    v.findings.length > 40 ||
    !Array.isArray(v.limitations) ||
    v.limitations.length > 20 ||
    v.limitations.some((x) => typeof x !== "string" || x.length > 1000)
  )
    fail();
  const byPath = new Map(files.map((f) => [f.path, f]));
  const findings = v.findings.map((item: unknown): CodeFinding => {
    if (!item || typeof item !== "object") return fail();
    const f = item as Record<string, unknown>,
      file = byPath.get(String(f.file));
    if (
      !file ||
      !["critical", "major", "minor"].includes(String(f.severity)) ||
      typeof f.line !== "number" ||
      !Number.isInteger(f.line) ||
      f.line < 1 ||
      f.line > file.lineCount ||
      typeof f.message !== "string" ||
      f.message.length < 5 ||
      f.message.length > 2000
    )
      return fail();
    return {
      severity: f.severity as CodeFinding["severity"],
      file: file.path,
      line: f.line,
      message: f.message,
    };
  });
  const scores = rubric as SubmissionRubric;
  return {
    rubric: scores,
    summary: v.summary,
    findings,
    limitations: v.limitations as string[],
    score: scoreSubmission(scores),
  };
}
export function reviewDecision(
  result: CodeReviewResult,
  complete: boolean,
  tests: { status: string; passed: number; failed: number },
): "awaiting_instructor" | "needs_changes" | "inconclusive" {
  if (tests.status === "completed" && tests.failed > 0) return "needs_changes";
  if (
    result.score < 70 ||
    result.findings.some(
      (f) => f.severity === "critical" || f.severity === "major",
    )
  )
    return "needs_changes";
  if (
    !complete ||
    result.limitations.length ||
    tests.status !== "completed" ||
    tests.passed <= 0
  )
    return "inconclusive";
  return "awaiting_instructor";
}
