import { planReplacementTasks, type ReplacementTask } from "./replacement-plan";
const now = new Date("2026-10-25T00:00:00Z");
const task = (override: Partial<ReplacementTask> = {}): ReplacementTask => ({
  id: "task-a",
  code: "T-1",
  title: "Task",
  status: "doing",
  version: 4,
  dueAt: new Date("2026-10-24T00:00:00Z"),
  sprintStatus: "active",
  hasPendingSubmission: false,
  ...override,
});
it("gives the new assignee a visible grace deadline while retaining a later deadline and keeping no-deadline tasks open", () => {
  const result = planReplacementTasks(
    [
      task(),
      task({ id: "task-b", dueAt: new Date("2026-10-30T00:00:00Z") }),
      task({ id: "task-c", dueAt: null }),
    ],
    now,
    24,
  );
  expect(result.transfers.map((t) => t.handoverDueAt)).toEqual([
    "2026-10-26T00:00:00.000Z",
    "2026-10-30T00:00:00.000Z",
    null,
  ]);
  expect(result.transfers[0].dueAt).toBe("2026-10-24T00:00:00.000Z");
  expect(result.transfers[0].version).toBe(4);
});
it("retains completed work and terminal sprint history with its original student", () => {
  const result = planReplacementTasks(
    [
      task(),
      task({ id: "done", status: "done" }),
      task({ id: "old", sprintStatus: "completed" }),
      task({ id: "cancelled", sprintStatus: "cancelled" }),
    ],
    now,
    24,
  );
  expect(result.transfers.map((t) => t.id)).toEqual(["task-a"]);
  expect(result.preservedCount).toBe(3);
});
it("blocks both review-status tasks and inconsistent pending submissions before any replacement", () => {
  expect(() =>
    planReplacementTasks([task({ status: "review" })], now, 24),
  ).toThrow("REPLACEMENT_PENDING_REVIEW");
  expect(() =>
    planReplacementTasks([task({ hasPendingSubmission: true })], now, 24),
  ).toThrow("REPLACEMENT_PENDING_REVIEW");
});
it("requires a finite SQL time and a bounded whole-hour grace period", () => {
  for (const hours of [0, 169, 1.5, NaN])
    expect(() => planReplacementTasks([task()], now, hours)).toThrow();
  expect(() => planReplacementTasks([task()], new Date(NaN), 24)).toThrow();
});
it("produces a stable task order without mutating the source evidence", () => {
  const input = [task({ id: "z" }), task({ id: "a" })],
    before = JSON.stringify(input);
  expect(
    planReplacementTasks(input, now, 24).transfers.map((t) => t.id),
  ).toEqual(["a", "z"]);
  expect(JSON.stringify(input)).toBe(before);
});
