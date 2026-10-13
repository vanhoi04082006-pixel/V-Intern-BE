import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
export const RUBRIC_WEIGHTS = { functional: .4, quality: .2, testing: .15, errors: .1, security: .1, dod: .05 } as const;
export type SubmissionRubric = Record<keyof typeof RUBRIC_WEIGHTS, number>;
export function scoreSubmission(rubric: SubmissionRubric): number {
  let score = 0;
  for (const key of Object.keys(RUBRIC_WEIGHTS) as (keyof SubmissionRubric)[]) {
    const value = rubric[key];
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new BadRequestException('Rubric scores must be between 0 and 100.');
    score += value * RUBRIC_WEIGHTS[key];
  }
  return Math.round(score * 10) / 10;
}
export function validatePullRequestUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequestException('Invalid pull-request URL.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/[\w.-]+\/[\w.-]+\/pull\/[1-9]\d*$/.test(url.pathname)) throw new BadRequestException('Use an HTTPS github.com/owner/repository/pull/number URL.');
  return url.href;
}
export function assertSubmissionOwner(task: { assigneeId: string | null; status: string }, actorId: string, active: boolean): void {
  if (task.assigneeId !== actorId) throw new ForbiddenException('Only the task assignee may submit work.');
  if (!active) throw new ForbiddenException('An active project assignment is required.');
  if (!['doing', 'review'].includes(task.status)) throw new ConflictException('Start the task before submitting work.');
}
