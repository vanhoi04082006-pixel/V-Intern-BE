/** Reviewed teaching references, not user-supplied code. Never projected into a public package. */
export const MINI_PROJECT_SOLUTIONS: Record<string, string> = {
  notes: `function addNote(notes, input) {
  if (!input || typeof input.id !== 'string' || !input.id.trim() || typeof input.title !== 'string' || !input.title.trim() || typeof input.content !== 'string') throw Error('Invalid note');
  const id = input.id.trim();
  if (notes.some(note => note.id === id)) throw Error('Duplicate id');
  return [...notes, { id, title: input.title.trim(), content: input.content }];
}
function searchNotes(notes, query) {
  if (typeof query !== 'string') throw Error('Invalid query');
  const term = query.trim().toLowerCase();
  return notes.filter(note => note.title.toLowerCase().includes(term) || note.content.toLowerCase().includes(term));
}
function removeNote(notes, id) {
  if (typeof id !== 'string' || !id.trim()) throw Error('Invalid id');
  return notes.filter(note => note.id !== id.trim());
}
module.exports = { addNote, searchNotes, removeNote };`,
  tasks: `function addTask(tasks, input) {
  if (!input || typeof input.id !== 'string' || !input.id.trim() || typeof input.title !== 'string' || !input.title.trim()) throw Error('Invalid task');
  const id = input.id.trim();
  if (tasks.some(task => task.id === id)) throw Error('Duplicate id');
  return [...tasks, { id, title: input.title.trim(), status: 'todo' }];
}
function moveTask(tasks, id, status) {
  const states = ['todo', 'doing', 'done'], current = tasks.find(task => task.id === id);
  if (!current || !states.includes(status)) throw Error('Invalid transition');
  if (status !== current.status && states.indexOf(status) !== states.indexOf(current.status) + 1) throw Error('Invalid transition');
  return tasks.map(task => task.id === id ? { ...task, status } : task);
}
function filterTasks(tasks, status) {
  if (status !== null && !['todo', 'doing', 'done'].includes(status)) throw Error('Invalid status');
  return tasks.filter(task => status === null || task.status === status);
}
module.exports = { addTask, moveTask, filterTasks };`,
  cart: `function quoteCart(products, lines) {
  const seen = new Set();
  let totalVnd = 0;
  const quoted = lines.map(line => {
    const product = products.find(item => item.id === line.productId);
    if (!product || seen.has(line.productId) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.quantity > product.stock) throw Error('Invalid line');
    if (!Number.isSafeInteger(product.priceVnd) || product.priceVnd < 0 || !Number.isSafeInteger(product.stock) || product.stock < 0) throw Error('Invalid catalog');
    seen.add(line.productId);
    const subtotalVnd = product.priceVnd * line.quantity;
    totalVnd += subtotalVnd;
    if (!Number.isSafeInteger(subtotalVnd) || !Number.isSafeInteger(totalVnd)) throw Error('Unsafe total');
    return { productId: line.productId, quantity: line.quantity, subtotalVnd };
  });
  return { lines: quoted, totalVnd };
}
module.exports = { quoteCart };`,
  roster: `function addStudent(students, input) {
  if (!input || typeof input.studentCode !== 'string' || typeof input.displayName !== 'string' || typeof input.email !== 'string') throw Error('Invalid student');
  const studentCode = input.studentCode.trim().toUpperCase(), displayName = input.displayName.trim(), email = input.email.trim().toLowerCase();
  if (!/^[A-Z0-9-]{2,20}$/.test(studentCode) || !displayName || displayName.length > 100 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw Error('Invalid student');
  if (students.some(student => student.studentCode.trim().toUpperCase() === studentCode)) throw Error('Duplicate code');
  return [...students, { studentCode, displayName, email }];
}
function searchStudents(students, query) {
  if (typeof query !== 'string') throw Error('Invalid query');
  const term = query.trim().toLowerCase();
  return students.filter(student => student.studentCode.toLowerCase().includes(term) || student.displayName.toLowerCase().includes(term));
}
module.exports = { addStudent, searchStudents };`,
  booking: `function instant(value) {
  if (typeof value !== 'string') throw Error('Invalid instant');
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{3}))?(Z|[+-]\\d{2}:\\d{2})$/.exec(value);
  if (!match) throw Error('Timezone required');
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (year < 1000 || local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(value))) throw Error('Invalid calendar time');
  return Date.parse(value);
}
function reserve(bookings, input) {
  if (!input || typeof input.id !== 'string' || !input.id.trim()) throw Error('Invalid id');
  const id = input.id.trim(), start = instant(input.startsAt), end = instant(input.endsAt);
  if (start >= end || bookings.some(booking => booking.id === id)) throw Error('Invalid booking');
  if (bookings.some(booking => booking.status === 'active' && start < instant(booking.endsAt) && instant(booking.startsAt) < end)) throw Error('Overlap');
  return [...bookings, { id, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), status: 'active' }];
}
function cancelBooking(bookings, id) {
  if (!bookings.some(booking => booking.id === id)) throw Error('Unknown booking');
  return bookings.map(booking => booking.id === id ? { ...booking, status: 'cancelled' } : booking);
}
module.exports = { reserve, cancelBooking };`,
  blog: `function saveDraft(posts, input) {
  if (!input || typeof input.id !== 'string' || !input.id.trim() || typeof input.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) || typeof input.title !== 'string' || !input.title.trim() || typeof input.body !== 'string') throw Error('Invalid post');
  const id = input.id.trim();
  if (posts.some(post => post.slug === input.slug && post.id !== id)) throw Error('Duplicate slug');
  const record = { id, slug: input.slug, title: input.title.trim(), body: input.body, status: 'draft' };
  return posts.some(post => post.id === id) ? posts.map(post => post.id === id ? record : post) : [...posts, record];
}
function publishPost(posts, id) {
  const current = posts.find(post => post.id === id);
  if (!current || !current.body.trim()) throw Error('Cannot publish');
  return posts.map(post => post.id === id ? { ...post, status: 'published' } : post);
}
function listPublished(posts) { return posts.filter(post => post.status === 'published'); }
module.exports = { saveDraft, publishPost, listPublished };`,
};
