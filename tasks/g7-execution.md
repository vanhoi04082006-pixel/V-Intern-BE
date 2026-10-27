> **Cập nhật 27/10:** [kiểm thử nghiệp vụ hiện hành](../docs/BUSINESS-ACCEPTANCE-20261027.md) và [tiến độ](final-integration-execution.md). Các trạng thái ngày 24–25/10 dưới đây được giữ như lịch sử; phần billing/native/live đã có receipt mới.

> Nghiệm thu hiện hành 26/10: [tiến độ có nguồn](final-integration-execution.md) — hành trình thật đã xong 4/4 task và outcomes, CI xanh; chưa chốt toàn hệ thống. Các trạng thái cũ bên dưới giữ làm lịch sử.

# G7 — nghiệm thu và bàn giao

Tiếp sau G6/T03. Không reset DB, không dùng ba tài khoản trắng cho QA, không triển khai production. Các ô chỉ được đánh dấu khi đã có nguồn kiểm chứng.

| Hạng mục | Điều kiện hoàn thành | Kiểm bắt buộc | Trạng thái |
|---|---|---|---|
| Q05.1 | Cấp lại riêng cho tài khoản CV dùng mật khẩu tạm hết hạn; email xác minh trong 24 giờ; lý do và revision | SQL đồng thời/replay, tài khoản chính thức/staff/không đúng email/verification cũ bị chặn | Đạt 15 ca SQL/HTTP recovery |
| Q05.2 | Password mới chỉ hash ở users, mail mã hóa; thu hồi authVersion/refresh; giữ số lượt; không đổi lịch ngầm | SMTP local, login cũ thất bại, đổi password mới; rollback mail/audit | Đạt SMTP local, HTTP login/đổi mật khẩu; thêm một thư Gmail SMTP accepted |
| Q05.3 | Giao diện staff chọn slot để giới hạn thời hạn credential, xem trước ảnh hưởng rồi cấp lại | Typecheck/unit/Chrome, không lộ password trong response/preview | Đạt ba ca UI + Chrome năm độ rộng |
| Q01.1 | Cổng đặt lịch ban đầu dùng cùng giới hạn lượt cấu hình như start/retake | Cấu hình tối đa 1/2/3, không nhận lượt thứ tư | Đạt canonical config và regression giới hạn lượt |
| Q01.2 | Hai vai đi hết CV → mail local → lịch → interview → assignment → repo/PR → chấm/sửa → kết quả | Phân biệt fixture/provider thật/SMTP local/GitHub thật; có nhánh lỗi và no-show | Đạt local bằng các luồng khai báo fixture; hành trình mới toàn dịch vụ ngoài thật chưa nghiệm thu |
| Q02 | Regression FE/BE, SQL2019 và CI full-stack cùng commit pair | Giữ nguyên audit, assertion, timeout; browser đa kích thước | Local đạt: BE840/FE638/SQL48/full-stack17; cloud BLOCKED billing |
| Q03 | Tài liệu đọc theo vai trò, sơ đồ, ví dụ, cấu hình, recovery, map code và giới hạn nhất quán | Link check, API contract, mốc kiểm/số test có nguồn | Đạt bộ bàn giao theo vai trò, links và evidence có nguồn |
| Q04 | Code và tài liệu đã push; PR có kiểm chứng đúng SHA | Remote refs, CI logs, status sạch; không merge khi chưa đủ gate | Đã push PR draft; chốt cloud/merge chờ billing |
| Native | Kích hoạt migration G6 không làm mất dữ liệu | Snapshot cột cũ trước/sau cả hai DB, ba blank accounts và readiness | Đạt hai DB ×96 bảng bảo toàn, ba blank login và 10 lượt độ rộng |

## Hợp đồng Q05

Không dùng resend email để đổi mật khẩu. Staff phải thuộc đúng đợt hoặc là Admin, nhập lý do 10–1000 ký tự và duyệt snapshot còn hiệu lực. Chỉ khôi phục tài khoản intern active, được cấp credential qua CV, `mustChangePassword=true` và credential đã hết hạn. Tài khoản đã đổi mật khẩu chính thức, staff, tài khoản trắng và hồ sơ đang phỏng vấn/chấm/đã đạt không được reset.

Staff chọn một slot đang mở của đúng đợt để tính thời hạn credential đến hết slot cộng 24 giờ. Đây chỉ là giới hạn thời hạn, **không giữ chỗ hoặc đổi lịch/role/lượt**. Việc đặt lại lịch vẫn qua luồng retake/reschedule hiện có. Email được xác minh trong 24 giờ; xác minh lại được thực hiện từ cổng ứng viên, không gửi password qua API hay Agent.

Transaction khóa hồ sơ/slot/user, kiểm revision và điều kiện hiện tại; thu hồi phiên cũ, hủy credential mail cũ chưa giao và lưu mail mới mã hóa + audit cùng giao dịch. Nếu email cũ đang gửi thì chờ xử lý, không cấp chồng. Replay cùng snapshot đã thành công trả cùng receipt, không tạo password/mail thứ hai. SMTP timeout giữ trạng thái chưa chắc giao nhận theo quy tắc outbox hiện có.
