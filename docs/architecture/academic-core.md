# Dự án mẫu và phiên thực tập

Cập nhật theo implementation ngày14/10/2026.

Thư viện có ba dự án nhỏ: quản lý công việc, cửa hàng cơ bản, ghi chú cá nhân. Mỗi mẫu có mục tiêu, phạm vi, roles/capacity, technology, sprint/task requirements/DoD, đầu ra, kịch bản và acceptance. Ngân hàng này là cấu hình học tập, không phải demo đã hoàn thành.

Tạo run snapshot template version và tạo project/session riêng. RequestId chống replay; một template có nhiều run, nhưng tasks/sprints không dùng chéo giữa các phiên.

Eligibility cần intern active, passed recruitment, role hợp slot và không có assignment active. Ghi assignment/member và kiểm tra capacity trong transaction. Start cần đội hình hợp lệ, kích hoạt phiên và yêu cầu AI draft/provision repo; draft không phải task thật cho tới Confirm.

Setup tìm ứng viên đủ điều kiện và hiển thị đội hình hiện tại riêng. Gỡ dùng filter sessionId+internId để tìm đúng active assignment, không phụ thuộc trang100đầu tiên của danh sách. Cancel xóa session membership, giữ project membership lịch sử và trả sinh viên về lifecycle chưa phân công. Backend vẫn chặn gỡ phiên template sau Start.

Danh sách/chi tiết giảng viên áp ownership tiêu chuẩn. Co-instructor được giao có scope của phiên; giảng viên khác chỉ đọc snapshot consent riêng. Class/attendance lịch sử vẫn có API nhưng không phải workflow chính project-first.

`GET /sessions/overview` phân trang sau khi tìm/lọc và sắp xếp toàn bộ phạm vi quản lý. `sortBy=startDate|endDate|name|progress`, `sortDirection=asc|desc` (mặc định startDate/desc), luôn có ID phân xử đồng hạng; DTO từ chối giá trị ngoài danh sách. Tìm kiếm gồm mã/tên phiên và dự án snapshot. `currentSprint` chỉ chọn Sprint active, không lấy planned thay thế. `alerts` gồm task chưa Done đã quá hạn UTC, task Review và phiên active/ending đã quá ngày kết thúc; bỏ task soft-delete. Hai truy vấn tổng hợp cho mỗi trang, không gọi riêng từng phiên.

Chi tiết thành viên có role dự án và trạng thái phân công active/completed của chính phiên (null nếu chỉ có roster). `GET /sessions/:id/work` dùng lại phạm vi/phân trang/bộ lọc task, sau đó hydrate một trang với blocker từ spec và lần nộp gần nhất: PR/source, immutable SHA, kết quả AI và điểm/phản hồi giảng viên độc lập. Không gọi GitHub/model, không trả lease/token/prompt, không tự duyệt bài. Session trong route luôn thay thế sessionId của query. `GET /sessions/:id/timeline` phân trang sự kiện bằng quan hệ target của phiên, không gom mọi hoạt động của cùng actor; bỏ task soft-delete và target không hợp lệ. Cả hai API yêu cầu sessions.view + tasks.view ngoài kiểm tra ownership. Người có quyền chỉ xem phiên không nhận thêm quyền đọc task/bài nộp.

Xem [mục lục](../README.md), controller/DTO tương ứng và tests trước khi thay đổi contract.
