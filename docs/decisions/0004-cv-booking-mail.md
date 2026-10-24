# ADR 0004 — CV, lịch hẹn và email có trách nhiệm riêng

## Trạng thái

Đã áp dụng cho G3, ngày 24–25/10/2026 (giờ Việt Nam). G4 tiếp tục xây cổng bắt đầu phỏng vấn trên booking.

## Bối cảnh

Ứng viên chưa có tài khoản cần nộp CV; Agent chọn nghề và lịch trong nguồn đã mở. Lịch hẹn, tài khoản và email liên quan nhưng không có cùng thời điểm hoàn tất. SMTP có thể nhận thư rồi mất kết nối trước khi trả phản hồi. Retry mù gây gửi trùng, reset mật khẩu ngầm gây mất quyền truy cập của người dùng cũ.

## Quyết định

- Tách `cv_applications`, `interview_bookings` và `mail_outbox`; ghi booking và mail trong cùng transaction SQL.
- Candidate theo dõi bằng capability riêng trong cookie HttpOnly sau xác minh email một lần. Capability không phải tài khoản sinh viên hoặc JWT staff.
- Ba Agent chỉ đọc/phân tích/đề xuất. Domain kiểm nguồn, quyền, nghề, thời gian, sức chứa và danh tính trước khi thay đổi dữ liệu.
- Email lịch gửi sớm; credential là mail riêng theo mốc. Tài khoản mới dùng mật khẩu tạm, hash trong users, payload mã hóa trong outbox, buộc đổi lần đầu. Tài khoản cũ được giữ nguyên mật khẩu/lượt.
- Sau SMTP acceptance hoặc TTL, xóa payload nhạy cảm. `uncertain` cần đối chiếu và xác nhận gửi lại; không giả lập bảo đảm “exactly once” qua SMTP.
- Parser chạy subprocess có giới hạn, lưu CV riêng ngoài public assets. Không chạy macro/JavaScript hoặc coi hướng dẫn trong CV là lệnh Agent.

## Các phương án đã cân nhắc

Gửi mail ngay trong HTTP request làm việc nộp CV phụ thuộc SMTP và dễ mất mail khi process dừng. Để Agent tự ghi DB hoặc gửi mail làm mờ ranh giới giữa đề xuất và quyền thay đổi dữ liệu. Đặt lại mật khẩu mỗi lần gửi lại khiến email cũ và người dùng hiện có bị vô hiệu không báo trước. Các phương án này không đáp ứng yêu cầu phục hồi và bảo toàn danh tính.

## Hệ quả

Cần vận hành hai worker, giữ khóa mã hóa riêng và giám sát các mail lỗi/không chắc chắn. Cần phân biệt acceptance với delivery trong UI/tài liệu. Khi credential đã được xóa, Admin không thể khôi phục mật khẩu cũ bằng preview hoặc resend; recovery phải theo luồng tài khoản có kiểm quyền. Local SMTP đủ nghiệm thu phạm vi đã duyệt, chưa chứng minh giao thư vào hộp thư bên ngoài.
