/**
 * Explicit retake policy (Phase 4, spec 19/38/69) — pure decision logic.
 *
 * DOCUMENTED DEFAULTS (no other approved business rule exists):
 * - RECRUITMENT_MAX_ATTEMPTS            = 3   (total interview attempts)
 * - RECRUITMENT_RETAKE_COOLDOWN_HOURS   = 24  (after a FAILED evaluation)
 *
 * An attempt is consumed when an interview session STARTS (the candidate
 * saw the questions) — attemptCount increments in the same transaction.
 * Cooldown anchors on the LATEST failed result's evaluatedAt.
 * The API reports attemptNumber/attemptsRemaining/nextEligibleAt (spec 19).
 */
export interface AttemptGateInput {
  profileStatus: string;
  attemptCount: number;
  /** evaluatedAt of the latest FAILED result, if any. */
  lastFailedAt: Date | null;
}

export interface AttemptGateConfig {
  maxAttempts: number;
  retakeCooldownHours: number;
}

export type AttemptGateResult =
  | { allowed: true; attemptsRemaining: number; nextEligibleAt: null }
  | { allowed: false; reason: 'ATTEMPT_LIMIT' | 'COOLDOWN'; attemptsRemaining: number; nextEligibleAt: Date | null };

export function computeAttemptGate(
  input: AttemptGateInput,
  config: AttemptGateConfig,
  now: Date,
): AttemptGateResult {
  const attemptsRemaining = Math.max(0, config.maxAttempts - input.attemptCount);
  if (attemptsRemaining <= 0) {
    return { allowed: false, reason: 'ATTEMPT_LIMIT', attemptsRemaining: 0, nextEligibleAt: null };
  }
  if (input.lastFailedAt && config.retakeCooldownHours > 0) {
    const nextEligibleAt = new Date(
      input.lastFailedAt.getTime() + config.retakeCooldownHours * 3_600_000,
    );
    if (nextEligibleAt.getTime() > now.getTime()) {
      return { allowed: false, reason: 'COOLDOWN', attemptsRemaining, nextEligibleAt };
    }
  }
  return { allowed: true, attemptsRemaining, nextEligibleAt: null };
}
