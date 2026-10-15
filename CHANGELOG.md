# Changelog

## Unreleased — 15/10/2026

- Phỏng vấn có tối đa hai câu phụ thích ứng, lưu bền vững, chống gửi trùng và phục hồi lượt sau reload. Evaluator v3 lưu sáu chiều kỹ năng; giữ công thức điểm và kết quả lịch sử.
- Ngân hàng 185 câu cho năm vai trò, thêm Fullstack và metadata riêng; seed chèn thiếu, backfill giữ rubric đã chỉnh.
- Dashboard chờ dự án có điểm, kỹ năng và lịch sử thật. Thẻ ứng viên có điểm tiếng Anh, điểm mạnh/yếu và chi tiết dễ đọc.
- Planner v2 dùng điểm yếu/kỹ năng, có milestone, đầu ra, ước lượng, task con và phụ thuộc. Giảng viên chỉnh/chuyển task trước publish; backend chặn vòng lặp và công việc chưa đủ tiền nhiệm, gửi thông báo publish đúng một lần.
- Mentor v3 nhận điểm yếu và source đã xác minh của task được chọn, có giới hạn và trạng thái thiếu dữ liệu rõ ràng.
- Worker riêng có container app/tester cách ly, image pin, kiểm tra chữ ký/scope/replay và cleanup khi service khởi động/dừng. Docker thật và BE HTTP/HMAC đã kiểm tra fixture đạt/lỗi; catalog bài nộp thật chưa kích hoạt.
- Migration 25–26 bổ sung follow-up và metadata, không reset dữ liệu runtime.

## 14/10/2026

- Hội thoại tuần tự 10 câu, timer/thứ tự/câu trả lời bất biến và rubric theo câu đã thực sự hỏi.
- Ba blueprint dự án, tạo phiên theo snapshot, phân công kiểm tra eligibility/capacity và AI draft/publish.
- Chia sẻ snapshot phiên theo consent, expiry/revoke, không cấp quyền ghi.
- GitHub OAuth theo người dùng; repo public từng phiên, lời mời theo numeric ID, evidence theo SHA và giảng viên duyệt cuối.
- Kanban, báo cáo, KPI, lương ảo và chứng nhận; shell responsive thống nhất, loại quick settings/search giả.
- Viết lại README/tài liệu và chuyển báo cáo cũ vào archive.

OAuth App, tài khoản liên kết và repo/PR thật vẫn cần được cấu hình để nghiệm thu GitHub bên ngoài. Không xem test transport/fixture là bằng chứng đã chạy với bài sinh viên thật.
