/** Local-only seed of rich Project Templates (M2 Project-first workflow).
 * Uses audited APIs as admin, skips existing codes (idempotent).
 * Guarded to VIntern_Dev development only, like seed-project-library.cjs.
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
const TEMPLATES = [
  {
    code: 'TPL-ECOM-01',
    name: 'Website thương mại điện tử',
    description: 'Xây dựng website thương mại điện tử hoàn chỉnh: trang khách hàng, giỏ hàng, thanh toán, quản trị và vận hành.',
    difficulty: 'intermediate',
    category: 'web',
    techStack: ['React', 'NestJS', 'SQL Server'],
    roles: ['frontend', 'backend'],
    roleDetails: [
      { code: 'frontend', title: 'Frontend Developer', countMin: 1, countMax: 1, requiredSkills: ['HTML/CSS', 'React', 'REST API', 'Git'], recommendedSkills: ['Testing', 'Performance'] },
      { code: 'backend', title: 'Backend Developer', countMin: 1, countMax: 1, requiredSkills: ['Node/NestJS', 'SQL', 'REST', 'Authentication'], recommendedSkills: ['Caching', 'Docker'] },
    ],
    modules: ['Authentication', 'Product catalog', 'Search/filter', 'Cart', 'Checkout', 'Orders', 'Admin management'],
    objectives: {
      business: 'Vận hành cửa hàng trực tuyến với đầy đủ luồng mua hàng và quản trị.',
      learning: ['Thiết kế kiến trúc full-stack', 'Làm việc nhóm theo sprint', 'Viết tài liệu và kiểm thử'],
      product: ['Website bán hàng hoạt động', 'Khu vực quản trị', 'Sẵn sàng demo'],
    },
    scopeIn: ['Web responsive', 'Thanh toán trừu tượng (không cần cổng thật)'],
    scopeOut: ['Mobile app', 'Tích hợp vận chuyển thật'],
    functionalRequirements: ['Authentication', 'Product catalog', 'Search/filter', 'Cart', 'Checkout', 'Order management', 'Admin management', 'User profile'],
    nonFunctionalRequirements: ['Danh sách p95 dưới 300ms', 'Mọi API có tài liệu', 'Không lộ secret'],
    sprints: [
      {
        name: 'Foundation', goal: 'Setup, kiến trúc, database và authentication', durationDays: 14,
        tasks: [
          { title: 'Thiết lập repository và kiến trúc', requirements: 'Monorepo FE/BE, CI chạy lint/test, README kiến trúc', dod: ['CI xanh', 'README hợp lệ'], role: 'backend', storyPoints: 5 },
          { title: 'Thiết kế database', requirements: 'Schema users/products/orders, migration chạy được', dod: ['Migration up/down sạch'], role: 'backend', storyPoints: 5 },
          { title: 'Authentication UI + API', requirements: 'Đăng nhập/đăng ký, refresh token, phân quyền cơ bản', dod: ['Login/logout hoạt động'], role: 'frontend', storyPoints: 5 },
        ],
      },
      {
        name: 'Core Commerce', goal: 'Catalog, tìm kiếm và giỏ hàng', durationDays: 14,
        tasks: [
          { title: 'Product catalog API', requirements: 'CRUD sản phẩm, phân trang, lọc theo danh mục', dod: ['API có tài liệu'], role: 'backend', storyPoints: 8 },
          { title: 'Catalog + Search UI', requirements: 'Danh sách, tìm kiếm, lọc, phân trang phía server', dod: ['Không fetch-all'], role: 'frontend', storyPoints: 8 },
          { title: 'Cart', requirements: 'Thêm/sửa/xóa giỏ hàng, tồn tại qua phiên', dod: ['Giỏ hàng đúng số lượng'], role: 'frontend', storyPoints: 5 },
        ],
      },
      {
        name: 'Transaction', goal: 'Checkout và orders', durationDays: 14,
        tasks: [
          { title: 'Checkout + Orders API', requirements: 'Tạo đơn từ giỏ, trừ tồn, lịch sử đơn', dod: ['Đơn đúng tiền'], role: 'backend', storyPoints: 8 },
          { title: 'Checkout UI', requirements: 'Form địa chỉ, xác nhận, trang cảm ơn', dod: ['Luồng mua hoàn tất'], role: 'frontend', storyPoints: 5 },
        ],
      },
      {
        name: 'Administration', goal: 'Quản trị sản phẩm/đơn/người dùng', durationDays: 7,
        tasks: [
          { title: 'Admin management', requirements: 'CRUD sản phẩm, quản lý đơn và người dùng cho admin', dod: ['Phân quyền đúng'], role: 'backend', storyPoints: 5 },
        ],
      },
      {
        name: 'Quality', goal: 'Testing, security, docs', durationDays: 7,
        tasks: [
          { title: 'Tests + docs', requirements: 'Unit/integration cho luồng chính, API docs, README', dod: ['Tests xanh'], role: 'backend', storyPoints: 5 },
        ],
      },
      {
        name: 'Release', goal: 'Tích hợp cuối và demo', durationDays: 7,
        tasks: [
          { title: 'Final integration + demo', requirements: 'Sửa lỗi tồn, chạy demo end-to-end', dod: ['Demo thành công'], role: 'frontend', storyPoints: 3 },
        ],
      },
    ],
    dod: ['Chức năng chính hoạt động', 'Không còn blocker defect', 'API documented', 'Migrations chạy được', 'Tests đạt yêu cầu', 'Demo thành công'],
    rubricVersion: 'task-review-v1',
    documentation: 'README kiến trúc, API documentation, hướng dẫn chạy demo. '.repeat(5),
    expectedOutputs: { deliverables: ['Frontend application', 'Backend API', 'SQL database', 'Admin area', 'Tests', 'API documentation', 'README', 'Demo-ready product'], artifacts: ['Demo video'] },
    acceptance: { definitionOfDone: ['Chức năng chính hoạt động', 'Không còn blocker defect', 'Demo thành công'], qualityGates: ['Tests xanh', 'Không secret trong code'] },
  },
];
async function seed() {
  const login = await api('/auth/login', null, 'POST', { email: env.BOOTSTRAP_ADMIN_EMAIL, password: env.BOOTSTRAP_ADMIN_PASSWORD });
  const token = login.accessToken;
  const existing = await api('/project-templates?page=1&pageSize=100', token);
  const known = new Set(existing.data.map((t) => t.code));
  let created = 0;
  for (const def of TEMPLATES) {
    if (known.has(def.code)) continue;
    await api('/project-templates', token, 'POST', def);
    created += 1;
  }
  console.log(JSON.stringify({ templates: TEMPLATES.length, created }));
}
seed().catch((e) => { console.error(e.message); process.exitCode = 1; });
