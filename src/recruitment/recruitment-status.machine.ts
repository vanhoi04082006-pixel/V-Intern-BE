/**
 * RecruitmentProfile lifecycle state machine (Phase 4, spec 7/46).
 *
 *   not_started          → role_selected
 *   role_selected        → interview_in_progress        (session started)
 *   interview_in_progress → evaluation_pending          (submitted)
 *   evaluation_pending   → passed | failed              (Backend decision)
 *   failed               → role_selected                (retake prep / role change)
 *   failed               → interview_in_progress        (retake started)
 *   passed               → (terminal)
 *
 * Notes:
 * - There is NO profile-level evaluation_failed state: a provider outage
 *   is a SESSION state (evaluation_failed) while the profile stays
 *   evaluation_pending so evaluation can be retried without the candidate
 *   redoing answers (spec 39/40).
 * - G4 scheduled CV retakes can prepare role_selected through the staff command
 *   only after proving the previous session expired/cancelled. Active sessions remain locked.
 * - Starting a NEW legacy attempt after an expired/cancelled session keeps the
 *   profile at interview_in_progress (session pointer swap, not a machine
 *   transition) — the service validates that semantically.
 * Illegal transitions are rejected by the service — never trusted to the
 * client. Pure + dependency-free for exhaustive unit testing (spec 63).
 */
export const RECRUITMENT_PROFILE_STATUSES = [
  'not_started',
  'role_selected',
  'interview_in_progress',
  'evaluation_pending',
  'passed',
  'failed',
] as const;
export type RecruitmentProfileStatus = (typeof RECRUITMENT_PROFILE_STATUSES)[number];

export const RECRUITMENT_PROFILE_TRANSITIONS: Record<
  RecruitmentProfileStatus,
  readonly RecruitmentProfileStatus[]
> = {
  not_started: ['role_selected'],
  role_selected: ['interview_in_progress'],
  interview_in_progress: ['evaluation_pending', 'role_selected'],
  evaluation_pending: ['passed', 'failed'],
  failed: ['role_selected', 'interview_in_progress'],
  passed: [],
};

export const INVALID_RECRUITMENT_TRANSITION_CODE = 'INVALID_RECRUITMENT_TRANSITION';

export function canTransitionRecruitmentProfile(
  from: RecruitmentProfileStatus,
  to: RecruitmentProfileStatus,
): boolean {
  return RECRUITMENT_PROFILE_TRANSITIONS[from].includes(to);
}

export function isRecruitmentPassed(status: RecruitmentProfileStatus): boolean {
  return status === 'passed';
}
