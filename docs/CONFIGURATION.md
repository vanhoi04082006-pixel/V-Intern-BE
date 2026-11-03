# Cấu hình

`.env.example` là danh sách biến mẫu; `.env` chứa giá trị thật tại máy và **không được commit**. Cấu hình DB, secret và tích hợp là trách nhiệm của người vận hành.

## 1. Nhóm cấu hình

| Nhóm | Biến chính | Khi nào cần? |
|---|---|---|
| API | `NODE_ENV`, `PORT` | Mọi lần chạy |
| CORS | `CORS_ORIGINS`, `FRONTEND_ORIGIN`, `PUBLIC_WEB_ORIGIN` | FE/browser và link công khai |
| SQL | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | Mọi chức năng có dữ liệu |
| File DB | `DB_FILES_ROOT` | Tạo DB mới trên SQL Server local |
| Auth | `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_TTL_DAYS` | Đăng nhập/phiên |
| Đăng ký | `AUTH_PUBLIC_REGISTRATION`, `THROTTLE_REGISTER_PER_MIN` | Mở/đóng đăng ký sinh viên |
| Rate limit | `THROTTLE_*` | Bảo vệ endpoint |
| Tuyển dụng | `RECRUITMENT_INTERVIEW_DURATION_MINUTES`, `RECRUITMENT_MAX_ATTEMPTS`, `RECRUITMENT_RETAKE_COOLDOWN_HOURS` | Bài phỏng vấn |
| AI | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES` | Hội thoại, chấm, gợi ý |
| Trace | `LANGSMITH_*`, `AGENT_LANGSMITH_ENABLED` | Trace allowlist của agent |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `GITHUB_TOKEN_ENCRYPTION_KEY` | OAuth/repo |
| Webhook | `GITHUB_WEBHOOK_URL`, `GITHUB_WEBHOOK_SECRET` | Nhận sự kiện GitHub có chữ ký |
| Runner | `GRADING_RUNNER_URL`, `GRADING_RUNNER_TOKEN`, `GRADING_RUNNER_SIGNING_KEY`, `GRADING_SUITES_JSON` | Chấm code |
| Cảnh báo | `LEARNING_ALERTS_ENABLED`, `LEARNING_ALERTS_INTERVAL_SECONDS` | Nhắc việc trong ứng dụng |
| Mail | `MAIL_*`, `SMTP_*`, `CV_STORAGE_DIR` | Email/CV/lịch hẹn |
| Worker | `APPLICATION_WORKER_ENABLED`, `MAIL_WORKER_ENABLED` | Tác vụ nền |
| Bootstrap | `BOOTSTRAP_ADMIN_*` | Tạo admin đầu tiên |
| Test | `E2E_DB_NAME` | Chỉ kiểm thử trên DB riêng |

## 2. Cấu hình tối thiểu để chạy

```dotenv
NODE_ENV=development
PORT=8080

DB_HOST=localhost
DB_PORT=1435
DB_NAME=VIntern_YourDatabase
DB_USERNAME=your_login
DB_PASSWORD=your_password

JWT_SECRET=<chuỗi-ngẫu-nhiên-đủ-mạnh>
CORS_ORIGINS=http://localhost:3001
FRONTEND_ORIGIN=http://localhost:3001
```

Không dùng giá trị mẫu/`changeme` cho JWT hoặc mật khẩu. Thiếu cấu hình AI/GitHub/runner chỉ làm tính năng tương ứng chưa khả dụng; **không điền secret giả** để health trông tốt.

## 3. Những giá trị dễ sai

### CORS

- Phải chứa **origin chính xác** của FE, gồm scheme và port.
- `http://localhost:3001` và `http://localhost:3004` là hai origin khác nhau.
- Không dùng wildcard với credentials.
- `FRONTEND_ORIGIN` dùng cho redirect/link; `CORS_ORIGINS` dùng cho allowlist.

### SQL

- Cổng API 8080 **không phải** cổng SQL.
- `DB_FILES_ROOT` là đường dẫn trên máy chạy SQL Server, không phải trên trình duyệt/API remote.
- Đặt file DB trong workspace local và cấp quyền cho SQL Database Engine.
- `.env` và launcher có thể trỏ hai DB khác nhau; kiểm tra process thực tế.

### JWT và mã hóa

- `JWT_SECRET` ngắn/thiếu bị từ chối lúc boot.
- Đổi JWT secret làm invalid phiên hiện có; không đổi chỉ để sửa lỗi UI.
- `GITHUB_TOKEN_ENCRYPTION_KEY` là khóa base64 32 byte **riêng**, khác JWT secret.
- `MAIL_ENCRYPTION_KEY` cũng là khóa riêng; đổi khóa phải có kế hoạch đọc dữ liệu cũ.

### Tuyển dụng

- Mặc định 30 phút, tối đa 3 lượt tổng cộng, chờ 24 giờ sau kết quả chưa đạt.
- `RECRUITMENT_MAX_ATTEMPTS` không vượt 3.
- Điểm đậu mới phải lớn hơn 70; biến thời gian/lượt không đổi công thức điểm.

### AI

- Một model ID được lưu chưa chắc provider cho phép dùng.
- Admin runtime policy chỉ áp dụng cho lời gọi mới.
- Kết quả cũ giữ model/prompt version đã dùng.
- `AI_TIMEOUT_MS`/`AI_MAX_RETRIES` là giới hạn hữu hạn; không retry vô hạn.

### GitHub

- Callback phải trùng tuyệt đối OAuth App, gồm cổng.
- Admin cần `read:user public_repo`; giảng viên/sinh viên chỉ `read:user`.
- Webhook secret khác OAuth secret.
- Không thay encryption key của kết nối đang có mà không có kế hoạch migrate.

### Runner

- `GRADING_RUNNER_TOKEN` (gọi runner) và `GRADING_RUNNER_SIGNING_KEY` (xác minh kết quả) là hai secret riêng.
- `GRADING_SUITES_JSON` phải gắn đúng template + task + spec/suite digest.
- Một suite chung không chứng minh mọi task đã được kiểm thử.

### Mail/CV

- `SMTP_DEV_ALLOW_PLAIN` chỉ dùng local; không bật ở môi trường chia sẻ.
- `CV_STORAGE_DIR` phải nằm trong workspace và có quyền đọc/ghi phù hợp.
- Worker mail/application có thể tắt độc lập; kiểm tra trạng thái trước khi kết luận email đã gửi.

## 4. Thứ tự ưu tiên

1. Biến môi trường của process (launcher/CI) thường thắng file `.env`.
2. `.env` được load khi process khởi động.
3. Giá trị default trong `src/config/configuration.ts`.

Không sửa default trong code để “chữa” một máy; sửa cấu hình đúng tầng.

## 5. Quy trình đổi cấu hình

1. Xác định biến ảnh hưởng process nào (API, worker, runner, FE).
2. Sửa tại máy; không gửi secret qua chat/log.
3. Validate và restart đúng process cần đọc lại env.
4. Kiểm tra health, đăng nhập và một thao tác của tính năng liên quan.
5. Ghi thời điểm, phần đã đổi và kết quả an toàn — **không chép giá trị secret**.

## 6. Cấu hình test/QA

- E2E dùng `E2E_DB_NAME` riêng; không trỏ vào DB chính.
- CI tạo credential ngẫu nhiên, mask và xóa cùng container.
- QA frontend 3004/API 8081 dùng callback, `FRONTEND_ORIGIN` và verify URL riêng.
- Sai callback/origin có thể đưa người dùng sang môi trường khác sau OAuth.

Nguồn: [`src/config/configuration.ts`](../src/config/configuration.ts), [`.env.example`](../.env.example), [AI runtime policy](../src/ai/ai-runtime-policy.ts).
