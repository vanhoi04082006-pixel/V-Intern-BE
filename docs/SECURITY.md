# Ranh giới bảo mật

JWT xác thực identity; DB resolve role/permission mỗi request. DTO whitelist/forbidNonWhitelisted và UUID validation, query parameters thay interpolation untrusted, managed project+session scope. Permission không đồng nghĩa có quyền trên mọi bản ghi.

Refresh cookie HttpOnly, rotate family, detect replay; BCrypt password hash không serialize. OAuth state/cookie/PKCE/numeric identity và token AES256GCM theo user. Không log key/token/raw provider body. CORS exact origin, production HTTPS/TLS.

Sharing consent chỉ snapshot đọc, hết hạn/thu hồi/đổi owner kiểm tra mỗi request. Intern own-task/own-interview/own-conversation kiểm tra principal, không lấy userId client làm authority. Public question API không có rubric/expected/future prompts.

Source/PR/ref/URL/câu trả lời là untrusted. Github host HTTPS cố định, no redirect tùy ý, pathencode, immutable SHA, bounded files/body/concurrency và credential exclusion. Evidence warnings không được làm complete=true. No student code execution trên BE; runner signer ở ngoài sandbox, toàn request+suite+SHA được bind bằng hash/HMAC.

AI chỉ đề xuất; teacher và backend quyết định. Không nhận model pass/approve field hoặc student-controlled checks làm bằng chứng authoritative. Audit final rubric/manual override/SHA và các thay đổi quyền.

Public signup chỉ tạo intern trong transaction và không tự đăng nhập, không nhận role từ client. Mật khẩu kiểm tra giới hạn UTF-8 trước bcrypt, tên/email bounded, terms phải là boolean true. Có switch đóng signup và rate limit riêng; xem [đăng ký](architecture/registration.md).

Giới hạn: rate limits memory theo process, runner local WSL đã triển khai nhưng chưa nghiệm thu repo/OAuth thật; chưa có email verification/reset hoặc Google OAuth. Khi cần nhiều instance, dùng limiter/job processing chung và kiểm chứng reentry/concurrency trước rollout.
