# Tài liệu V-Intern Backend

Bộ tài liệu này đi cùng source `V-INTERN-BE`. Đọc theo lộ trình thay vì mở từng file ngẫu nhiên.

> **Trạng thái:** cập nhật 02/11/2026, theo `main` tại `ca60e16`.
> **Thay đổi gần nhất:** gỡ quản lý lớp và chia sẻ phiên; `/api/v1/classes` và `/api/v1/session-sharing` không còn.
> Bằng chứng và giới hạn: [VERIFICATION](VERIFICATION.md).

## Lộ trình đọc

```mermaid
flowchart LR
  A[Hiểu sản phẩm] --> B[Chạy local]
  B --> C[Hiểu domain]
  C --> D[Đọc API/code]
  D --> E[Sửa, kiểm thử, bàn giao]
```

| Bạn cần làm gì? | Đọc theo thứ tự |
|---|---|
| Hiểu sản phẩm | [START-HERE](START-HERE.md) → [USER-JOURNEYS](USER-JOURNEYS.md) → [WORKFLOW-MATRIX](WORKFLOW-MATRIX.md) |
| Chạy local | [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) → [CONFIGURATION](CONFIGURATION.md) → [TROUBLESHOOTING](TROUBLESHOOTING.md) |
| Sửa code | [CODE-MAP](CODE-MAP.md) → [domain-model](architecture/domain-model.md) → chương domain liên quan |
| Gọi API | [api/README](api/README.md) → [api/ROUTES](api/ROUTES.md) → [api/SCHEMAS](api/SCHEMAS.md) |
| Kiểm thử | [TESTING](TESTING.md) → [VERIFICATION](VERIFICATION.md) |
| Vận hành DB | [database/SQLSERVER2019_SETUP](database/SQLSERVER2019_SETUP.md) → [database/MIGRATION_POLICY](database/MIGRATION_POLICY.md) |
| Tiếp nhận | [HANDOVER](HANDOVER.md) → [CONTRIBUTING](CONTRIBUTING.md) → [SECURITY](SECURITY.md) |

## Tài liệu kỹ thuật

| Tài liệu | Trả lời câu hỏi |
|---|---|
| [START-HERE](START-HERE.md) | Sản phẩm giải quyết gì, ai làm gì, thuật ngữ nào dễ nhầm? |
| [LOCAL-DEVELOPMENT](LOCAL-DEVELOPMENT.md) | Cần cài gì, cấu hình nào, chạy/kiểm tra ra sao? |
| [CONFIGURATION](CONFIGURATION.md) | Biến môi trường nào thuộc nhóm nào, dễ sai ở đâu? |
| [CODE-MAP](CODE-MAP.md) | Một request đi qua đâu, module nào chịu trách nhiệm? |
| [api/README](api/README.md) | Gọi API, auth, pagination, lỗi, idempotency |
| [api/ROUTES](api/ROUTES.md) | 302 operation trong 48 nhóm |
| [api/SCHEMAS](api/SCHEMAS.md) | Field DTO theo OpenAPI |
| [SECURITY](SECURITY.md) | Ranh giới tin cậy, auth, permission, secret, runner |
| [TESTING](TESTING.md) | Chọn unit/SQL E2E/provider/runner; gate CI |
| [TROUBLESHOOTING](TROUBLESHOOTING.md) | Chẩn đoán theo triệu chứng |
| [DEPENDENCIES](DEPENDENCIES.md) | Dependency, audit và finding đã biết |
| [CONTRIBUTING](CONTRIBUTING.md) | Nhánh, commit, PR, quality gate |
| [HANDOVER](HANDOVER.md) | Checklist tiếp nhận và giới hạn |
| [VERIFICATION](VERIFICATION.md) | Bằng chứng hiện hành, lịch sử và phần chưa kiểm |
| [DEMO](DEMO.md) | Kịch bản demo backend/full-stack |

## Kiến trúc theo domain

| Nhóm | Tài liệu |
|---|---|
| Nền tảng | [domain-model](architecture/domain-model.md) · [registration](architecture/registration.md) · [admin](architecture/admin.md) |
| Tuyển dụng | [recruitment-chat](architecture/recruitment-chat.md) |
| Dự án & phiên | [project-blueprints](architecture/project-blueprints.md) · [academic-core](architecture/academic-core.md) · [learning-plans](architecture/learning-plans.md) |
| Công việc | [sprint-task-core](architecture/sprint-task-core.md) · [github-code-review](architecture/github-code-review.md) · [grading-runner](architecture/grading-runner.md) |
| AI | [ai-mentor](architecture/ai-mentor.md) · [ai-evaluation-assistance](architecture/ai-evaluation-assistance.md) · [ai-recommendations](architecture/ai-recommendations.md) |
| Kết quả | [evaluation-performance-kpi](architecture/evaluation-performance-kpi.md) · [student-performance](architecture/student-performance.md) · [virtual-salary](architecture/virtual-salary.md) · [certificates](architecture/certificates.md) · [reports](architecture/reports.md) |
| Vận hành | [notifications](architecture/notifications.md) |

## Database

| Tài liệu | Nội dung |
|---|---|
| [SQLSERVER2019_SETUP](database/SQLSERVER2019_SETUP.md) | Tạo DB/login, đường dẫn MDF/LDF, quyền |
| [MIGRATION_POLICY](database/MIGRATION_POLICY.md) | Nguyên tắc migration, rollback, dữ liệu lịch sử |

## Quyết định kiến trúc (ADR)

| ADR | Nội dung |
|---|---|
| [0001-ai-github-authority](decisions/0001-ai-github-authority.md) | Tách AI, evidence và quyết định chính thức |
| [0002-admin-repository-account](decisions/0002-admin-repository-account.md) | Admin cung cấp tài khoản tạo repo chung |
| [0003-recruitment-score-bands](decisions/0003-recruitment-score-bands.md) | Ba mức điểm và đề xuất vai trò |
| [0004-cv-booking-mail](decisions/0004-cv-booking-mail.md) | CV, lịch hẹn và email |
| [0005-agent-runtime-sdk](decisions/0005-agent-runtime-sdk.md) | LangGraph + checkpoint SQL Server |

## Nghiệp vụ và vận hành

[USER-JOURNEYS](USER-JOURNEYS.md) · [WORKFLOW-MATRIX](WORKFLOW-MATRIX.md) · [CV-AND-INTERVIEW-SCHEDULING](CV-AND-INTERVIEW-SCHEDULING.md) · [SCHEDULED-INTERVIEWS](SCHEDULED-INTERVIEWS.md) · [TEMPORARY-CREDENTIAL-RECOVERY](TEMPORARY-CREDENTIAL-RECOVERY.md) · [KNOWLEDGE-LIBRARY](KNOWLEDGE-LIBRARY.md) · [KNOWLEDGE-RETRIEVAL](KNOWLEDGE-RETRIEVAL.md) · [AGENT-RUNTIME](AGENT-RUNTIME.md) · [AGENTS-AND-MINI-PROJECTS](AGENTS-AND-MINI-PROJECTS.md) · [SMALL-PROJECT-LIBRARY](SMALL-PROJECT-LIBRARY.md) · [MINI-PROJECT-CONTENT](MINI-PROJECT-CONTENT.md) · [PARTICIPATION](PARTICIPATION.md) · [REPLACEMENT](REPLACEMENT.md) · [GITHUB-INVITATIONS](GITHUB-INVITATIONS.md) · [REPOSITORY-ACCESS-RECOVERY](REPOSITORY-ACCESS-RECOVERY.md)

## Lịch sử và bằng chứng

- [`reports/`](reports/) — báo cáo G1–G7, JSON, ảnh; mỗi báo cáo gắn ngày/commit riêng.
- [`archive/`](archive/) — tài liệu trước đây, có thể mô tả chính sách cũ.
- Các file `*2026102x.md` ở thư mục gốc docs là **bản chụp lịch sử**; không dùng thay hướng dẫn hiện hành.

## Quy ước viết tài liệu

1. **Tiếng Việt**, giải thích khái niệm trước khi dùng thuật ngữ.
2. **Liên kết tương đối**; không dùng đường dẫn tuyệt đối trên máy cá nhân.
3. **Không secret/PII** trong tài liệu, ảnh, log.
4. **Ghi rõ phạm vi** đã kiểm: route, suite, commit, DB, phần còn thiếu.
5. **Không trộn số liệu** giữa các lần chạy/nhánh.
6. Khi DTO/API đổi, cập nhật `api/`, parser FE và test trong cùng PR.
