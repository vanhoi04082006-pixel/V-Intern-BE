# Hiệu suất và hồ sơ sinh viên

`GET /performance/interns` trả `items,total,page,pageSize,ranking`. Mặc định 10; tối đa 100. Backend tìm theo tên/email và lọc project/session/date trước phân trang. SQL xác định tập assignment thuộc quyền giảng viên, tổng hợp task và đánh giá để xếp hạng; chỉ trang được chọn mới tải facts tính metrics theo batch. Frontend không tải cả danh sách để tự cắt Top10. Các callers nội bộ như báo cáo dùng read model đầy đủ trong scope đã cấp quyền, không phụ thuộc trang giao diện.

Thứ tự: tỷ lệ task Done giảm dần, trung bình evaluation finalized giảm dần, số task đang trễ tăng dần, số task giảm dần, UUID ổn định. Chưa có task xếp sau tỷ lệ đã đo; chưa chấm giữ null. Đây là thứ tự theo các chỉ số công khai, không phải điểm tổng AI tự suy ra. Người dùng tìm được sinh viên ngoài Top10; pagination và CSV ghi rõ phạm vi trang hiện tại. Bộ chọn tạo evaluation có tìm kiếm/phân trang để không mất sinh viên sau thay đổi contract.

`GET /performance/interns/:id/detail` yêu cầu performance.view và cùng ownership boundary với metrics. Trả profile public, kết quả phỏng vấn đã sanitize, 20 phân công gần nhất trong scope, task page (10 mặc định), bài nộp mới nhất/commit và điểm/nhận xét AI, giảng viên. Không trả mật khẩu, rubric câu hỏi hoặc token. Từng truy vấn task và assignment cũng kiểm tra quyền; admin/sinh viên thường không được dùng quyền của giảng viên khác.

Trend sáu tháng UTC dùng task.createdAt và lần chuyển Done đầu tiên từ lịch sử append-only; mở lại và hoàn thành lại không tăng số lần hoàn thành lịch sử. Bộ lọc ngày chọn tập task theo createdAt, khoảng `[from,to)`; chart nói rõ định nghĩa, hiện số thực tế và dữ liệu bằng 0 khi không có sự kiện. Điểm thiếu không đổi thành 0. Chart không khẳng định mức cải thiện năng lực chỉ từ số task.

Kiểm chứng SQL HTTP: evaluation-performance E2E 15/15 kiểm tra tính điểm/metrics, trang/search/rank, quyền giảng viên, profile/task detail, history và pagination. Frontend test kiểm tra search ngoài trang đầu, selection ổn định và trend có định nghĩa. Lint/typecheck/build kiểm tra các caller sau thay đổi API.
