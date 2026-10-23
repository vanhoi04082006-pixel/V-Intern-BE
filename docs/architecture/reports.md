# Báo cáo: lưu lại một thời điểm để đối chiếu

## Báo cáo khác dashboard ở đâu?

Dashboard đọc tình hình hiện tại. Báo cáo đã lưu giữ dữ liệu tại thời điểm tạo. Nếu task đổi vào ngày mai, báo cáo hôm nay không tự viết lại. Người đọc cần nhìn thời điểm, phạm vi và loại báo cáo trước khi so các con số.

## Tạo báo cáo theo từng bước

1. Chọn project và session nằm trong phạm vi quản lý.
2. Có thể lọc tiếp Sprint, sinh viên và khoảng ngày.
3. Đặt tên đủ để nhận ra lần đo; chọn loại progress/performance/evaluation/review/risk.
4. Tạo và lưu; cùng requestId lặp lại trả cùng bản chụp.
5. Mở báo cáo đã lưu, đối chiếu dữ liệu, rồi tải định dạng cần dùng.

BE xác nhận Sprint thuộc đúng project/session và có thành viên hợp lệ. Task tối đa 500 trong một snapshot; `REPORT_SCOPE_TOO_LARGE` yêu cầu thu hẹp phạm vi, không âm thầm cắt phần còn lại.

## Snapshot chứa gì?

Schema version 2 gồm metrics thành viên, tiến độ Sprint/task, overdue, blocker, workload, latest submission, điểm AI và giảng viên riêng biệt, cùng timeline có giới hạn. Thiếu review/điểm giữ null. Snapshot version 1 cũ vẫn đọc và xuất theo thông tin nó đã lưu.

| Dữ liệu | Căn cứ khoảng ngày |
|---|---|
| Tập task và progress | Task.createdAt |
| Số lần nộp | Submission.submittedAt |
| Ngày kết thúc trên UI | Adapter đổi sang đầu ngày kế tiếp để gồm cả ngày được chọn |

Khoảng server có dạng `[from,to)`. Không lấy một task làm một submission vì cùng task có thể nộp nhiều lần. Chọn riêng một sinh viên thì Sprint summary là phần việc của người đó trong scope đã chọn.

## Cảnh báo được giải thích

High khi có task trễ hoặc Sprint hết hạn còn task; medium khi có phụ thuộc/chưa phân công; low khi chưa có dấu hiệu đó. Báo cáo hiển thị lý do. Đây là quy tắc theo facts, không phải AI dự báo chính xác ngày hoàn thành.

## Quyền và export

Giảng viên đọc/xuất báo cáo của mình trong scope hiện còn quyền. Mất quyền task/session có thể làm một snapshot cũ không còn được đọc; không dùng việc thấy cùng sinh viên ở phiên khác để vòng qua kiểm tra. Effective Admin có luồng quản trị riêng được BE xác nhận.

PDF, XLSX và CSV lấy từ cùng snapshot. XLSX chia sheet thông tin/hiệu suất/task-review/Sprint/lịch sử; UI có phân trang không làm file tự mất phần còn lại. Nội dung do người dùng nhập cần được escape để không trở thành công thức spreadsheet.

Nguồn: [reports](../../src/reports), [performance](student-performance.md), [API](../api/ROUTES.md).
