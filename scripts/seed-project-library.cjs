/** Local-only seed of the shared Project Library (13 reusable sample projects).
 * Uses audited APIs as admin, skips existing codes (idempotent), never
 * fabricates members, assignments, or history. Mentor stays NULL so every
 * instructor sees the library; managing one requires claiming it.
 */
const fs = require('node:fs');
const path = require('node:path');
const env = { ...require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env'))), ...process.env };
if (env.NODE_ENV !== 'development' || env.DB_NAME !== 'VIntern_Dev') throw Error('Only VIntern_Dev development is allowed.');
const base = 'http://localhost:8080/api/v1';
async function api(route, token, method = 'GET', body) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await r.json();
  if (!r.ok) throw Error(`${method} ${route}: ${r.status} ${JSON.stringify(value.message ?? value)}`);
  return value;
}
const PROJECTS = [
  { code: 'LIB-ECOM-01', name: 'Thương mại điện tử', domain: 'Web', tech: ['React', 'Node.js'], difficulty: 'intermediate', slots: [['frontend', 1], ['backend', 1]], desc: 'Nền tảng thương mại điện tử: danh mục, giỏ hàng, thanh toán, quản trị đơn hàng.' },
  { code: 'LIB-HRM-02', name: 'Quản lý nhân sự', domain: 'Business', tech: ['React', 'PostgreSQL'], difficulty: 'intermediate', slots: [['frontend', 1], ['backend', 1]], desc: 'Hồ sơ nhân sự, chấm công, nghỉ phép và báo cáo nhân sự.' },
  { code: 'LIB-LMS-03', name: 'Learning Management System', domain: 'Education', tech: ['Next.js', 'PostgreSQL'], difficulty: 'advanced', slots: [['frontend', 2], ['backend', 2], ['qa', 1]], desc: 'Khóa học, bài giảng, quiz, chấm điểm và theo dõi tiến độ học tập.' },
  { code: 'LIB-BOOK-04', name: 'Booking System', domain: 'Web', tech: ['React', 'Node.js'], difficulty: 'beginner', slots: [['frontend', 1], ['backend', 1]], desc: 'Đặt lịch, quản lý khung giờ, nhắc lịch và thanh toán đặt cọc.' },
  { code: 'LIB-WMS-05', name: 'Quản lý kho', domain: 'Logistics', tech: ['Vue', 'Laravel'], difficulty: 'intermediate', slots: [['frontend', 1], ['backend', 1], ['qa', 1]], desc: 'Nhập xuất tồn, mã vạch, kiểm kê và cảnh báo tồn kho.' },
  { code: 'LIB-SOCIAL-06', name: 'Social Network', domain: 'Social', tech: ['React', 'FastAPI'], difficulty: 'advanced', slots: [['frontend', 2], ['backend', 2], ['qa', 1]], desc: 'Bảng tin, kết bạn, nhắn tin, thông báo realtime và kiểm duyệt nội dung.' },
  { code: 'LIB-CRM-07', name: 'CRM', domain: 'Business', tech: ['Vue', 'Laravel'], difficulty: 'intermediate', slots: [['frontend', 1], ['backend', 1]], desc: 'Quản lý khách hàng, cơ hội bán hàng, pipeline và báo cáo doanh số.' },
  { code: 'LIB-PM-08', name: 'Project Management', domain: 'Business', tech: ['React', 'Node.js'], difficulty: 'intermediate', slots: [['frontend', 1], ['backend', 1], ['uiux', 1]], desc: 'Dự án, sprint, kanban, phân công và báo cáo tiến độ nhóm.' },
  { code: 'LIB-COURSE-09', name: 'Online Course', domain: 'Education', tech: ['Next.js', 'FastAPI'], difficulty: 'beginner', slots: [['frontend', 1], ['backend', 1]], desc: 'Học trực tuyến: video bài giảng, bài tập, chứng nhận hoàn thành.' },
  { code: 'LIB-HEALTH-10', name: 'Healthcare Management', domain: 'Healthcare', tech: ['React Native', 'Node.js'], difficulty: 'advanced', slots: [['frontend', 1], ['backend', 2], ['qa', 1]], desc: 'Đặt khám, hồ sơ bệnh án, đơn thuốc và lịch tái khám.' },
  { code: 'LIB-EVENT-11', name: 'Event Management', domain: 'Web', tech: ['React', 'Firebase'], difficulty: 'beginner', slots: [['frontend', 1], ['backend', 1]], desc: 'Tạo sự kiện, bán vé, check-in QR và thống kê người tham dự.' },
  { code: 'LIB-RECRUIT-12', name: 'Recruitment Platform', domain: 'Business', tech: ['React', 'Python'], difficulty: 'intermediate', slots: [['frontend', 1], ['backend', 1], ['qa', 1]], desc: 'Đăng tin tuyển dụng, quản lý ứng viên, lịch phỏng vấn và đánh giá.' },
  { code: 'LIB-HELPDESK-13', name: 'Helpdesk System', domain: 'Business', tech: ['Vue', 'Node.js'], difficulty: 'beginner', slots: [['frontend', 1], ['backend', 1]], desc: 'Ticket hỗ trợ, phân loại ưu tiên, SLA và đánh giá hài lòng.' },
];
async function seed() {
  const login = await api('/auth/login', null, 'POST', { email: env.BOOTSTRAP_ADMIN_EMAIL, password: env.BOOTSTRAP_ADMIN_PASSWORD });
  const token = login.accessToken;
  const existing = await api('/projects?page=1&pageSize=100', token);
  const known = new Set(existing.data.map((p) => p.code));
  let created = 0;
  for (const def of PROJECTS) {
    if (known.has(def.code)) continue;
    const project = await api('/projects', token, 'POST', {
      code: def.code, name: def.name, description: `${def.name} — ${def.desc}`, domainCategory: def.domain,
      technologies: def.tech, difficulty: def.difficulty, status: 'active',
    });
    await api(`/projects/${project.id}/slots`, token, 'PUT', {
      slots: def.slots.map(([roleCode, requiredCount]) => ({ roleCode, requiredCount })),
    });
    created += 1;
  }
  console.log(JSON.stringify({ projects: PROJECTS.length, created }));
}
seed().catch((e) => { console.error(e.message); process.exitCode = 1; });
