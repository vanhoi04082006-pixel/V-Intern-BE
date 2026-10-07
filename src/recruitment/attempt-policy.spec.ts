import { computeAttemptGate } from './attempt-policy';

/** Retake policy (Phase 4 spec 19/69) — pure gate logic. */
describe('attempt policy (spec 19)', () => {
  const now = new Date('2026-01-10T12:00:00Z');
  const config = { maxAttempts: 3, retakeCooldownHours: 24 };

  it('first attempt allowed with full remaining budget', () => {
    const gate = computeAttemptGate(
      { profileStatus: 'role_selected', attemptCount: 0, lastFailedAt: null },
      config,
      now,
    );
    expect(gate).toEqual({ allowed: true, attemptsRemaining: 3, nextEligibleAt: null });
  });

  it('attempt limit blocks when attempts are exhausted', () => {
    const gate = computeAttemptGate(
      { profileStatus: 'failed', attemptCount: 3, lastFailedAt: null },
      config,
      now,
    );
    expect(gate).toEqual({
      allowed: false,
      reason: 'ATTEMPT_LIMIT',
      attemptsRemaining: 0,
      nextEligibleAt: null,
    });
  });

  it('cooldown blocks a too-early retake after failure', () => {
    const failedAt = new Date(now.getTime() - 2 * 3_600_000); // 2h ago
    const gate = computeAttemptGate(
      { profileStatus: 'failed', attemptCount: 1, lastFailedAt: failedAt },
      config,
      now,
    );
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.reason).toBe('COOLDOWN');
      expect(gate.attemptsRemaining).toBe(2);
      expect(gate.nextEligibleAt?.toISOString()).toBe('2026-01-11T10:00:00.000Z');
    }
  });

  it('cooldown elapses → retake allowed', () => {
    const failedAt = new Date(now.getTime() - 25 * 3_600_000); // 25h ago
    const gate = computeAttemptGate(
      { profileStatus: 'failed', attemptCount: 1, lastFailedAt: failedAt },
      config,
      now,
    );
    expect(gate).toEqual({ allowed: true, attemptsRemaining: 2, nextEligibleAt: null });
  });

  it('cooldown disabled (0h) → immediate retake', () => {
    const gate = computeAttemptGate(
      {
        profileStatus: 'failed',
        attemptCount: 1,
        lastFailedAt: new Date(now.getTime() - 60_000),
      },
      { maxAttempts: 2, retakeCooldownHours: 0 },
      now,
    );
    expect(gate.allowed).toBe(true);
  });

  it('failed result in the FUTURE blocks (e2e leverages this)', () => {
    const gate = computeAttemptGate(
      {
        profileStatus: 'failed',
        attemptCount: 1,
        lastFailedAt: new Date(now.getTime() + 3_600_000),
      },
      config,
      now,
    );
    expect(gate.allowed).toBe(false);
  });
});
