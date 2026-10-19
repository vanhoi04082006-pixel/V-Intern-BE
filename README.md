# V-INTERN Backend

NestJS 11, TypeScript, TypeORM 0.3 và SQL Server. API phục vụ tuyển dụng, thư viện dự án, phiên thực tập, sprint/task, GitHub, AI và các kết quả học tập. Schema chỉ thay đổi qua migrations; synchronize luôn false.

Repository mới được tạo tự động bằng tài khoản GitHub chung do Admin kết nối/chọn tại Cài đặt, rồi mời giảng viên và sinh viên đã liên kết danh tính GitHub. Không lưu mật khẩu GitHub. Repo cũ giữ nguyên chủ sở hữu/URL; xem [quyết định ownership và quy tắc tên](docs/decisions/0002-admin-repository-account.md).

## Chạy local

Yêu cầu Node.js 22+, npm, SQL Server 2019 trở lên và một database riêng. Tài khoản migration cần quyền DDL trong database; tài khoản ứng dụng production nên có quyền tối thiểu theo vận hành.

Trong PowerShell:

~~~powershell
Copy-Item .env.example .env
# Điền DB_*, JWT_SECRET, BOOTSTRAP_ADMIN_*; database phải tồn tại.
npm ci
npm run migration:run
npm run bootstrap:admin
npm run seed:library
npm run start:dev
~~~

API: http://localhost:8080/api/v1; Swagger: http://localhost:8080/api/docs; health: GET /api/v1/health. Cổng SQL mặc định 1433; máy local hiện tại dùng 1435 nên phải giữ giá trị thực của .env. Không chạy seed:dev nếu cần tài khoản trắng.

## Lệnh

| Lệnh | Mục đích |
|---|---|
| npm run build / npm start | Biên dịch / chạy dist/main.js |
| npm run lint / npm test | Lint / unit test không dùng provider thật |
| npm run test:e2e | SQL integration; bắt buộc E2E_DB_NAME là database dùng một lần |
| npm run migration:run / migration:show | Áp dụng / kiểm tra migrations |
| npm run migration:revert | Revert migration mới nhất; kiểm tra dữ liệu và down trước |
| npm run bootstrap:admin | RBAC và admin từ env; chạy lại không đổi mật khẩu tài khoản cũ |
| npm run seed:library | Sáu blueprint và185câu hỏi; seed chạy lại giữ bản đã sửa/archived và run snapshot |
| npm run seed:recruitment | Chèn thiếu câu hỏi theo role/sortOrder |
| npm run seed:dev | Demo local; có tạo dữ liệu/tài khoản, không dùng production |
| npm run audit:schema | Kiểm tra schema |

## Cấu hình

- DB_HOST/PORT/NAME/USERNAME/PASSWORD và DB_ENCRYPT/TRUST_SERVER_CERTIFICATE: kết nối SQL. Production dùng TLS và chứng chỉ tin cậy.
- JWT_SECRET: ít nhất 32 ký tự ngẫu nhiên. Access token ngắn hạn; refresh cookie HttpOnly, rotate và phát hiện reuse theo family.
- AUTH_PUBLIC_REGISTRATION=true mở đăng ký sinh viên (false/giá trị không hợp lệ đóng); THROTTLE_REGISTER_PER_MIN mặc định5/IP/phút. Signup chỉ tạo intern/not_started trong transaction, không tự login; [hợp đồng đăng ký](docs/architecture/registration.md).
- CORS_ORIGINS: allowlist chính xác FE; không dùng wildcard với credentials. Rate limits hiện lưu trong memory của từng process.
- AI_PROVIDER=gemini, AI_API_KEY, AI_MODEL, AI_TIMEOUT_MS, AI_MAX_RETRIES: provider thật. Model cần quyền generateContent và output JSON. Kiểm tra model qua API/provider trước khi đổi; alias có thể thay đổi. Khóa không rời server.
- GITHUB_CLIENT_ID/SECRET/CALLBACK_URL, GITHUB_TOKEN_ENCRYPTION_KEY, FRONTEND_ORIGIN: [hướng dẫn GitHub](docs/architecture/github-code-review.md).
- `GITHUB_WEBHOOK_URL` (HTTPS công khai) và `GITHUB_WEBHOOK_SECRET` (ít nhất 32 ký tự): nhận PR/push/CI, phát hiện code đổi sau khi nộp; không tự chấm hoặc duyệt task.
- GRADING_RUNNER_URL/TOKEN/SIGNING_KEY và GRADING_SUITES_JSON: [hợp đồng runner](docs/architecture/grading-runner.md).

Thiết lập GitHub trên Windows: chạy `./scripts/configure-github.ps1`, nhập OAuth Client ID/Secret trực tiếp trong terminal (secret được ẩn). Script chỉ ghi `.env` đã bị Git ignore và sinh encryption key nếu chưa có; không đổi key liên kết cũ. Không gửi secret trong chat. Đăng ký callback đúng URL rồi restart API và liên kết từng tài khoản trong ứng dụng.

Source dịch vụ thực thi riêng, Docker images, Notes acceptance checks, công cụ tạo cấu hình theo task và CI smoke nằm trong [grading-runner](grading-runner/README.md). Cần Linux Docker host riêng để nghiệm thu thực thi; backend vẫn từ chối đề xuất đạt khi thiếu suite đúng task/spec.

## Cấu trúc

~~~text
src/auth, users, rbac, audit       Danh tính, quyền và nhật ký
src/recruitment                   Question bank, hội thoại và chấm tuyển dụng
src/templates, sessions           Template snapshot, đội hình, lifecycle phiên
src/ai, ai-generation             Provider, provenance, draft/publish kế hoạch
src/tasks, sprints, submissions    Công việc và quyết định của giảng viên
src/github, code-review           OAuth, repo, bằng chứng SHA và AI review
src/sharing                      Đồng ý chia sẻ theo phiên, chỉ đọc
src/performance, evaluation       Hiệu suất và đánh giá chính thức
src/kpi, salary, certificates     Kết quả đã finalize, ledger và chứng nhận
src/reports                      Báo cáo snapshot, PDF/XLSX
src/database/migrations          Lịch sử schema có phiên bản
~~~

Giữ nghiệp vụ trong module của nó; dùng helper quyền chuẩn, DTO validation và truy vấn có tham số. Không gọi AI/GitHub trong transaction kéo dài. Các lease ngắn giúp retry/idempotency; DB vẫn là nguồn quyết định cuối.

## Hợp đồng quan trọng

- Giảng viên chỉ quản lý dự án/phiên được giao; quyền đọc được chia sẻ qua snapshot riêng, không cấp quyền ghi hay thay đổi ownership.
- Mười câu chính và tối đa hai câu phụ thích ứng; câu đã gửi giữ nguyên. Ngân hàng 185 câu cho năm vai trò có Fullstack. Không trả rubric/đáp án mẫu/câu tương lai cho sinh viên. Phiên lịch sử tám câu vẫn đọc theo hợp đồng cũ.
- Start phiên chỉ tạo draft; Confirm mới ghi sprint/task. Template version và task specification được snapshot.
- Planner dùng bằng chứng kỹ năng/điểm yếu, có mốc bàn giao, đầu ra, giờ ước lượng, task con và phụ thuộc đã kiểm tra vòng lặp. Task phụ thuộc chỉ bắt đầu khi tiền nhiệm đã được duyệt Done.
- Task template cần repo đúng phiên và danh tính GitHub liên kết khi nộp. Kết quả AI gắn base/head SHA, không tự xác nhận Done.
- Source, diff, câu trả lời và nội dung chat là dữ liệu không tin cậy. Không chạy code sinh viên trên host BE. GitHub checks do sinh viên tạo không phải bằng chứng test tin cậy.
- Thiếu provider/runner/repo không sinh kết quả đạt giả. Giảng viên chấm thủ công cần lý do rõ, ghi audit và kiểm tra SHA.
- Admin quản trị câu hỏi riêng tư có version, cấu hình model/timeout/retry Gemini cho lời gọi mới và xem thống kê AI/tích hợp. Credential luôn ở server; [hợp đồng quản trị](docs/architecture/admin.md).

## Tài liệu

[Mục lục](docs/README.md) · [SQL Server](docs/database/SQLSERVER2019_SETUP.md) · [Migration](docs/database/MIGRATION_POLICY.md) · [Domain](docs/architecture/domain-model.md) · [API](docs/api/ROUTES.md) · [Bảo mật](docs/SECURITY.md) · [Kiểm thử](docs/TESTING.md).

Các báo cáo phase/handoff cũ được giữ dưới docs/archive để truy vết, không thay thế tài liệu hiện hành. [Nghiệm thu16/10](docs/LIVE-GITHUB.md) đã chạy OAuth hai danh tính, repo/invite/PR, codeload/Docker/Gemini, teacher approval, webhook/redelivery và refresh token thật. Đây là fixture tổng hợp với một task đã seal. NativeSQL2019/remote backend và runner CI đã đạt; [kết quả](docs/VERIFICATION.md). Production deployment chưa chạy.

[Hội thoại và rubric](docs/architecture/recruitment-chat.md) · [Kế hoạch và ngữ cảnh Mentor](docs/architecture/learning-plans.md) · [Vận hành worker](grading-runner/README.md).
