import {
  canTransitionSprint,
  INVALID_SPRINT_TRANSITION_CODE,
  isSprintTerminal,
  SPRINT_ACTIVE_EXISTS_CODE,
  SPRINT_HAS_OPEN_TASKS_CODE,
  SPRINT_STATUSES,
  SPRINT_TRANSITIONS,
  type SprintStatus,
} from './sprint-status.machine';

/**
 * Sprint state machine tests (spec 3/42): the documented legal matrix
 * passes, every other pair is rejected by the service with 409
 * INVALID_SPRINT_TRANSITION, terminals are frozen.
 */
describe('sprint status machine', () => {
  it('defines the documented legal transitions (spec 3)', () => {
    expect(SPRINT_TRANSITIONS).toEqual({
      planned: ['active', 'cancelled'],
      active: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    });
  });

  it('exposes exactly the four sprint statuses', () => {
    expect([...SPRINT_STATUSES].sort()).toEqual(['active', 'cancelled', 'completed', 'planned']);
  });

  it('exports the spec error codes', () => {
    expect(INVALID_SPRINT_TRANSITION_CODE).toBe('INVALID_SPRINT_TRANSITION');
    expect(SPRINT_HAS_OPEN_TASKS_CODE).toBe('SPRINT_HAS_OPEN_TASKS');
    expect(SPRINT_ACTIVE_EXISTS_CODE).toBe('SPRINT_ACTIVE_EXISTS');
  });

  describe('legal transitions (spec 3)', () => {
    it.each<[SprintStatus, SprintStatus]>([
      ['planned', 'active'],
      ['planned', 'cancelled'],
      ['active', 'completed'],
      ['active', 'cancelled'],
    ])('%s -> %s is allowed', (from, to) => {
      expect(canTransitionSprint(from, to)).toBe(true);
    });
  });

  describe('illegal transitions (spec 3)', () => {
    it.each<[SprintStatus, SprintStatus]>([
      ['planned', 'completed'],
      ['active', 'planned'],
      ['completed', 'planned'],
      ['completed', 'active'],
      ['completed', 'cancelled'],
      ['cancelled', 'planned'],
      ['cancelled', 'active'],
      ['cancelled', 'completed'],
    ])('%s -> %s is rejected', (from, to) => {
      expect(canTransitionSprint(from, to)).toBe(false);
    });
  });

  describe('terminals', () => {
    it('completed and cancelled are terminal; planned and active are not', () => {
      expect(isSprintTerminal('completed')).toBe(true);
      expect(isSprintTerminal('cancelled')).toBe(true);
      expect(isSprintTerminal('planned')).toBe(false);
      expect(isSprintTerminal('active')).toBe(false);
    });
  });
});
