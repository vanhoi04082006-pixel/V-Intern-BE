import { calculatePerformanceMetrics, PerfEvaluationFact, PerfTaskFact } from './performance-calculator';

const NOW = new Date('2026-03-01T00:00:00.000Z');
const SCOPE = { now: NOW };
const SCOPE_FEB = { from: new Date('2026-02-01T00:00:00.000Z'), to: new Date('2026-03-01T00:00:00.000Z'), now: NOW };

const task = (over: Partial<PerfTaskFact>): PerfTaskFact => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  status: 'todo',
  storyPoints: null,
  dueDate: null,
  createdAt: new Date('2026-02-10T00:00:00.000Z'),
  doneAt: null,
  ...over,
});

describe('performance calculator (spec 17-20) — deterministic, null-safe', () => {
  it('counts, rates and story points exactly', () => {
    const tasks = [
      task({ id: 'a', status: 'done', storyPoints: 5, doneAt: new Date('2026-02-15T00:00:00.000Z'), dueDate: new Date('2026-02-20T00:00:00.000Z') }),
      task({ id: 'b', status: 'done', storyPoints: 3, doneAt: new Date('2026-02-25T00:00:00.000Z'), dueDate: new Date('2026-02-24T00:00:00.000Z') }),
      task({ id: 'c', status: 'doing', storyPoints: 2 }),
      task({ id: 'd', status: 'todo' }), // no SP — excluded from SP denominators
    ];
    const m = calculatePerformanceMetrics(tasks, [], [], SCOPE);
    expect(m.totalTaskCount).toBe(4);
    expect(m.completedTaskCount).toBe(2);
    expect(m.taskCompletionRate).toBe(50);
    expect(m.committedStoryPoints).toBe(10);
    expect(m.completedStoryPoints).toBe(8);
    expect(m.storyPointCompletionRate).toBe(80);
    expect(m.onTimeCompletionRate).toBe(50); // 1 of 2 due-dated completed on time
    expect(m.overdueOpenTaskCount).toBe(0);
  });

  it('null storyPoints never count as zero points (spec 19)', () => {
    const tasks = [
      task({ id: 'a', status: 'done', storyPoints: null }),
      task({ id: 'b', status: 'doing', storyPoints: null }),
    ];
    const m = calculatePerformanceMetrics(tasks, [], [], SCOPE);
    expect(m.committedStoryPoints).toBe(0);
    expect(m.completedStoryPoints).toBe(0);
    expect(m.storyPointCompletionRate).toBeNull(); // nothing declared
    expect(m.taskCompletionRate).toBe(50); // task-level rate still real
  });

  it('onTimeCompletionRate is null when no completed task has a due date (spec 20)', () => {
    const tasks = [task({ id: 'a', status: 'done', doneAt: new Date('2026-02-20T00:00:00.000Z') })];
    const m = calculatePerformanceMetrics(tasks, [], [], SCOPE);
    expect(m.onTimeCompletionRate).toBeNull();
    expect(m.dueDatedCompletedTaskCount).toBe(0);
  });

  it('overdue open tasks counted; done-late does not count as overdue', () => {
    const tasks = [
      task({ id: 'a', status: 'doing', dueDate: new Date('2026-02-01T00:00:00.000Z') }),
      task({ id: 'b', status: 'done', doneAt: new Date('2026-02-20T00:00:00.000Z'), dueDate: new Date('2026-02-10T00:00:00.000Z') }),
    ];
    const m = calculatePerformanceMetrics(tasks, [], [], SCOPE);
    expect(m.overdueOpenTaskCount).toBe(1);
    expect(m.onTimeCompletionRate).toBe(0);
  });

  it('period boundary [from, to) on task.createdAt (spec 57)', () => {
    const tasks = [
      task({ id: 'in', createdAt: new Date('2026-02-01T00:00:00.000Z') }),
      task({ id: 'before', createdAt: new Date('2026-01-31T23:59:59.999Z') }),
      task({ id: 'atTo', createdAt: new Date('2026-03-01T00:00:00.000Z') }), // excluded (to is exclusive)
    ];
    const m = calculatePerformanceMetrics(tasks, [], [], SCOPE_FEB);
    expect(m.totalTaskCount).toBe(1);
  });

  it('averageEvaluationScore: null when no finalized evaluations (not measured ≠ 0)', () => {
    const m = calculatePerformanceMetrics([], [], [], SCOPE);
    expect(m.averageEvaluationScore).toBeNull();
    const m2 = calculatePerformanceMetrics(
      [],
      [
        { overallScore: 80, finalizedAt: new Date('2026-02-05T00:00:00.000Z') },
        { overallScore: 90, finalizedAt: new Date('2026-02-06T00:00:00.000Z') },
      ] as PerfEvaluationFact[],
      [],
      SCOPE,
    );
    expect(m2.averageEvaluationScore).toBe(85);
    expect(m2.finalizedEvaluationCount).toBe(2);
  });

  it('evaluation average respects the period boundary on finalizedAt', () => {
    const evals = [
      { overallScore: 90, finalizedAt: new Date('2026-02-05T00:00:00.000Z') },
      { overallScore: 10, finalizedAt: new Date('2026-01-05T00:00:00.000Z') },
    ] as PerfEvaluationFact[];
    const m = calculatePerformanceMetrics([], evals, [], SCOPE_FEB);
    expect(m.averageEvaluationScore).toBe(90);
    expect(m.finalizedEvaluationCount).toBe(1);
  });
});
