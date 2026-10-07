/**
 * DETERMINISTIC performance calculator (Phase 5, spec 16-20) — PURE
 * functions over fetched DB facts. No randomness, no AI, no fake values;
 * the service only fetches rows and hands them here.
 *
 * NULL SEMANTICS (spec 17): "not measured" is null — never 0.
 * PERIOD BOUNDARY (spec 57): [from, to) on task.createdAt; task creation
 * defines period membership (documented in docs/architecture/…).
 */

/** Minimal row contracts — the service maps entities into these. */
export interface PerfTaskFact {
  id: string;
  status: 'todo' | 'doing' | 'review' | 'done';
  storyPoints: number | null;
  dueDate: Date | null;
  createdAt: Date;
  /** Earliest task_status_histories transition to 'done' (null = never done via history). */
  doneAt: Date | null;
}

export interface PerfEvaluationFact {
  overallScore: number;
  finalizedAt: Date;
}

export interface PerfSprintFact {
  id: string;
  status: string;
  startDate: Date;
  endDate: Date;
}

export interface PerformanceMetrics {
  totalTaskCount: number;
  completedTaskCount: number;
  taskCompletionRate: number | null;
  committedStoryPoints: number;
  completedStoryPoints: number;
  storyPointCompletionRate: number | null;
  onTimeCompletionRate: number | null;
  onTimeCompletedTaskCount: number;
  dueDatedCompletedTaskCount: number;
  overdueOpenTaskCount: number;
  averageEvaluationScore: number | null;
  finalizedEvaluationCount: number;
  activeSprintProgress: number | null;
}

export interface PerformanceScope {
  from?: Date | null;
  to?: Date | null;
  /** Server now — for overdue computation (injected for determinism). */
  now: Date;
}

function inPeriod(createdAt: Date, scope: PerformanceScope): boolean {
  if (scope.from && createdAt.getTime() < scope.from.getTime()) return false;
  if (scope.to && createdAt.getTime() >= scope.to.getTime()) return false;
  return true;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Core deterministic metrics for ONE intern from raw facts.
 * - Period membership: task.createdAt ∈ [from, to).
 * - completed = status 'done' (the single task vocabulary).
 * - on-time = doneAt (first 'done' history transition) <= dueDate, over
 *   completed tasks that HAVE a dueDate; null when none exist (spec 20).
 * - story points: null storyPoints never silently count as 0 points —
 *   they are excluded from SP numerators/denominators (declared only).
 */
export function calculatePerformanceMetrics(
  tasks: PerfTaskFact[],
  evaluations: PerfEvaluationFact[],
  sprints: PerfSprintFact[],
  scope: PerformanceScope,
): PerformanceMetrics {
  const scopedTasks = tasks.filter((t) => inPeriod(t.createdAt, scope));

  const totalTaskCount = scopedTasks.length;
  const completed = scopedTasks.filter((t) => t.status === 'done');
  const completedTaskCount = completed.length;

  const declared = scopedTasks.filter((t) => t.storyPoints !== null);
  const committedStoryPoints = declared.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const completedDeclared = declared.filter((t) => t.status === 'done');
  const completedStoryPoints = completedDeclared.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);

  const dueDated = completed.filter((t) => t.dueDate !== null);
  const onTime = dueDated.filter((t) => t.doneAt !== null && t.doneAt!.getTime() <= t.dueDate!.getTime());

  const overdueOpenTaskCount = scopedTasks.filter(
    (t) => t.status !== 'done' && t.dueDate !== null && t.dueDate!.getTime() < scope.now.getTime(),
  ).length;

  const finalizedEvaluations = evaluations.filter((e) => {
    if (!scope.from && !scope.to) return true;
    if (scope.from && e.finalizedAt.getTime() < scope.from.getTime()) return false;
    if (scope.to && e.finalizedAt.getTime() >= scope.to.getTime()) return false;
    return true;
  });
  const averageEvaluationScore =
    finalizedEvaluations.length === 0
      ? null
      : Math.round(
          (finalizedEvaluations.reduce((sum, e) => sum + e.overallScore, 0) / finalizedEvaluations.length) * 10,
        ) / 10;

  // Active-sprint progress: the intern's own SP completion inside the
  // active sprint(s) in scope (null when no active sprint / no declared SP).
  const activeSprints = sprints.filter(
    (s) => s.status === 'active' && s.startDate.getTime() <= scope.now.getTime(),
  );
  const activeSprintIds = new Set(activeSprints.map((s) => s.id));
  const activeSprintTasks = scopedTasks.filter((t) => activeSprintIds.has((t as PerfTaskFact & { sprintId?: string | null }).sprintId ?? ''));
  const activeDeclared = activeSprintTasks.filter((t) => t.storyPoints !== null);
  const activeCommitted = activeDeclared.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const activeCompleted = activeDeclared.filter((t) => t.status === 'done').reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const activeSprintProgress = activeSprints.length === 0 ? null : rate(activeCompleted, activeCommitted);

  return {
    totalTaskCount,
    completedTaskCount,
    taskCompletionRate: rate(completedTaskCount, totalTaskCount),
    committedStoryPoints,
    completedStoryPoints,
    storyPointCompletionRate: rate(completedStoryPoints, committedStoryPoints),
    onTimeCompletionRate: rate(onTime.length, dueDated.length),
    onTimeCompletedTaskCount: onTime.length,
    dueDatedCompletedTaskCount: dueDated.length,
    overdueOpenTaskCount,
    averageEvaluationScore,
    finalizedEvaluationCount: finalizedEvaluations.length,
    activeSprintProgress,
  };
}
