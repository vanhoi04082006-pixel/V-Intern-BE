import type { CreateTemplateDto, TemplateTaskDto } from './template.dto';

interface DomainBlueprint {
  slug: string;
  entities: string[];
  endpoints: string[];
  pages: string[];
  rules: string[];
}
const domains: Record<string, DomainBlueprint> = {
  'LEARN-TASKS-V1': {
    slug: 'task-management',
    entities: ['Task(id,title,description,status,priority,dueDate,version,createdAt)', 'TaskEvent(id,taskId,fromStatus,toStatus,createdAt)'],
    endpoints: ['GET /tasks?page&pageSize&status&priority', 'POST /tasks {title,description,priority,dueDate}', 'PATCH /tasks/:id {version,status,...changes}'],
    pages: ['/tasks — danh sách, bộ lọc và phân trang', '/tasks/new — tạo công việc', '/tasks/:id — chi tiết, sửa và lịch sử trạng thái'],
    rules: ['Tiêu đề 1–200 ký tự; trạng thái chỉ todo/doing/done.', 'Server kiểm tra ngày và version để tránh ghi đè thay đổi mới.', 'Đổi trạng thái và ghi lịch sử phải cùng transaction; lọc trước khi phân trang.'],
  },
  'LEARN-SHOP-V1': {
    slug: 'mini-ecommerce',
    entities: ['Product(id,name,priceMinor,currency,stock,version)', 'Order(id,customerName,address,totalMinor,status,requestId)', 'OrderItem(orderId,productId,quantity,unitPriceMinor)'],
    endpoints: ['GET /products?page&pageSize&search', 'GET /products/:id', 'POST /orders {requestId,items:[{productId,quantity}],customerName,address}', 'GET /orders/:id — mã tra cứu mô phỏng, không dùng dữ liệu cá nhân thật'],
    pages: ['/products — danh mục', '/products/:id — sản phẩm', '/cart — giỏ hàng', '/checkout — đặt đơn mô phỏng', '/orders/:id — xác nhận'],
    rules: ['Giá và tồn kho lấy từ server; tính tiền bằng số nguyên theo đơn vị nhỏ nhất.', 'Quantity là số nguyên dương; tạo đơn và giảm kho trong một transaction.', 'requestId chống đặt đơn trùng khi retry; hai đơn đồng thời không được bán vượt kho.'],
  },
  'LEARN-NOTES-V1': {
    slug: 'study-notes',
    entities: ['Note(id,title,content,tags,createdAt,updatedAt)', 'NotesEnvelope(schemaVersion,notes) — localStorage, không có database server'],
    endpoints: ['Ứng dụng offline: không yêu cầu API server; storage adapter load/save/export có validation schema.'],
    pages: ['/ — danh sách và tìm kiếm', '/notes/new — tạo ghi chú', '/notes/:id — sửa ghi chú và xuất dữ liệu'],
    rules: ['Tiêu đề không được rỗng; xóa cần xác nhận, hủy xóa giữ dữ liệu.', 'Nội dung là plain text; dữ liệu localStorage hỏng/quota lỗi phải được thông báo, không ghi đè bản gốc hỏng một cách im lặng.', 'Xuất JSON có schemaVersion; không tải code hoặc script từ nội dung ghi chú.'],
  },
  'LEARN-STUDENTS-V1': {
    slug: 'student-management',
    entities: ['Student(id,studentCode,displayName,email,status,version)', 'Class(id,code,name)', 'Enrollment(studentId,classId,enrolledAt) UNIQUE(studentId,classId)'],
    endpoints: ['GET /students?page&pageSize&search&classId', 'POST /students {studentCode,displayName,email}', 'PATCH /students/:id {version,...changes}', 'POST /classes/:id/enrollments {studentId}', 'DELETE /classes/:id/enrollments/:studentId'],
    pages: ['/students — tìm kiếm và phân trang', '/students/new — thêm hồ sơ', '/students/:id — chi tiết và lớp học', '/classes — danh sách lớp và ghi danh'],
    rules: ['Mã sinh viên và mã lớp duy nhất, kiểm tra không phân biệt hoa thường.', 'Không ghi danh trùng; inactive student không được thêm vào lớp.', 'Chỉ dùng dữ liệu sinh viên giả trong demo; trả 409 cho xung đột mã/version.'],
  },
  'LEARN-BOOKING-V1': {
    slug: 'room-booking',
    entities: ['Room(id,name,capacity,active)', 'Booking(id,roomId,startsAt,endsAt,guestName,status,requestId,version)'],
    endpoints: ['GET /rooms?startsAt&endsAt', 'GET /bookings?page&pageSize&date', 'POST /bookings {roomId,startsAt,endsAt,guestName,requestId}', 'POST /bookings/:id/cancel {version}'],
    pages: ['/rooms — phòng và khung giờ', '/bookings/new — đặt phòng', '/bookings — lịch và lọc ngày', '/bookings/:id — xác nhận/hủy'],
    rules: ['Thời gian ISO8601 có timezone, lưu UTC, hiển thị theo timezone trình duyệt.', 'startsAt < endsAt; hai booking active cùng phòng không được giao nhau theo khoảng [start,end).', 'Kiểm tra overlap và tạo booking trong transaction có khóa chống đặt trùng đồng thời.', 'Hủy booking giữ lịch sử; requestId retry trả lại booking cũ.'],
  },
  'LEARN-BLOG-V1': {
    slug: 'blog-cms',
    entities: ['Post(id,title,slug,body,status,publishedAt,version)', 'Tag(id,name,slug)', 'PostTag(postId,tagId)'],
    endpoints: ['GET /posts?page&pageSize&tag — chỉ published', 'GET /posts/:slug — chỉ published', 'GET /editor/posts — xác thực editor', 'POST /editor/posts', 'PATCH /editor/posts/:id {version,...changes}', 'POST /editor/posts/:id/publish'],
    pages: ['/blog — bài đã xuất bản', '/blog/:slug — nội dung', '/editor — danh sách draft', '/editor/posts/:id — soạn thảo và xuất bản'],
    rules: ['Slug duy nhất, chỉ chữ thường/số/dấu gạch; nháp không xuất hiện qua public API.', 'Publish yêu cầu title/body không rỗng; ghi publishedAt bằng thời gian server.', 'Nội dung hiển thị plain text hoặc renderer đã sanitize; không dùng dangerouslySetInnerHTML cho input chưa tin cậy.', 'Editor API có auth và kiểm tra vai trò ở server; tài khoản demo không có secret trong Git.'],
  },
};

const task = (role: string, title: string, requirements: string, dod: string[]): TemplateTaskDto => ({ role, title, requirements, dod, storyPoints: 3 });
function extra(code: string, name: string, description: string, functional: string[], backend: string, frontend: string): CreateTemplateDto {
  return {
    code, name, description, category: 'small-projects', difficulty: 'beginner', roles: ['frontend', 'backend'], techStack: ['React', 'TypeScript', 'NestJS', 'SQL Server'],
    modules: functional, scopeIn: functional, scopeOut: ['Thanh toán thật', 'Dữ liệu cá nhân thật', 'Thông báo SMS/email'], functionalRequirements: functional,
    nonFunctionalRequirements: ['Dùng được ở 375px và bằng bàn phím.', 'Validate server, phân trang, loading/empty/error và retry.', 'Không commit secrets; mutation có transaction và kiểm tra cạnh tranh.'],
    roleDetails: [{ code: 'frontend', title: 'Frontend Developer', countMin: 1, countMax: 1, requiredSkills: ['React', 'TypeScript', 'CSS'], level: 'junior' }, { code: 'backend', title: 'Backend Developer', countMin: 1, countMax: 1, requiredSkills: ['NestJS', 'SQL', 'REST'], level: 'junior' }],
    objectives: { business: description, learning: ['Thống nhất API và schema trước tích hợp.', 'Chứng minh quy tắc nghiệp vụ bằng kiểm thử.'], product: functional },
    sprints: [
      { name: 'Nền tảng và luồng chính', goal: 'Schema, API và giao diện sử dụng chính', durationDays: 7, tasks: [task('backend', 'Schema và API nghiệp vụ', backend, ['Migration và API contract chạy được', 'Kiểm thử happy path và input sai']), task('frontend', 'Giao diện và luồng thao tác chính', frontend, ['Giao diện kết nối API thật', 'Loading, empty, error và bàn phím hoạt động'])] },
      { name: 'Tích hợp và bàn giao', goal: 'Kiểm tra biên, bảo mật và bàn giao', durationDays: 7, tasks: [task('backend', 'Kiểm thử quy tắc và cạnh tranh', 'Bổ sung kiểm thử transaction, retry và truy cập trái phép theo business rules của blueprint; sửa lỗi và tài liệu API.', ['Có kiểm thử hành vi biên và concurrency', 'Lỗi rollback không để dữ liệu dở dang']), task('frontend', 'Hoàn thiện tích hợp và nghiệm thu', 'Kiểm thử thao tác tạo/sửa/lọc và tình huống API lỗi; hoàn thiện responsive, README và demo.', ['Luồng chính chạy trên desktop/mobile', 'Không hiển thị thành công khi server từ chối', 'README có setup và test'])] },
    ],
    expectedOutputs: { deliverables: ['Source code và README', 'API docs với request/response/errors', 'Demo và báo cáo kiểm thử'], artifacts: ['PR gắn task và SHA', 'Hướng dẫn triển khai và biến môi trường'] },
    acceptance: { definitionOfDone: ['Toàn bộ business rules có bằng chứng test', 'Giảng viên chạy lại demo theo README'], qualityGates: ['Build/lint/test đạt', 'Không có secret hoặc lỗi chặn luồng chính'] },
    dod: ['Đúng phạm vi và có kiểm thử', 'PR được giảng viên xác nhận'], rubricVersion: 'task-review-v1', scenarios: functional.map(requirement => `Nghiệm thu với dữ liệu hợp lệ và dữ liệu biên: ${requirement}`),
    documentation: 'Chuẩn 14 ngày, hai sprint. Chốt schema/API và UI flow trước khi chia task. Chạy npm ci, cấu hình .env theo example, migration, npm run dev. Bàn giao npm run build, npm test, API docs, deployment và demo có dữ liệu giả. Không dùng dữ liệu/credential thật. AI chỉ đề xuất, giảng viên xác nhận.',
  };
}
export const EXTRA_BLUEPRINTS = [
  extra('LEARN-STUDENTS-V1', 'Quản lý sinh viên và lớp học', 'Ứng dụng quản lý hồ sơ giả lập, lớp học và ghi danh với tìm kiếm và kiểm soát dữ liệu trùng.', ['Danh sách sinh viên có phân trang và tìm kiếm', 'Tạo/sửa hồ sơ và kiểm tra mã duy nhất', 'Quản lý lớp và ghi danh/hủy ghi danh', 'Tra cứu sinh viên theo lớp'], 'Thiết kế Student/Class/Enrollment; API CRUD hồ sơ, danh sách phân trang và ghi danh không trùng.', 'Xây danh sách, form hồ sơ và chi tiết lớp; nối API ghi danh, hiển thị conflict và trạng thái không dữ liệu.'),
  extra('LEARN-BOOKING-V1', 'Đặt phòng theo khung giờ', 'Ứng dụng đặt phòng mô phỏng với lịch theo ngày, kiểm tra trùng giờ và hủy đặt có lịch sử.', ['Xem phòng và khung giờ còn trống', 'Tạo booking theo timezone rõ ràng', 'Ngăn đặt chồng giờ kể cả hai request đồng thời', 'Danh sách và hủy booking'], 'Thiết kế Room/Booking; truy vấn khoảng thời gian, tạo/hủy có transaction và idempotency.', 'Xây danh sách phòng, chọn thời gian, xác nhận booking và lịch; hiển thị giờ địa phương, conflict và retry.'),
  extra('LEARN-BLOG-V1', 'Blog CMS và quy trình xuất bản', 'CMS nhỏ cho biên tập viên quản lý bản nháp và xuất bản bài viết; người đọc chỉ thấy bài đã công khai.', ['Danh sách bài published và lọc tag', 'Chi tiết bài theo slug', 'Editor đăng nhập, tạo và sửa draft', 'Xuất bản và kiểm tra quyền truy cập'], 'Thiết kế Post/Tag/PostTag; public API chỉ published, editor API có auth/role và version conflict.', 'Xây trang đọc, trình sửa plain text và publish; tách draft/public, render nội dung an toàn và lỗi API.'),
];

export function enrichLearningBlueprint(source: CreateTemplateDto): CreateTemplateDto {
  const domain = domains[source.code ?? ''];
  if (!domain) throw new Error('Missing blueprint domain.');
  let order = 0;
  const foundationKeys = source.sprints[0].tasks.map((_, index) => `s1-t${index + 1}`);
  const sprints = source.sprints.map((sprint, sprintIndex) => ({ ...sprint, tasks: sprint.tasks.map((task, index) => ({
    ...task, key: `s${sprintIndex + 1}-t${index + 1}`, dependsOn: sprintIndex ? foundationKeys : [],
    priority: sprintIndex ? 'medium' : 'high', complexity: sprintIndex ? 'medium' : 'easy', estimatedHours: task.storyPoints * 3,
    recommendedOrder: ++order, skillTags: task.role === 'frontend' ? ['TypeScript', 'UI', 'accessibility', 'integration'] : ['REST', 'SQL', 'validation', 'transactions'],
    expectedOutput: `${task.title}: code, kiểm thử và bằng chứng đạt từng tiêu chí nghiệm thu.`,
  })) }));
  return {
    ...source, slug: domain.slug, estimatedDurationDays: 14, recommendedTeamSize: source.roles.length,
    businessRules: domain.rules,
    architecture: { overview: source.roles.includes('backend') ? 'Frontend React qua REST tới NestJS; controller validate DTO, service thực thi quy tắc và transaction, SQL Server giữ ràng buộc dữ liệu. UI không quyết định quyền hoặc kết quả mutation.' : 'React với storage adapter độc lập; model/schema validation tách khỏi component, plain-text rendering và offline persistence có xử lý lỗi.', entities: domain.entities, apiSuggestions: domain.endpoints, frontendPages: domain.pages },
    roleDetails: source.roleDetails?.map(role => ({ ...role, recommendedSkills: ['Git/PR', 'Unit và integration testing'], responsibilities: role.code === 'frontend' ? ['Xây luồng UI và responsive theo tiêu chí.', 'Tích hợp API/storage, validate UX và xử lý trạng thái lỗi.'] : ['Thiết kế schema/API và transaction.', 'Enforce business rules, quyền server và kiểm thử cạnh tranh.'] })),
    sprints,
    milestones: sprints.map((sprint, index) => ({ title: sprint.name, day: (index + 1) * 7, taskKeys: sprint.tasks.map(task => task.key), acceptance: `Demo ${sprint.goal.toLowerCase()}; code và kiểm thử được review, không còn lỗi chặn các task trong mốc.` })),
    expectedOutcome: `${source.description} Các kịch bản đã mô tả chạy được từ README, có xử lý dữ liệu sai và kiểm thử, sinh viên giải thích được lựa chọn thiết kế.`,
    expectedOutputs: { ...source.expectedOutputs, artifacts: [...(source.expectedOutputs?.artifacts ?? []), 'Hướng dẫn deployment, environment example và báo cáo giới hạn'] },
  };
}
