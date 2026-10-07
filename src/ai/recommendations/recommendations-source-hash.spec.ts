import { createHash } from 'node:crypto';
import { stableStringify } from './recommendations.service';

/**
 * Deterministic source-hash contract (Phase 6, spec 34/35): identical DB
 * facts must produce an identical hash regardless of object key order, so
 * the reuse rule never fires a duplicate provider call; any fact change
 * must change the hash. The recommendation schema version participates in
 * the hashed payload.
 */
const FACTS = {
  intern: { displayName: 'Intern A', recruitmentRole: 'frontend' },
  metrics: {
    completedTaskCount: 3,
    totalTaskCount: 4,
    taskCompletionRate: 75,
    overdueOpenTaskCount: 1,
    averageEvaluationScore: null,
  },
  kpi: { periodCode: 'KPI-1', finalScore: 83.8 },
  taskStatusCounts: { todo: 0, doing: 1, review: 0, done: 3 },
};

function hash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

describe('recommendation source hash stability', () => {
  it('produces an identical hash for identical facts with different key order', () => {
    const reordered = {
      taskStatusCounts: { doing: 1, done: 3, todo: 0, review: 0 },
      kpi: { finalScore: 83.8, periodCode: 'KPI-1' },
      metrics: {
        averageEvaluationScore: null,
        overdueOpenTaskCount: 1,
        taskCompletionRate: 75,
        totalTaskCount: 4,
        completedTaskCount: 3,
      },
      intern: { recruitmentRole: 'frontend', displayName: 'Intern A' },
    };
    expect(hash(reordered)).toBe(hash(FACTS));
  });

  it('changes the hash when ANY fact changes', () => {
    const changed = JSON.parse(JSON.stringify(FACTS)) as typeof FACTS;
    changed.metrics.taskCompletionRate = 80;
    expect(hash(changed)).not.toBe(hash(FACTS));

    const changedNull = JSON.parse(JSON.stringify(FACTS)) as Record<string, unknown>;
    ((changedNull.metrics as Record<string, unknown>).averageEvaluationScore = 0); // null → 0 must differ
    expect(hash(changedNull)).not.toBe(hash(FACTS));
  });

  it('preserves array order (evidence lists are order-meaningful)', () => {
    const a = hash({ codes: ['onTimeCompletionRate', 'taskCompletionRate'] });
    const b = hash({ codes: ['taskCompletionRate', 'onTimeCompletionRate'] });
    expect(a).not.toBe(b);
  });

  it('the snapshot schema version participates in the hash', () => {
    const v1 = hash({ schemaVersion: 1, facts: FACTS });
    const v2 = hash({ schemaVersion: 2, facts: FACTS });
    expect(v1).not.toBe(v2);
  });
});
