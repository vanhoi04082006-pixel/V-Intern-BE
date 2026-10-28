# Hiểu và quản lý cấu hình

File `.env.example` là danh sách biến mẫu. File `.env` chứa giá trị thật tại máy và không được commit. Cấu hình DB, secret và các tích hợp là trách nhiệm của người vận hành; giao diện không nhận raw API key hoặc token vào model.

## Các nhóm cấu hình

| Nhóm | Biến chính | Khi nào cần? |
|---|---|---|
| API | `NODE_ENV`, `PORT`, `CORS_ORIGINS`, `FRONTEND_ORIGIN` | Mọi lần chạy |
| SQL | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, TLS flags | Mọi chức năng có dữ liệu |
| Auth | `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_TTL_DAYS` | Đăng nhập và phiên người dùng |
| Signup | `AUTH_PUBLIC_REGISTRATION`, `THROTTLE_REGISTER_PER_MIN` | Mở/đóng đăng ký sinh viên |
| Gemini | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, timeout/retry | Hội thoại, chấm và gợi ý |
| Phỏng vấn | duration, max attempts, retake cooldown | Giới hạn của bài tuyển dụng |
| GitHub | client ID/secret, callback, encryption key | OAuth và thao tác repository |
| Webhook | `GITHUB_WEBHOOK_URL`, `GITHUB_WEBHOOK_SECRET` | Nhận sự kiện GitHub có chữ ký |
| Runner | URL/token/signing key và `GRADING_SUITES_JSON` | Chạy test riêng cho đúng task/spec |
| Cảnh báo | `LEARNING_ALERTS_ENABLED`, interval | Nhắc việc trong ứng dụng |
| Test SQL | `E2E_DB_NAME`, `DB_FILES_ROOT` | Chỉ kiểm thử trên DB riêng |

## Những giá trị dễ cấu hình sai

**CORS:** phải chứa origin chính xác của FE, gồm scheme và port. `localhost:3001` và `localhost:3004` là hai origin khác nhau. Không dùng wildcard với credential.

**SQL:** cổng API 8080 không phải cổng SQL. `DB_FILES_ROOT` là đường dẫn trên máy chạy SQL Server, không phải trên trình duyệt hay máy remote gọi API. Đặt trong workspace local và cấp quyền cho SQL Database Engine.

**JWT:** secret ngắn hoặc thiếu bị từ chối ngay lúc boot. Đổi JWT secret ảnh hưởng phiên đăng nhập; không đổi chỉ để sửa một lỗi giao diện.

**Phỏng vấn:** mặc định 30 phút, tối đa 3 lượt tổng cộng, chờ 24 giờ sau kết quả chưa đạt. `RECRUITMENT_MAX_ATTEMPTS` không được vượt mức 3; cấu hình thấp hơn có thể làm giới hạn chặt hơn. Điểm đậu mới phải lớn hơn 70; các biến thời gian/lượt không đổi công thức điểm.

**AI:** một model ID được lưu chưa chắc có quyền sử dụng tại provider. Admin runtime policy chỉ áp dụng cho lời gọi mới. Kết quả cũ giữ model/prompt version đã sử dụng.

**GitHub:** callback phải trùng tuyệt đối với OAuth App, bao gồm cổng. Encryption key là khóa base64 32 byte riêng, khác JWT secret. Không thay khóa mã hóa của các kết nối đang có mà không có kế hoạch đọc lại dữ liệu cũ.

**Runner:** token gọi runner và signing key xác minh kết quả là hai secret riêng. `GRADING_SUITES_JSON` phải gắn đúng template + task + spec/suite digest; khai báo một suite chung không chứng minh mọi task đã được kiểm thử.

## Quy trình đổi cấu hình

1. Xác định biến nào ảnh hưởng đến process nào.
2. Sửa tại máy, không gửi secret qua chat/log.
3. Validate và restart đúng process cần đọc lại env.
4. Kiểm tra health, đăng nhập và một thao tác của tính năng liên quan.
5. Ghi thời điểm, phần cấu hình đã thay và kết quả an toàn, không chép giá trị secret.

Nguồn: [configuration.ts](../src/config/configuration.ts), [.env.example](../.env.example), [AI runtime policy](../src/ai/ai-runtime-policy.ts).
