import {
  canTransitionSession,
  isSessionAssignable,
  SESSION_TRANSITIONS,
  type SessionStatus,
} from './session-status.machine';

/**
 * Session state machine tests (spec 11/42): legal transitions pass,
 * everything else is rejected by the service with 409.
 */
describe('session status machine', () => {
  it('defines the documented legal transitions', () => {
    expect(SESSION_TRANSITIONS).toEqual({
      upcoming: ['active', 'cancelled'],
      active: ['ending', 'cancelled'],
      ending: ['completed'],
      completed: [],
      cancelled: [],
    });
  });

  describe('legal transitions', () => {
    it.each<[SessionStatus, SessionStatus]>([
      ['upcoming', 'active'],
      ['upcoming', 'cancelled'],
      ['active', 'ending'],
      ['active', 'cancelled'],
      ['ending', 'completed'],
    ])('%s -> %s is allowed', (from, to) => {
      expect(canTransitionSession(from, to)).toBe(true);
    });
  });

  describe('illegal transitions', () => {
    it.each<[SessionStatus, SessionStatus]>([
      ['upcoming', 'ending'],
      ['upcoming', 'completed'],
      ['active', 'completed'],
      ['active', 'upcoming'],
      ['ending', 'active'],
      ['ending', 'cancelled'],
      ['completed', 'active'],
      ['completed', 'upcoming'],
      ['completed', 'cancelled'],
      ['cancelled', 'active'],
      ['cancelled', 'upcoming'],
      ['cancelled', 'ending'],
    ])('%s -> %s is rejected', (from, to) => {
      expect(canTransitionSession(from, to)).toBe(false);
    });

    it('rejects same-status no-op transitions (terminal states freeze)', () => {
      expect(canTransitionSession('completed', 'completed')).toBe(false);
      expect(canTransitionSession('cancelled', 'cancelled')).toBe(false);
    });
  });

  describe('assignment eligibility', () => {
    it('only upcoming and active sessions accept assignments', () => {
      expect(isSessionAssignable('upcoming')).toBe(true);
      expect(isSessionAssignable('active')).toBe(true);
      expect(isSessionAssignable('ending')).toBe(false);
      expect(isSessionAssignable('completed')).toBe(false);
      expect(isSessionAssignable('cancelled')).toBe(false);
    });
  });
});
