# Sprint không hiển thị ở sinh viên — đã sửa trên local

Ngày kiểm: **25/10/2026, UTC+7**. Sprint đã được tạo và có task, nhưng vẫn ở trạng thái `planned`. API workspace chỉ cung cấp `currentSprint` khi có Sprint `active`; giao diện cũ dùng duy nhất trường này nên báo chưa có Sprint.

## Hành vi sau sửa

- Sinh viên chọn được Sprint đã lên kế hoạch, đang chạy và lịch sử trong dự án/phiên đang được phân công.
- Nhãn `planned` vẫn là **Đã lên kế hoạch**. Xem board không kích hoạt Sprint hoặc sửa dữ liệu.
- Mỗi board chỉ trả nhiệm vụ của sinh viên đang đăng nhập. Sprint thuộc dự án/phiên khác bị chặn; browser không truyền danh tính người khác.
- API cũ `/intern/me/sprint/board` giữ nguyên ý nghĩa Sprint đang chạy. API mới bổ sung `GET /intern/me/sprints` và `GET /intern/me/sprints/:id/board`, có phân trang và kiểm quyền từ assignment hiện hành.
- Trạng thái lỗi tải có nút thử lại; chỉ báo chưa có Sprint sau khi tải thành công một danh sách rỗng.

## Bằng chứng

| Kiểm tra | Kết quả | Nguồn dưới workspace |
|---|---|---|
| BE toàn bộ unit | 104 suite / 795 test | `.runtime/student-sprint-be-unit.log` |
| FE toàn bộ unit | 101 file / 614 test | `.runtime/student-sprint-fe-unit.log` |
| SQL + HTTP thật | 3 test: planned/list/own tasks, ngoại phạm vi, ID giả và giả danh | `.runtime/student-sprint-sql.log` |
| Build/lint/typecheck | Qua; BE còn 15 cảnh báo console đã có | `.runtime/student-sprint-*-build.log`, `*-lint.log`, `student-sprint-fe-typecheck.log` |
| Chrome local | Sprint planned hiện 4 task; 5 độ rộng 390/768/1024/1280/1440; 0 tràn ngang; 0 page error | `manual-runtime/g6-20261025/student-sprint-browser.json`, `student-sprint-*.png` |

Chrome dùng tài khoản QA đã có dữ liệu, không dùng ba tài khoản trắng gốc. Chỉ phát sinh đăng nhập/phiên xác thực; không đổi trạng thái task/Sprint. Không cần migration hay sửa dữ liệu để khắc phục lỗi này.

CI có thêm gate SQL riêng (`107`) để lỗi không quay lại. Trạng thái CI remote phải đối chiếu đúng commit trong PR; báo cáo local này không thay cho kết quả CI.
