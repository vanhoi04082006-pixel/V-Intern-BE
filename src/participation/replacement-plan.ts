export interface ReplacementTask {
  id: string;
  code: string;
  title: string;
  status: "todo" | "doing" | "review" | "done";
  version: number;
  dueAt: Date | null;
  sprintStatus: string | null;
  hasPendingSubmission: boolean;
}
export function planReplacementTasks(
  tasks: readonly ReplacementTask[],
  preparedAt: Date,
  handoverHours: number,
) {
  if (
    !Number.isFinite(preparedAt.getTime()) ||
    !Number.isInteger(handoverHours) ||
    handoverHours < 1 ||
    handoverHours > 168
  )
    throw Error("REPLACEMENT_HANDOVER_INVALID");
  if (tasks.length > 500) throw Error("REPLACEMENT_TASK_LIMIT");
  if (tasks.some((t) => t.status === "review" || t.hasPendingSubmission))
    throw Error("REPLACEMENT_PENDING_REVIEW");
  const handoverAt = new Date(preparedAt.getTime() + handoverHours * 3600000),
    transfers = [];
  let preservedCount = 0;
  for (const task of [...tasks].sort((a, b) =>
    a.id.toLowerCase().localeCompare(b.id.toLowerCase()),
  )) {
    if (
      task.status === "done" ||
      ["completed", "cancelled"].includes(task.sprintStatus ?? "")
    ) {
      preservedCount++;
      continue;
    }
    if (task.dueAt && !Number.isFinite(task.dueAt.getTime()))
      throw Error("REPLACEMENT_TASK_DEADLINE_INVALID");
    transfers.push({
      id: task.id,
      code: task.code,
      title: task.title,
      status: task.status,
      version: task.version,
      dueAt: task.dueAt?.toISOString() ?? null,
      handoverDueAt: task.dueAt
        ? new Date(
            Math.max(task.dueAt.getTime(), handoverAt.getTime()),
          ).toISOString()
        : null,
    });
  }
  return { transfers, preservedCount, handoverAt: handoverAt.toISOString() };
}
