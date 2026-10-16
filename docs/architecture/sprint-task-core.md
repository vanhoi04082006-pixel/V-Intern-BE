# Sprint, task và bài nộp

Cập nhật theo implementation ngày14/10/2026.

Sprint gắn project/session và có hạn/status. Task có assignee, priority, deadline, story points, progress, optimistic version và spec. Board/list query có phạm vi/phân trang; own task không nhận internId từ client làm authority.

Danh sách task trả thêm `sprint: {id,code,name,status}` và `repository: {status,fullName}|null` theo phiên của Sprint. Metadata được đọc bằng một truy vấn cho trang task đã qua kiểm tra quyền, không gọi GitHub cho từng thẻ và không trả token hay lease. Kanban sinh viên hiển thị tên Sprint, phần trăm tiến độ và trạng thái repository `provisioning/ready/failed`; thiếu repository được hiển thị rõ, không suy diễn là sẵn sàng.

Sinh viên bắt đầu To do → Doing. Template task chuyển Review bằng nộp code hợp lệ; chuyển Done bằng quyết định giảng viên trên submission. Generic task update không bypass review/approval.

Submission bất biến theo lần nộp, có thể withdraw khi pending rồi tạo lần mới. Snapshot repo/base/head/ref và người nộp được lưu. Thay đổi branch/PR base/head sau nộp bị phát hiện trước khi xác nhận; không auto merge.

Rubric giảng viên gồm chức năng, chất lượng, test, xử lý lỗi, bảo mật, DoD. Backend tính điểm và lưu approved/rework cùng version/history/audit. AI chưa đủ bằng chứng thì approve cần explicit manual override reason; running không được override. Legacy task/bài nộp không có SHA giữ human review, không sinh AI evidence giả.

Xem [mục lục](../README.md), controller/DTO tương ứng và tests trước khi thay đổi contract.
