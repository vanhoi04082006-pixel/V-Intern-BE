/** Authored teaching material, never user-uploaded executable code. */
export interface MiniProjectDomain {
  slug: string; name: string; description: string; days: number;
  entities: string[]; functions: string[]; signatures: string[];
  rules: string[]; scenarios: string[]; exclusions: string[];
  sample: unknown; demo: string; tests: string;
}
export const MINI_PROJECT_DOMAINS: MiniProjectDomain[] = [
  {
    slug: 'notes', name: 'Sổ ghi chú học tập', days: 3,
    description: 'Module quản lý ghi chú plain text: tạo, tìm kiếm và xóa trên dữ liệu giả; tập trung validation và thao tác không làm đổi input.',
    entities: ['Note {id, title, content}'],
    functions: ['addNote', 'searchNotes', 'removeNote'],
    signatures: ['addNote(notes, {id,title,content}) → mảng mới', 'searchNotes(notes, query) → mảng ghi chú', 'removeNote(notes, id) → mảng mới'],
    rules: ['id và title là chuỗi, trim không rỗng; id duy nhất. content là chuỗi plain text, được phép rỗng.', 'Tìm title hoặc content không phân biệt hoa thường; query rỗng trả mọi ghi chú theo thứ tự gốc.', 'Xóa id không tồn tại trả mảng cùng giá trị; không sửa input và không thực thi HTML/script. Input sai ném Error.'],
    scenarios: ['Tạo ghi chú tiêu đề có khoảng trắng: lưu title đã trim.', 'Tìm GIT thấy ghi chú có từ Git trong nội dung.', 'Từ chối id trùng/title rỗng; xóa id lạ không mất ghi chú khác.'],
    exclusions: ['Đồng bộ cloud', 'Editor rich text', 'Tìm kiếm bỏ dấu'],
    sample: [{ id: 'n1', title: 'Buổi học Git', content: 'Đọc git status trước commit.' }],
    demo: "model.searchNotes(sample, 'GIT')",
    tests: `test('thêm và tìm ghi chú, không sửa input', () => {
  const original = [{ id: 'n1', title: 'Git', content: 'Lịch sử commit' }];
  const added = model.addNote(original, { id: 'n2', title: '  SQL  ', content: '' });
  assert.equal(original.length, 1); assert.equal(added[1].title, 'SQL');
  assert.equal(model.searchNotes(added, 'COMMIT')[0].id, 'n1');
  assert.deepEqual(model.searchNotes(added, '  '), added);
});
test('từ chối dữ liệu sai; xóa id lạ không mất dữ liệu', () => {
  const notes = [{ id: 'n1', title: 'Git', content: '' }];
  assert.throws(() => model.addNote(notes, { id: 'n1', title: 'SQL', content: '' }));
  assert.throws(() => model.addNote(notes, { id: 'n2', title: ' ', content: '' }));
  assert.deepEqual(model.removeNote(notes, 'missing'), notes);
  assert.deepEqual(model.removeNote(notes, 'n1'), []); assert.equal(notes.length, 1);
});`,
  },
  {
    slug: 'tasks', name: 'Bảng công việc cá nhân', days: 4,
    description: 'Module công việc với ba trạng thái todo/doing/done; tạo, chuyển trạng thái đúng thứ tự và lọc danh sách.',
    entities: ['Task {id, title, status: todo|doing|done}'],
    functions: ['addTask', 'moveTask', 'filterTasks'],
    signatures: ['addTask(tasks, {id,title}) → mảng mới, status=todo', 'moveTask(tasks, id, status) → mảng mới', 'filterTasks(tasks, status|null) → mảng kết quả'],
    rules: ['id/title là chuỗi đã trim không rỗng; id không trùng. Task mới luôn todo, không nhận status từ input.', 'Chỉ todo→doing→done; giữ nguyên status là idempotent. Từ chối nhảy bước, lùi bước, status lạ hoặc id không tồn tại bằng Error.', 'Lọc trước khi hiển thị; null trả tất cả, giữ thứ tự. Mọi hàm không sửa mảng/object input.'],
    scenarios: ['Tạo task, chuyển doing rồi done; lọc done thấy đúng task.', 'Gửi status=done khi tạo vẫn nhận todo.', 'Thử todo→done và done→doing: cả hai bị từ chối.'],
    exclusions: ['Kéo thả Kanban', 'Phân quyền nhóm', 'Deadline và thông báo'],
    sample: [{ id: 't1', title: 'Đọc đề bài', status: 'todo' }],
    demo: "model.filterTasks(sample, 'todo')",
    tests: `test('tạo todo rồi chuyển theo thứ tự, không sửa input', () => {
  const created = model.addTask([], { id: 't1', title: '  Học Git  ', status: 'done' });
  assert.deepEqual(created[0], { id: 't1', title: 'Học Git', status: 'todo' });
  const doing = model.moveTask(created, 't1', 'doing');
  assert.equal(created[0].status, 'todo');
  const done = model.moveTask(doing, 't1', 'done');
  assert.deepEqual(model.filterTasks(done, 'done'), done);
  assert.deepEqual(model.moveTask(done, 't1', 'done'), done);
});
test('chặn nhảy bước, trùng id và tiêu đề rỗng', () => {
  const tasks = [{ id: 't1', title: 'Git', status: 'todo' }];
  assert.throws(() => model.moveTask(tasks, 't1', 'done'));
  assert.throws(() => model.moveTask(tasks, 'missing', 'doing'));
  assert.throws(() => model.addTask(tasks, { id: 't1', title: 'Git' }));
  assert.throws(() => model.addTask(tasks, { id: 't2', title: ' ' }));
});`,
  },
  {
    slug: 'cart', name: 'Giỏ hàng mô phỏng', days: 4,
    description: 'Tính báo giá từ catalog cố định bằng số nguyên VND, kiểm số lượng và tồn kho; không tạo đơn, không thanh toán.',
    entities: ['Product {id, name, priceVnd, stock}', 'Line {productId, quantity}', 'Quote {lines:[{productId,quantity,subtotalVnd}], totalVnd}'],
    functions: ['quoteCart'], signatures: ['quoteCart(products, lines) → {lines, totalVnd}'],
    rules: ['Giá VND và stock trong catalog là số nguyên an toàn không âm; quantity là số nguyên an toàn dương, không vượt stock.', 'Chỉ lấy giá từ catalog, bỏ qua priceVnd do line gửi lên. Mỗi productId chỉ có một dòng; sản phẩm lạ hoặc trùng dòng ném Error.', 'Mỗi subtotal/tổng phải là số nguyên an toàn; giỏ rỗng totalVnd=0. Không sửa input hoặc giảm tồn kho khi chỉ báo giá.'],
    scenarios: ['Catalog bút 5000đ, hai bút cho tổng 10000đ.', 'Gửi giá giả 1đ trong line vẫn tính theo catalog.', 'Số lượng 0/1.5/vượt stock hoặc product lạ: báo lỗi, không tạo báo giá.'],
    exclusions: ['Đặt đơn và giảm kho', 'Tiền ngoại tệ, thuế, voucher', 'Kết nối cổng thanh toán'],
    sample: [{ id: 'pen', name: 'Bút mẫu', priceVnd: 5000, stock: 3 }],
    demo: "model.quoteCart(sample, [{ productId: 'pen', quantity: 2 }])",
    tests: `test('dùng giá catalog, số nguyên và không sửa kho', () => {
  const products = [{ id: 'pen', name: 'Bút', priceVnd: 5000, stock: 3 }];
  const quote = model.quoteCart(products, [{ productId: 'pen', quantity: 2, priceVnd: 1 }]);
  assert.deepEqual(quote, { lines: [{ productId: 'pen', quantity: 2, subtotalVnd: 10000 }], totalVnd: 10000 });
  assert.equal(products[0].stock, 3); assert.equal(model.quoteCart(products, []).totalVnd, 0);
});
test('từ chối số lượng sai, dòng trùng và mã lạ', () => {
  const products = [{ id: 'pen', priceVnd: 5000, stock: 3 }];
  for (const quantity of [0, -1, 1.5, 4]) assert.throws(() => model.quoteCart(products, [{ productId: 'pen', quantity }]));
  assert.throws(() => model.quoteCart(products, [{ productId: 'unknown', quantity: 1 }]));
  assert.throws(() => model.quoteCart(products, [{ productId: 'pen', quantity: 1 }, { productId: 'pen', quantity: 1 }]));
});`,
  },
  {
    slug: 'roster', name: 'Danh sách lớp học nhỏ', days: 3,
    description: 'Quản lý danh sách sinh viên giả của một lớp: thêm hồ sơ, chống trùng mã và tìm theo tên/mã; không quản lý điểm.',
    entities: ['Student {studentCode, displayName, email}'],
    functions: ['addStudent', 'searchStudents'],
    signatures: ['addStudent(students, {studentCode,displayName,email}) → mảng mới', 'searchStudents(students, query) → mảng kết quả'],
    rules: ['Mã sinh viên gồm 2–20 chữ/số/gạch ngang, chuẩn hóa trim + uppercase, duy nhất không phân biệt hoa thường.', 'Tên trim 1–100 ký tự. Email trim/lowercase, dùng định dạng đơn giản non-space@non-space.non-space; chỉ dữ liệu .test trong demo.', 'Tìm theo tên/mã không phân biệt hoa thường, query rỗng trả tất cả. Không sửa input. Input sai ném Error; không kiểm email tồn tại thật.'],
    scenarios: ['Thêm sv02 thành SV02; tên và email được chuẩn hóa.', 'SV01 và sv01 được coi là trùng.', 'Tìm DEMO thấy sinh viên tên Demo; email thiếu @ bị từ chối.'],
    exclusions: ['Quản lý nhiều lớp', 'Điểm số và học phí', 'Xác minh email qua mạng'],
    sample: [{ studentCode: 'SV01', displayName: 'Sinh viên Demo', email: 'sv01@example.test' }],
    demo: "model.searchStudents(sample, 'demo')",
    tests: `test('chuẩn hóa và tìm hồ sơ, không sửa mảng gốc', () => {
  const students = model.addStudent([], { studentCode: ' sv01 ', displayName: ' Demo ', email: ' SV01@EXAMPLE.TEST ' });
  assert.deepEqual(students[0], { studentCode: 'SV01', displayName: 'Demo', email: 'sv01@example.test' });
  assert.equal(model.searchStudents(students, 'demo').length, 1);
  assert.deepEqual(model.searchStudents(students, ''), students);
  const next = model.addStudent(students, { studentCode: 'SV02', displayName: 'Demo 2', email: 'sv02@example.test' });
  assert.equal(students.length, 1); assert.equal(next.length, 2);
});
test('từ chối mã trùng và email sai', () => {
  const students = [{ studentCode: 'SV01', displayName: 'Demo', email: 'sv01@example.test' }];
  assert.throws(() => model.addStudent(students, { studentCode: 'sv01', displayName: 'Demo', email: 'x@example.test' }));
  assert.throws(() => model.addStudent([], { studentCode: 'SV02', displayName: 'Demo', email: 'invalid' }));
});`,
  },
  {
    slug: 'booking', name: 'Lịch đặt một phòng học', days: 5,
    description: 'Module đặt lịch cho một phòng giả lập, dùng khoảng giờ có timezone và giữ lịch sử khi hủy; xử lý tuần tự trong bộ nhớ.',
    entities: ['Booking {id, startsAt, endsAt, status: active|cancelled}'],
    functions: ['reserve', 'cancelBooking'],
    signatures: ['reserve(bookings, {id,startsAt,endsAt}) → mảng mới, status=active', 'cancelBooking(bookings, id) → mảng mới'],
    rules: ['id trim không rỗng/duy nhất; giờ theo ISO YYYY-MM-DDTHH:mm:ss(.sss)?Z hoặc ±HH:mm, ngày/giờ phải hợp lệ; lưu ISO UTC. startsAt < endsAt.', 'Lịch active giao nhau theo [start,end) bị từ chối; lịch sát nhau được phép. Hai cách viết timezone cùng thời điểm phải cho cùng kết quả.', 'Lịch hủy giữ bản ghi và không chiếm giờ; hủy lại là idempotent; id lạ ném Error. Không sửa input. Chưa giải quyết transaction/concurrency server.'],
    scenarios: ['09:00–10:00Z và 10:00–11:00Z được đặt liền nhau.', '16:30+07:00–17:30+07:00 chồng 09:00–10:00Z nên bị từ chối.', 'Hủy lịch cũ rồi đặt lại giờ đó; lịch cũ vẫn có status cancelled.'],
    exclusions: ['Nhiều phòng và capacity', 'Gửi lịch email', 'Cạnh tranh nhiều request server'],
    sample: [{ id: 'b1', startsAt: '2027-01-10T09:00:00.000Z', endsAt: '2027-01-10T10:00:00.000Z', status: 'active' }],
    demo: "model.reserve(sample, { id: 'b2', startsAt: '2027-01-10T10:00:00Z', endsAt: '2027-01-10T11:00:00Z' })",
    tests: `test('cho phép sát giờ, chặn chồng timezone và không sửa input', () => {
  const bookings = [{ id: 'b1', startsAt: '2027-01-10T09:00:00.000Z', endsAt: '2027-01-10T10:00:00.000Z', status: 'active' }];
  const next = model.reserve(bookings, { id: 'b2', startsAt: '2027-01-10T10:00:00Z', endsAt: '2027-01-10T11:00:00Z' });
  assert.equal(next.length, 2); assert.equal(bookings.length, 1);
  assert.throws(() => model.reserve(bookings, { id: 'b3', startsAt: '2027-01-10T16:30:00+07:00', endsAt: '2027-01-10T17:30:00+07:00' }));
});
test('hủy giữ lịch sử; từ chối giờ thiếu timezone hoặc không tăng', () => {
  const bookings = [{ id: 'b1', startsAt: '2027-01-10T09:00:00.000Z', endsAt: '2027-01-10T10:00:00.000Z', status: 'active' }];
  const cancelled = model.cancelBooking(bookings, 'b1');
  assert.equal(cancelled[0].status, 'cancelled'); assert.equal(bookings[0].status, 'active');
  assert.deepEqual(model.cancelBooking(cancelled, 'b1'), cancelled);
  assert.throws(() => model.reserve([], { id: 'b2', startsAt: '2027-01-10T10:00:00', endsAt: '2027-01-10T11:00:00' }));
  assert.throws(() => model.reserve([], { id: 'b2', startsAt: '2027-01-10T11:00:00Z', endsAt: '2027-01-10T10:00:00Z' }));
});`,
  },
  {
    slug: 'blog', name: 'Bản nháp và xuất bản bài viết', days: 4,
    description: 'Module Blog plain text: lưu bản nháp, xuất bản theo slug và chỉ trả bài công khai; không dựng hệ thống CMS lớn.',
    entities: ['Post {id, slug, title, body, status: draft|published}'],
    functions: ['saveDraft', 'publishPost', 'listPublished'],
    signatures: ['saveDraft(posts, {id,slug,title,body}) → mảng mới (insert/update theo id)', 'publishPost(posts, id) → mảng mới', 'listPublished(posts) → mảng bài published'],
    rules: ['id/title trim không rỗng; slug lowercase chữ/số với gạch ngang giữa từ, duy nhất. body là plain text, không thực thi nội dung.', 'saveDraft ghi status=draft kể cả cập nhật bài đã publish. Publish yêu cầu body trim không rỗng; id lạ ném Error. Publish lại giữ nguyên giá trị.', 'Danh sách public chỉ có status=published theo thứ tự gốc; không để draft lọt ra. Không sửa input. Đây là domain filter, không phải chứng minh API authorization.'],
    scenarios: ['Tạo nháp chưa có trong listPublished; xuất bản rồi mới thấy.', 'Sửa bài đã xuất bản đưa về draft cho lần duyệt tiếp.', 'Slug trùng/sai hoặc publish body rỗng: báo lỗi, giữ dữ liệu cũ.'],
    exclusions: ['Tài khoản editor và API auth', 'Markdown/rich HTML', 'Upload ảnh và bình luận'],
    sample: [{ id: 'p1', slug: 'hoc-git', title: 'Học Git', body: 'Ví dụ plain text.', status: 'draft' }],
    demo: "model.listPublished(sample)",
    tests: `test('draft không public; publish rồi sửa trở về draft', () => {
  const draft = model.saveDraft([], { id: 'p1', slug: 'hoc-git', title: 'Git', body: 'Nội dung' });
  assert.deepEqual(model.listPublished(draft), []);
  const published = model.publishPost(draft, 'p1');
  assert.equal(model.listPublished(published).length, 1); assert.equal(draft[0].status, 'draft');
  const edited = model.saveDraft(published, { id: 'p1', slug: 'hoc-git', title: 'Git mới', body: 'Sửa bài' });
  assert.deepEqual(model.listPublished(edited), []); assert.equal(published[0].status, 'published');
});
test('từ chối slug trùng/sai và publish nội dung rỗng', () => {
  const posts = [{ id: 'p1', slug: 'hoc-git', title: 'Git', body: ' ', status: 'draft' }];
  assert.throws(() => model.publishPost(posts, 'p1'));
  assert.throws(() => model.saveDraft(posts, { id: 'p2', slug: 'hoc-git', title: 'Git', body: 'Khác' }));
  assert.throws(() => model.saveDraft([], { id: 'p2', slug: 'Sai Slug', title: 'Git', body: 'Nội dung' }));
});`,
  },
];
