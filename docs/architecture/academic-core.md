# Phiên thực tập, đội hình và phân công

## Phân biệt project, session và assignment

Project giữ ngữ cảnh sản phẩm. Session giữ kỳ thực tập, người phụ trách, thời gian và roster. Assignment gắn một sinh viên với vị trí cụ thể trong ngữ cảnh đó. Một hàng roster không tự thay thế một assignment hợp lệ.

## Chuẩn bị một phiên

1. Tạo run từ template và kiểm tra snapshot.
2. Chọn lead/co-instructor đúng người phụ trách.
3. Tìm ứng viên đủ điều kiện, phân công vào role còn capacity.
4. Kiểm tra đội hình trước Start.
5. Start phiên, duyệt draft và publish kế hoạch.

| Điều kiện nhận sinh viên | Vì sao cần? |
|---|---|
| User intern đang active | Không giao việc cho tài khoản bị khóa |
| Recruitment đã passed | Giữ điều kiện tuyển dụng |
| Role phù hợp slot | Không âm thầm đổi hướng đã chọn |
| Không có assignment active khác | Tránh hai phân công đang hoạt động mâu thuẫn |
| Đủ capacity và thuộc quyền quản lý | Không vượt đội hình hoặc vượt scope |

BE khóa/ghi các quan hệ cần thiết trong transaction. Hai giảng viên cùng thao tác không được tạo hai assignment active cho một sinh viên.

## Gỡ và kết thúc phân công

Trước khi Start, gỡ theo đúng `sessionId + internId`, không chỉ dựa trên một trang đầu của danh sách. Cancel giữ lịch sử cần thiết; không xóa project membership đã dùng làm căn cứ. Với phiên template đã Start, backend chặn gỡ theo policy thay vì để UI âm thầm mất người đang làm task.

Khi không còn assignment active, workspace có thể trở về unassigned. Có lịch sử assignment thì sinh viên vẫn được đọc kết quả của chính mình; điều đó không mở lại task/Mentor như một phiên đang chạy.

## Giảng viên nhìn thấy những gì?

List/detail áp scope managed project/session. Co-instructor được giao có scope của phiên; giảng viên ngoài scope phải dùng consent snapshot riêng. Permission chung không bỏ qua ownership.

`GET /sessions/overview` tìm/lọc/sort trước pagination, có ID phân xử khi bằng nhau. `currentSprint` chỉ là Sprint active. Cảnh báo gồm task chưa Done quá hạn, bài review và phiên quá ngày kết thúc; không suy diễn AI. Chi tiết work hydrate task/blocker/latest submission theo batch, không gọi provider cho từng hàng.

Timeline lọc theo các resource của chính phiên, không gom toàn bộ sự kiện của một actor. Các endpoint work/timeline còn kiểm tra quyền task tương ứng; quyền xem phiên không tự cấp quyền xem bài nộp riêng tư.

Nguồn: [sessions](../../src/sessions), [assignments](../../src/assignments), [projects](../../src/projects), [intern workspace](../../src/intern), [sharing](session-sharing.md).
