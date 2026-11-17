/** Correct the old withdrawal label on read without rewriting historical events or audit logs. */
export function presentActivity<T extends { action: string; summary: string | null }>(event: T): T {
  return event.action === 'submission.withdraw'
    ? { ...event, summary: 'Sinh viên đã rút bài nộp để cập nhật code' }
    : event;
}
