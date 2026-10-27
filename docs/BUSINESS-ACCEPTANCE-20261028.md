# Nghiệm thu bổ sung nghiệp vụ — 28/10/2026

Lượt này tiếp tục kiểm thử nghiệp vụ trên môi trường QA local; redesign vẫn tạm dừng. Đã sửa một lỗi phản hồi tuyển dụng, kiểm lại sáu kịch bản UI của ba vai và cài skill audit bảo mật Cloudflare cho Codex. Chưa chốt toàn bộ G7.

## Nguồn kiểm tra

| Phần | Nguồn |
|---|---|
| BE có bản sửa | `a81de95e3eb9602450abc428f37bdf3f1188aada` |
| FE có bản sửa và pin BE tương thích | `244c2750e69ca24d895604f124616e6824aa5885` |
| UI được click | Worktree FE local, gồm cả các thay đổi redesign đang giữ riêng; không đồng nhất với source đã push |
| Bằng chứng tổng hợp công khai | [Receipt đã lược dữ liệu riêng](reports/business-acceptance-20261028.json) |
| Bằng chứng trước đó | [Nghiệp vụ 27/10](BUSINESS-ACCEPTANCE-20261027.md) |

Không cộng 117 ca SQL/HTTP của ngày 27/10 vào số unit test hôm nay. Không dùng số test local của worktree FE để mô tả CI của branch đã push.

## Lỗi đã sửa

Khi giảng viên tạo một đợt tuyển nháp rồi bấm **Mở nhận CV** trước khi thêm lịch, BE chặn đúng nhưng FE chỉ hiện “Dữ liệu chưa hợp lệ”. Người dùng không biết cần làm gì tiếp theo.

BE hiện trả mã `RECRUITMENT_ROUND_SLOT_REQUIRED`. FE hướng dẫn thêm một khung phỏng vấn đang mở trong tương lai rồi thử lại. Giữ nguyên quyền truy cập, điều kiện ngân hàng câu hỏi, API route và quy tắc mở đợt. Test mới xác nhận không có lệnh cập nhật trạng thái khi thiếu lịch và FE không hiển thị raw message từ máy chủ.

## Sáu kịch bản UI đã kiểm

| Ca | Vai | Thao tác và kết quả |
|---|---|---|
| UI-G6-01 | Giảng viên | Kích hoạt chính sách chỉ cảnh báo 1/2/3 trên phiên QA đang chạy; đối chiếu và tải lại. Phiên bản chính sách được lưu, hạn cũ không bị hồi tố, 0 ghi nhận và 0 điểm phạt |
| UI-G3-01 | Giảng viên | Tạo đợt nháp, thử mở khi chưa có lịch. Đợt giữ trạng thái nháp và hiện hướng dẫn bổ sung lịch sau bản sửa |
| UI-G3-02 | Giảng viên | Tạo khung Frontend hợp lệ → mở đợt thành công → đóng đợt và khung → tải lại. Trạng thái đóng được lưu; không tạo ứng viên |
| UI-G6-02 | Sinh viên | Mở trang thời hạn và cập nhật sau khi giảng viên kích hoạt chính sách. 0 ghi nhận, 0 điểm phạt; không có thao tác quản lý chính sách |
| UI-RBAC-01 | Sinh viên | Nhập trực tiếp đường dẫn quản lý tuyển dụng của giảng viên. Ứng dụng đưa về workspace sinh viên, không hiển thị chức năng quản lý |
| UI-ADMIN-01 | Admin | Audit ban đầu gặp timeout SQL 15 giây. Bấm thử lại hồi phục; lọc `auth.login` và mở chi tiết được. Giữ kết quả lỗi đầu, không tăng timeout |

Đây là sáu kịch bản, không phải sáu test tự động hoặc bằng chứng đã click mọi nhánh. Không có reset DB hoặc sử dụng ba tài khoản trắng. Đợt tuyển QA mới đã đóng cả đợt và khung giờ. Chính sách mới chỉ cảnh báo, không đặt mức trừ điểm.

## Kiểm tra kỹ thuật

| Gate local | Kết quả |
|---|---|
| BE Jest | 115 suite, 860/860 test đạt |
| FE Vitest trên worktree local | 113 file, 676/676 test đạt |
| BE build | Đạt |
| FE typecheck, lint | Đạt |
| BE lint | 0 lỗi, 15 cảnh báo có sẵn; không tắt rule |
| FE build | Hai lần đầu lỗi kết nối tiến trình biến đổi CSS của Turbopack; cùng source và lệnh build đạt sau khi chuyển cache production cũ sang vùng lưu chẩn đoán và dùng cache mới |

Lần build thứ hai đã cho phép IPC local nhưng vẫn lỗi. Vì bước chạy đạt đồng thời thay cache production và cache Node, chưa thể quy lỗi cho một cache cụ thể. Giữ log/panic cũ; không hạ gate hoặc đổi bundler để lấy kết quả xanh.

FE test còn có cảnh báo loader Vite và log jsdom chưa hỗ trợ điều hướng trong một số test. Chúng không làm suite thất bại; báo cáo không gọi log là hoàn toàn sạch.

## Skill bảo mật

Đã cài `security-audit` từ repo chính thức [Cloudflare](https://github.com/cloudflare/security-audit-skill), pin commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`. Có đủ 20 file trong thư mục skill; Git blob của `SKILL.md` khớp bản nguồn. Nội dung nằm trong vùng công cụ local của dự án; Codex phát hiện qua liên kết ở thư mục skill người dùng, dùng chung cho các project.

Đây là cấu hình khả dụng của skill, **chưa phải báo cáo đã audit mọi repository**. Xem [cách dùng và phạm vi](SECURITY-AUDIT-WORKFLOW.md).

## Phần còn mở

- Ma trận UI mọi nhánh nghiệp vụ ba vai chưa hoàn tất; sáu ca hôm nay bổ sung cho các ca đã có.
- Timeout audit đã hồi phục nhưng nguyên nhân gốc chưa xác định; cần tiếp tục đối chiếu khi tái hiện.
- Review và tích hợp stack PR chưa hoàn tất, chưa merge. Trạng thái CI phải đọc theo SHA cuối trên từng PR.
- Redesign và nghiệm thu visual toàn hệ thống vẫn tạm dừng. Thông báo lỗi của thao tác trước còn xuất hiện trong modal thêm lịch cho tới lần submit kế tiếp; đây là phần feedback cần tách trạng thái khi tiếp tục hoàn thiện UI.
- Không gửi mail thật, mời GitHub hoặc chạy grading/Agent thật mới trong lượt này. Bằng chứng dịch vụ ngoài ngày 25–27/10 vẫn mang mốc gốc.

Bản công khai chỉ giữ kết quả tổng hợp. Screenshot, log SQL, tài khoản QA và dữ liệu vận hành giữ riêng; không đẩy chúng vào repo public.
