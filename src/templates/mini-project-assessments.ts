import { createHash } from 'node:crypto';
import { MINI_PROJECT_SOLUTIONS } from './mini-project-solutions';
import type { TemplateAssessment } from './template-package';

export interface MiniProjectCheck { name: string; operation: string; args: unknown[]; expected?: unknown; error?: boolean }
const note = { id: 'n1', title: 'Git', content: 'Đọc COMMIT và diff' };
const task = { id: 't1', title: 'Đọc đề', status: 'todo' };
const pen = { id: 'pen', name: 'Bút', priceVnd: 5000, stock: 5 };
const student = { studentCode: 'SV01', displayName: 'Sinh viên Demo', email: 'sv01@example.test' };
const booking = { id: 'b1', startsAt: '2027-01-10T09:00:00.000Z', endsAt: '2027-01-10T10:00:00.000Z', status: 'active' };
const post = { id: 'p1', slug: 'hoc-git', title: 'Học Git', body: 'Nội dung', status: 'draft' };
const ok = (name: string, operation: string, args: unknown[], expected: unknown): MiniProjectCheck => ({ name, operation, args, expected });
const bad = (name: string, operation: string, args: unknown[]): MiniProjectCheck => ({ name, operation, args, error: true });
/** Data-only checks. Expected outputs stay in the independent tester, never in the submission container. */
export const MINI_PROJECT_CHECKS: Record<string, MiniProjectCheck[]> = {
  notes: [
    ok('trim-title', 'addNote', [[], { id: ' n2 ', title: ' SQL ', content: '' }], [{ id: 'n2', title: 'SQL', content: '' }]),
    bad('reject-empty-title', 'addNote', [[], { id: 'n2', title: ' ', content: '' }]),
    bad('reject-duplicate-id', 'addNote', [[note], { ...note, title: 'Khác' }]),
    bad('reject-nontext-content', 'addNote', [[], { id: 'n2', title: 'Git', content: 2 }]),
    ok('search-content-case', 'searchNotes', [[note], 'commit'], [note]),
    ok('search-title-case', 'searchNotes', [[note], 'GIT'], [note]),
    ok('empty-query', 'searchNotes', [[note], '  '], [note]),
    ok('unknown-delete', 'removeNote', [[note], 'unknown'], [note]),
    ok('known-delete', 'removeNote', [[note], 'n1'], []),
    ok('plain-text-preserved', 'addNote', [[], { id: 'n2', title: 'HTML', content: '<script>throw 1</script>' }], [{ id: 'n2', title: 'HTML', content: '<script>throw 1</script>' }]),
  ],
  tasks: [
    ok('new-task-is-todo', 'addTask', [[], { id: ' t2 ', title: ' Git ', status: 'done' }], [{ id: 't2', title: 'Git', status: 'todo' }]),
    bad('reject-duplicate-id', 'addTask', [[task], { id: 't1', title: 'Khác' }]),
    bad('reject-empty-title', 'addTask', [[], { id: 't2', title: ' ' }]),
    ok('next-step', 'moveTask', [[task], 't1', 'doing'], [{ ...task, status: 'doing' }]),
    bad('reject-skipped-step', 'moveTask', [[task], 't1', 'done']),
    bad('reject-backwards', 'moveTask', [[{ ...task, status: 'done' }], 't1', 'doing']),
    ok('same-status-idempotent', 'moveTask', [[{ ...task, status: 'done' }], 't1', 'done'], [{ ...task, status: 'done' }]),
    bad('reject-missing-task', 'moveTask', [[task], 'unknown', 'doing']),
    bad('reject-status', 'moveTask', [[task], 't1', 'closed']),
    ok('filter-matches', 'filterTasks', [[task, { ...task, id: 't2', status: 'done' }], 'done'], [{ ...task, id: 't2', status: 'done' }]),
    ok('filter-all', 'filterTasks', [[task], null], [task]),
    bad('reject-invalid-filter', 'filterTasks', [[task], 'closed']),
  ],
  cart: [
    ok('catalog-price-authority', 'quoteCart', [[pen], [{ productId: 'pen', quantity: 2, priceVnd: 1 }]], { lines: [{ productId: 'pen', quantity: 2, subtotalVnd: 10000 }], totalVnd: 10000 }),
    ok('empty-cart', 'quoteCart', [[pen], []], { lines: [], totalVnd: 0 }),
    bad('reject-zero-quantity', 'quoteCart', [[pen], [{ productId: 'pen', quantity: 0 }]]),
    bad('reject-fractional-quantity', 'quoteCart', [[pen], [{ productId: 'pen', quantity: 1.5 }]]),
    bad('reject-over-stock', 'quoteCart', [[pen], [{ productId: 'pen', quantity: 6 }]]),
    bad('reject-unknown-product', 'quoteCart', [[pen], [{ productId: 'unknown', quantity: 1 }]]),
    bad('reject-duplicate-line', 'quoteCart', [[pen], [{ productId: 'pen', quantity: 1 }, { productId: 'pen', quantity: 1 }]]),
    bad('reject-negative-price', 'quoteCart', [[{ ...pen, priceVnd: -1 }], [{ productId: 'pen', quantity: 1 }]]),
    bad('reject-overflow', 'quoteCart', [[{ ...pen, priceVnd: Number.MAX_SAFE_INTEGER }], [{ productId: 'pen', quantity: 2 }]]),
    ok('zero-price-allowed', 'quoteCart', [[{ ...pen, priceVnd: 0 }], [{ productId: 'pen', quantity: 1 }]], { lines: [{ productId: 'pen', quantity: 1, subtotalVnd: 0 }], totalVnd: 0 }),
  ],
  roster: [
    ok('canonical-fields', 'addStudent', [[], { studentCode: ' sv02 ', displayName: ' Demo ', email: ' SV02@EXAMPLE.TEST ' }], [{ studentCode: 'SV02', displayName: 'Demo', email: 'sv02@example.test' }]),
    bad('duplicate-ignore-case', 'addStudent', [[student], { ...student, studentCode: 'sv01' }]),
    bad('reject-email', 'addStudent', [[], { ...student, email: 'invalid' }]),
    bad('reject-code-format', 'addStudent', [[], { ...student, studentCode: 'A B' }]),
    bad('reject-code-length', 'addStudent', [[], { ...student, studentCode: 'S'.repeat(21) }]),
    bad('reject-name-length', 'addStudent', [[], { ...student, displayName: 'S'.repeat(101) }]),
    ok('search-name-case', 'searchStudents', [[student], 'DEMO'], [student]),
    ok('search-code-case', 'searchStudents', [[student], 'sv01'], [student]),
    ok('empty-query', 'searchStudents', [[student], '  '], [student]),
  ],
  booking: [
    ok('adjacent-is-allowed', 'reserve', [[booking], { id: 'b2', startsAt: '2027-01-10T10:00:00Z', endsAt: '2027-01-10T11:00:00Z' }], [booking, { id: 'b2', startsAt: '2027-01-10T10:00:00.000Z', endsAt: '2027-01-10T11:00:00.000Z', status: 'active' }]),
    bad('timezone-overlap', 'reserve', [[booking], { id: 'b2', startsAt: '2027-01-10T16:30:00+07:00', endsAt: '2027-01-10T17:30:00+07:00' }]),
    bad('reject-missing-timezone', 'reserve', [[], { id: 'b2', startsAt: '2027-01-10T09:00:00', endsAt: '2027-01-10T10:00:00' }]),
    bad('reject-impossible-day', 'reserve', [[], { id: 'b2', startsAt: '2027-02-30T09:00:00Z', endsAt: '2027-02-30T10:00:00Z' }]),
    bad('reject-equal-window', 'reserve', [[], { id: 'b2', startsAt: '2027-01-10T10:00:00Z', endsAt: '2027-01-10T10:00:00Z' }]),
    bad('reject-duplicate-id', 'reserve', [[booking], { id: 'b1', startsAt: '2027-01-10T11:00:00Z', endsAt: '2027-01-10T12:00:00Z' }]),
    ok('cancel-keeps-history', 'cancelBooking', [[booking], 'b1'], [{ ...booking, status: 'cancelled' }]),
    ok('cancel-is-idempotent', 'cancelBooking', [[{ ...booking, status: 'cancelled' }], 'b1'], [{ ...booking, status: 'cancelled' }]),
    bad('reject-unknown-cancel', 'cancelBooking', [[booking], 'unknown']),
    ok('cancelled-does-not-block', 'reserve', [[{ ...booking, status: 'cancelled' }], { id: 'b2', startsAt: booking.startsAt, endsAt: booking.endsAt }], [{ ...booking, status: 'cancelled' }, { ...booking, id: 'b2' }]),
  ],
  blog: [
    ok('draft-is-private', 'listPublished', [[post]], []),
    ok('publish-visible', 'publishPost', [[post], 'p1'], [{ ...post, status: 'published' }]),
    ok('only-published', 'listPublished', [[post, { ...post, id: 'p2', status: 'published' }]], [{ ...post, id: 'p2', status: 'published' }]),
    ok('edit-requires-review', 'saveDraft', [[{ ...post, status: 'published' }], { ...post, title: 'Mới' }], [{ ...post, title: 'Mới' }]),
    bad('reject-duplicate-slug', 'saveDraft', [[post], { ...post, id: 'p2' }]),
    bad('reject-invalid-slug', 'saveDraft', [[], { ...post, slug: 'Sai Slug' }]),
    bad('reject-empty-body-publish', 'publishPost', [[{ ...post, body: ' ' }], 'p1']),
    bad('reject-missing-publish', 'publishPost', [[post], 'unknown']),
    ok('publish-idempotent', 'publishPost', [[{ ...post, status: 'published' }], 'p1'], [{ ...post, status: 'published' }]),
    ok('plain-text-only', 'saveDraft', [[], { ...post, body: '<script>throw 1</script>' }], [{ ...post, body: '<script>throw 1</script>' }]),
  ],
};
function mutate(slug: string, from: string, to: string) {
  const source = MINI_PROJECT_SOLUTIONS[slug];
  if (!source.includes(from)) throw Error('Fault no longer matches reviewed source.');
  return source.replace(from, to);
}
export const MINI_PROJECT_FAULTS: Record<string, Array<{ name: string; killedBy: string; source: string }>> = {
  notes: [
    { name: 'search-only-title', killedBy: 'search-content-case', source: mutate('notes', " || note.content.toLowerCase().includes(term)", '') },
    { name: 'no-title-trim', killedBy: 'trim-title', source: mutate('notes', 'title: input.title.trim()', 'title: input.title') },
  ],
  tasks: [
    { name: 'allow-status-jump', killedBy: 'reject-skipped-step', source: mutate('tasks', "if (status !== current.status && states.indexOf(status) !== states.indexOf(current.status) + 1)", 'if (false)') },
    { name: 'trust-create-status', killedBy: 'new-task-is-todo', source: mutate('tasks', "status: 'todo'", "status: input.status || 'todo'") },
  ],
  cart: [
    { name: 'trust-client-price', killedBy: 'catalog-price-authority', source: mutate('cart', 'product.priceVnd * line.quantity', '(line.priceVnd ?? product.priceVnd) * line.quantity') },
    { name: 'fractional-quantity', killedBy: 'reject-fractional-quantity', source: mutate('cart', '!Number.isSafeInteger(line.quantity)', "typeof line.quantity !== 'number'") },
  ],
  roster: [
    { name: 'case-sensitive-duplicate', killedBy: 'duplicate-ignore-case', source: mutate('roster', 'student.studentCode.trim().toUpperCase() === studentCode', 'student.studentCode === input.studentCode') },
    { name: 'no-email-validation', killedBy: 'reject-email', source: mutate('roster', " || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)", '') },
  ],
  booking: [
    { name: 'inclusive-end', killedBy: 'adjacent-is-allowed', source: mutate('booking', 'start < instant(booking.endsAt) && instant(booking.startsAt) < end', 'start <= instant(booking.endsAt) && instant(booking.startsAt) <= end') },
    { name: 'compare-local-strings', killedBy: 'timezone-overlap', source: mutate('booking', 'start < instant(booking.endsAt) && instant(booking.startsAt) < end', 'input.startsAt < booking.endsAt && booking.startsAt < input.endsAt') },
  ],
  blog: [
    { name: 'expose-drafts', killedBy: 'draft-is-private', source: mutate('blog', "posts.filter(post => post.status === 'published')", 'posts.filter(() => true)') },
    { name: 'keep-published-on-edit', killedBy: 'edit-requires-review', source: mutate('blog', "body: input.body, status: 'draft'", "body: input.body, status: posts.find(post => post.id === id)?.status || 'draft'") },
  ],
};
export function miniAssessment(slug: string): TemplateAssessment {
  const source = MINI_PROJECT_SOLUTIONS[slug], checks = MINI_PROJECT_CHECKS[slug];
  if (!source || !checks) throw Error('Unknown mini project.');
  const content = JSON.stringify(checks, null, 2) + '\n';
  return { schemaVersion: 1, solutionFiles: [{ path: 'src/model.cjs', content: source + '\n' }], hiddenTestFiles: [{ path: 'checks/behavior.json', content }],
    rubric: [
      { criterion: 'Quy tắc nghiệp vụ', description: 'Đúng hợp đồng input/output và quy tắc riêng của bài; có ví dụ chạy được.', weight: 40 },
      { criterion: 'Biên và input không hợp lệ', description: 'Từ chối đúng dữ liệu sai, không trả thành công giả hoặc che lỗi.', weight: 30 },
      { criterion: 'Không đổi input', description: 'Mảng/object đầu vào giữ nguyên cả khi thao tác thành công hoặc thất bại.', weight: 20 },
      { criterion: 'Bàn giao và giải thích', description: 'README/PR/SHA có bằng chứng và người học giải thích được cách làm; giảng viên duyệt riêng.', weight: 10 },
    ], taskSuites: [{ taskKey: 'implement-core', suiteId: `mini-${slug}-v1`, digest: createHash('sha256').update(content).digest('hex') }] };
}
