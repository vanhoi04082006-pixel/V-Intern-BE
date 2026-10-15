import type { CreateTemplateDto, TemplateTaskDto } from "./template.dto";
import { enrichLearningBlueprint, EXTRA_BLUEPRINTS } from './learning-blueprints';

const task = (
  role: string,
  title: string,
  requirements: string,
  dod: string[],
): TemplateTaskDto => ({ role, title, requirements, dod, storyPoints: 3 });

interface BlueprintInput {
  code: string;
  name: string;
  description: string;
  roles: string[];
  requirements: string[];
  scopeOut: string[];
  scenarios: string[];
  foundation: TemplateTaskDto[];
  delivery: TemplateTaskDto[];
}

function blueprint(input: BlueprintInput): CreateTemplateDto {
  const fullStack = input.roles.includes("backend");
  return {
    code: input.code,
    name: input.name,
    description: input.description,
    category: "small-projects",
    difficulty: "beginner",
    roles: input.roles,
    techStack: fullStack
      ? ["React", "TypeScript", "NestJS", "SQL Server"]
      : ["React", "TypeScript", "CSS"],
    modules: input.requirements,
    objectives: {
      business: input.description,
      learning: [
        "Làm việc theo yêu cầu và tiêu chí nghiệm thu",
        "Phối hợp Git/PR và review có bằng chứng",
        "Viết kiểm thử cho hành vi sản phẩm",
      ],
      product: [
        "Ứng dụng chạy được theo README",
        "Luồng sử dụng chính có kiểm thử và bản demo",
      ],
    },
    scopeIn: input.requirements,
    scopeOut: input.scopeOut,
    functionalRequirements: input.requirements,
    nonFunctionalRequirements: [
      "Dùng bàn phím được và hiển thị ở màn hình 375px",
      "Hiển thị lỗi khi nhập sai hoặc mất kết nối",
      "Không commit secret hoặc dữ liệu cá nhân thật",
    ],
    roleDetails: input.roles.map((code) => ({
      code,
      title: code === "frontend" ? "Frontend Developer" : "Backend Developer",
      countMin: 1,
      countMax: 1,
      level: "junior",
      requiredSkills:
        code === "frontend"
          ? ["React", "TypeScript", "CSS", "Git"]
          : ["NestJS", "SQL", "REST", "Git"],
    })),
    sprints: [
      {
        name: "Nền tảng và luồng chính",
        goal: "Thiết kế dữ liệu, giao diện và hoàn thành thao tác chính",
        durationDays: 7,
        tasks: input.foundation,
      },
      {
        name: "Hoàn thiện và bàn giao",
        goal: "Hoàn thành tích hợp, xử lý lỗi, kiểm thử và demo",
        durationDays: 7,
        tasks: input.delivery,
      },
    ],
    expectedOutputs: {
      deliverables: [
        "Source code trên repository của phiên",
        "README có lệnh cài đặt/chạy/kiểm thử",
        "Kiểm thử luồng chính",
        "Bản demo chạy được",
      ],
      artifacts: [
        "PR gắn với từng task và commit SHA",
        "Báo cáo kiểm thử và giới hạn còn lại",
      ],
    },
    acceptance: {
      definitionOfDone: [
        "Các yêu cầu trong phạm vi có thể thao tác theo kịch bản",
        "Không mất dữ liệu hợp lệ sau khi tải lại",
        "Giảng viên xác nhận bài nộp",
      ],
      qualityGates: [
        "Build, lint và kiểm thử luồng chính đạt",
        "Có kiểm tra dữ liệu đầu vào và trạng thái lỗi",
        "Không có secret trong Git",
      ],
    },
    dod: [
      "Chức năng đúng yêu cầu, không còn lỗi chặn luồng chính",
      "Code và kiểm thử nằm trong PR của task",
      "README đủ để người khác chạy và kiểm chứng",
    ],
    rubricVersion: "task-review-v1",
    scenarios: input.scenarios,
    documentation:
      "Thời lượng chuẩn 14 ngày. Bắt đầu bằng xác nhận phạm vi và hợp đồng dữ liệu, sau đó tạo kế hoạch theo vai trò. Mỗi task có PR riêng, kiểm thử và bằng chứng nghiệm thu. Chạy npm ci, cấu hình theo .env.example, chạy npm run dev; kiểm tra npm run build và npm test. Không dùng thanh toán hoặc dữ liệu khách hàng thật. Sprint cuối dành thời gian sửa lỗi tích hợp và demo lại toàn bộ kịch bản. AI gợi ý đánh giá; giảng viên xác nhận kết quả cuối.",
  };
}

export const LEGACY_LEARNING_LIBRARY: CreateTemplateDto[] = [
  blueprint({
    code: "LEARN-TASKS-V1",
    name: "Quản lý công việc nhóm nhỏ",
    description:
      "Ứng dụng cho một nhóm nhỏ tạo, cập nhật và theo dõi công việc có ưu tiên, deadline và trạng thái.",
    roles: ["frontend", "backend"],
    requirements: [
      "Danh sách công việc có phân trang",
      "Thêm/sửa công việc và kiểm tra dữ liệu",
      "Lọc trạng thái và mức ưu tiên",
      "Lưu trữ bền vững và thông báo lỗi",
    ],
    scopeOut: ["Chat realtime", "Thông báo email", "Thanh toán"],
    scenarios: [
      "Tạo task hợp lệ, tải lại trang và kiểm tra dữ liệu còn nguyên",
      "Nhập tiêu đề rỗng và deadline sai để thấy lỗi",
      "Lọc ưu tiên cao và hoàn thành một task",
    ],
    foundation: [
      task(
        "backend",
        "API và schema công việc",
        "Tạo migration tasks; API thêm/sửa/danh sách phân trang, validate tiêu đề và ngày.",
        [
          "Migration chạy trên DB trống",
          "Không lưu task rỗng",
          "API trả pagination đúng",
        ],
      ),
      task(
        "frontend",
        "Danh sách và biểu mẫu công việc",
        "Xây dựng danh sách và form tạo/sửa; kết nối API và hiển thị trạng thái loading/error.",
        [
          "Tạo và sửa thành công",
          "Lỗi dữ liệu hiện cạnh trường",
          "Dùng được bằng bàn phím",
        ],
      ),
    ],
    delivery: [
      task(
        "backend",
        "Lọc, chuyển trạng thái và kiểm thử API",
        "Bổ sung lọc trạng thái/ưu tiên, chuyển trạng thái có validation; viết test và tài liệu API.",
        [
          "Filter kết hợp chính xác",
          "Test dữ liệu sai và task không tồn tại",
          "README có lệnh migration/test",
        ],
      ),
      task(
        "frontend",
        "Bộ lọc, deadline và demo tích hợp",
        "Hiển thị bộ lọc và deadline; xử lý retry khi API lỗi, test luồng chính và hoàn thiện responsive.",
        [
          "Không mất bộ lọc khi tải dữ liệu",
          "Có thể retry sau lỗi",
          "Demo tạo/sửa/lọc/hoàn thành ở mobile và desktop",
        ],
      ),
    ],
  }),
  blueprint({
    code: "LEARN-SHOP-V1",
    name: "Cửa hàng trực tuyến cơ bản",
    description:
      "Cửa hàng mẫu có danh mục sản phẩm, giỏ hàng và đặt đơn mô phỏng để hai sinh viên FE/BE phối hợp làm sản phẩm hoàn chỉnh.",
    roles: ["frontend", "backend"],
    requirements: [
      "Danh sách và chi tiết sản phẩm",
      "Giỏ hàng và cập nhật số lượng",
      "Đặt đơn mô phỏng",
      "Tra cứu kết quả đơn hàng",
    ],
    scopeOut: [
      "Cổng thanh toán thật",
      "Tích hợp vận chuyển",
      "Khuyến mại phức tạp",
    ],
    scenarios: [
      "Thêm hai sản phẩm vào giỏ và kiểm tra tổng tiền",
      "Đặt hàng với số lượng không hợp lệ bị từ chối",
      "Đặt hàng thành công rồi xem lại chi tiết đơn",
    ],
    foundation: [
      task(
        "backend",
        "Catalog API và schema đơn hàng",
        "Thiết kế products/orders/order_items; API sản phẩm phân trang và chi tiết; thống nhất hợp đồng giỏ hàng với FE.",
        [
          "Migration up chạy được",
          "ID không tồn tại trả 404",
          "API có ví dụ request/response",
        ],
      ),
      task(
        "frontend",
        "Catalog và giỏ hàng",
        "Xây dựng danh sách/chi tiết sản phẩm; thêm/xóa/cập nhật giỏ, tính tổng để hiển thị và lưu giỏ trên trình duyệt.",
        [
          "Đổi số lượng cập nhật tổng đúng",
          "Giỏ còn sau khi reload",
          "Có empty/loading/error state",
        ],
      ),
    ],
    delivery: [
      task(
        "backend",
        "Đặt đơn có transaction và kiểm thử",
        "Tạo đơn bằng transaction, lấy giá từ database và kiểm tra số lượng; không tin tổng tiền do client gửi.",
        [
          "Giá sửa ở client không ảnh hưởng tiền đơn",
          "Lỗi rollback không lưu nửa đơn",
          "Test happy path và số lượng sai",
        ],
      ),
      task(
        "frontend",
        "Checkout và xác nhận đơn",
        "Tạo form địa chỉ/đặt đơn mô phỏng, xử lý lỗi API và chống bấm lặp khi đang gửi; viết test và demo.",
        [
          "Form chặn dữ liệu rỗng",
          "Hiển thị mã đơn và tổng tiền server",
          "Không hiển thị thành công khi API thất bại",
        ],
      ),
    ],
  }),
  blueprint({
    code: "LEARN-NOTES-V1",
    name: "Sổ tay học tập cá nhân",
    description:
      "Ứng dụng frontend giúp sinh viên ghi chú bài học, gắn nhãn, tìm kiếm và lưu dữ liệu ngay trên trình duyệt.",
    roles: ["frontend"],
    requirements: [
      "Danh sách và trình sửa ghi chú",
      "Tạo/sửa/xóa có xác nhận",
      "Tìm kiếm và lọc theo nhãn",
      "Lưu localStorage và xuất JSON",
    ],
    scopeOut: ["Đăng nhập", "Đồng bộ cloud", "Soạn thảo HTML tùy ý"],
    scenarios: [
      "Tạo ghi chú rồi reload để kiểm tra lưu trữ",
      "Hủy hộp xác nhận xóa và kiểm tra ghi chú còn",
      "Tìm kiếm không có kết quả và xuất JSON có dữ liệu",
    ],
    foundation: [
      task(
        "frontend",
        "Giao diện danh sách và trình sửa",
        "Thiết kế model ghi chú có id/title/content/tags; giao diện tạo và sửa với validation.",
        [
          "Tiêu đề trống không được lưu",
          "Sửa đúng ghi chú đang chọn",
          "Dùng được với bàn phím",
        ],
      ),
      task(
        "frontend",
        "Lưu trữ và khôi phục",
        "Lưu dữ liệu localStorage, kiểm tra schema khi đọc và xử lý dữ liệu hỏng/quota lỗi.",
        [
          "Reload khôi phục đúng dữ liệu",
          "Dữ liệu hỏng không làm trắng màn hình",
          "Lỗi lưu được thông báo",
        ],
      ),
    ],
    delivery: [
      task(
        "frontend",
        "Tìm kiếm, nhãn và xóa an toàn",
        "Lọc theo từ khóa và nhãn, xác nhận xóa, thiết kế empty state có hướng dẫn.",
        [
          "Từ khóa và nhãn kết hợp đúng",
          "Hủy xóa giữ dữ liệu",
          "Không render nội dung ghi chú như HTML",
        ],
      ),
      task(
        "frontend",
        "Xuất dữ liệu, kiểm thử và bàn giao",
        "Xuất JSON qua download, test chuỗi tạo/sửa/lọc/xóa và hoàn thiện README cùng mobile layout.",
        [
          "JSON xuất khớp dữ liệu hiện có",
          "Test luồng chính đạt",
          "README ghi giới hạn localStorage và cách chạy",
        ],
      ),
    ],
  }),
];

export const LEARNING_LIBRARY: CreateTemplateDto[] = [...LEGACY_LEARNING_LIBRARY, ...EXTRA_BLUEPRINTS].map(enrichLearningBlueprint);
