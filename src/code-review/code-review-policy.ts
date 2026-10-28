import { z } from 'zod';
import { AiInvalidResponseError } from '../ai/ai-errors';
import { scoreSubmission, type SubmissionRubric } from '../submissions/submission-policy';
import type { EvidenceFile } from '../github/github-evidence.service';

/** A real code defect can coexist with unavailable execution evidence. */
export function canRetryUnavailableRunner(review: { status: string; evidenceJson: string | null }): boolean {
  if (review.status !== 'needs_changes' || !review.evidenceJson) return false;
  try {
    const evidence = JSON.parse(review.evidenceJson) as { trustedTests?: { status?: string } } | null;
    return evidence?.trustedTests?.status === 'failed' || evidence?.trustedTests?.status === 'not_configured';
  } catch { return false; }
}
export interface CodeFinding { severity: 'critical' | 'major' | 'minor'; file: string; line: number; message: string }
export interface CodeReviewResult { rubric: SubmissionRubric; summary: string; findings: CodeFinding[]; limitations: string[]; score: number }

const score = z.number().min(0).max(100);
const responseShape = z.strictObject({
  rubric: z.strictObject({ functional: score, quality: score, testing: score, errors: score, security: score, dod: score }),
  summary: z.string().min(10).max(4000),
  findings: z.array(z.object({ severity: z.enum(['critical', 'major', 'minor']), file: z.string(), line: z.number().int().min(1), message: z.string().min(5).max(2000) })).max(40),
  limitations: z.array(z.string().max(1000)).max(20),
});
/** The provider and server share structural limits; source citations remain server-validated. */
export const codeReviewOutputSchema = z.toJSONSchema(responseShape);
delete codeReviewOutputSchema.$schema;
function fail(): never { throw new AiInvalidResponseError('Code review has invalid scores or unsupported evidence references.'); }
export function validateCodeReview(raw: unknown, files: EvidenceFile[]): CodeReviewResult {
  const parsed = responseShape.safeParse(raw);
  if (!parsed.success) fail();
  const data = parsed.data, byPath = new Map(files.map(file => [file.path, file]));
  const findings = data.findings.map((finding): CodeFinding => {
    const file = byPath.get(finding.file);
    if (!file || finding.line > file.lineCount) return fail();
    return { ...finding, file: file.path };
  });
  return { ...data, findings, score: scoreSubmission(data.rubric) };
}
export function reviewDecision(result: CodeReviewResult, complete: boolean, tests: { status: string; passed: number; failed: number }): 'awaiting_instructor' | 'needs_changes' | 'inconclusive' {
  if (tests.status === 'completed' && tests.failed > 0) return 'needs_changes';
  if (result.score < 70 || result.findings.some(finding => finding.severity === 'critical' || finding.severity === 'major')) return 'needs_changes';
  if (!complete || result.limitations.length || tests.status !== 'completed' || tests.passed <= 0) return 'inconclusive';
  return 'awaiting_instructor';
}
