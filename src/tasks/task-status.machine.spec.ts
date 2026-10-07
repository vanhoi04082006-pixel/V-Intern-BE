import {
  canTransitionTask,
  INVALID_TASK_TRANSITION_CODE,
  isInternAllowedTaskTransition,
  TASK_FOCUS_ORDER,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TRANSITIONS,
  type TaskStatus,
} from './task-status.machine';

/**
 * Task state machine tests (spec 6/7/42): one vocabulary (todo/doing/
 * review/done), legal matrix, intern-restricted subset, focus order.
 */
describe('task status machine', () => {
  it('defines the documented legal transitions (spec 7)', () => {
    expect(TASK_TRANSITIONS).toEqual({
      todo: ['doing'],
      doing: ['review'],
      review: ['done', 'doing'],
      done: [],
    });
  });

  it('exposes exactly the four statuses and four priorities (spec 5/6)', () => {
    expect([...TASK_STATUSES].sort()).toEqual(['doing', 'done', 'review', 'todo']);
    expect([...TASK_PRIORITIES].sort()).toEqual(['critical', 'high', 'low', 'medium']);
  });

  it('exports the spec error code', () => {
    expect(INVALID_TASK_TRANSITION_CODE).toBe('INVALID_TASK_TRANSITION');
  });

  describe('legal transitions', () => {
    it.each<[TaskStatus, TaskStatus]>([
      ['todo', 'doing'],
      ['doing', 'review'],
      ['review', 'done'],
      ['review', 'doing'],
    ])('%s -> %s is allowed', (from, to) => {
      expect(canTransitionTask(from, to)).toBe(true);
    });
  });

  describe('illegal transitions (spec 7: no arbitrary jumps)', () => {
    it.each<[TaskStatus, TaskStatus]>([
      ['todo', 'review'],
      ['todo', 'done'],
      ['doing', 'done'],
      ['doing', 'todo'],
      ['review', 'todo'],
      ['done', 'todo'],
      ['done', 'doing'],
      ['done', 'review'],
    ])('%s -> %s is rejected', (from, to) => {
      expect(canTransitionTask(from, to)).toBe(false);
    });
  });

  describe('intern-restricted transitions (spec 7/8)', () => {
    it('interns may only start work and submit for review', () => {
      expect(isInternAllowedTaskTransition('todo', 'doing')).toBe(true);
      expect(isInternAllowedTaskTransition('doing', 'review')).toBe(true);
    });

    it('interns may NEVER approve (review→done) nor request rework (review→doing)', () => {
      expect(isInternAllowedTaskTransition('review', 'done')).toBe(false);
      expect(isInternAllowedTaskTransition('review', 'doing')).toBe(false);
    });
  });

  describe('focus order (spec 23)', () => {
    it('ranks doing < review < todo and never focuses done', () => {
      expect(TASK_FOCUS_ORDER.doing).toBeLessThan(TASK_FOCUS_ORDER.review);
      expect(TASK_FOCUS_ORDER.review).toBeLessThan(TASK_FOCUS_ORDER.todo);
      expect(TASK_FOCUS_ORDER.done).toBeGreaterThan(TASK_FOCUS_ORDER.todo);
    });
  });
});
