# G7 — nghiệm thu và bàn giao

Tiếp sau G6/T03. Không reset DB, không dùng ba tài khoản trắng cho QA, không triển khai production. Các ô chỉ được đánh dấu khi đã có nguồn kiểm chứng.

| Hạng mục | Điều kiện hoàn thành | Kiểm bắt buộc | Trạng thái |
|---|---|---|---|
| Q05.1 | Cấp lại riêng cho tài khoản CV dùng mật khẩu tạm hết hạn; email xác minh trong 24 giờ; lý do và revision | SQL đồng thời/replay, tài khoản chính thức/staff/không đúng email/verification cũ bị chặn | Đang làm |
| Q05.2 | Password mới chỉ hash ở users, mail mã hóa; thu hồi authVersion/refresh; giữ số lượt; không đổi lịch ngầm | SMTP local, login cũ thất bại, đổi password mới; rollback mail/audit | Chưa kiểm |
| Q05.3 | Giao diện staff chọn slot để giới hạn thời hạn credential, xem trước ảnh hưởng rồi cấp lại | Typecheck/unit/Chrome, không lộ password trong response/preview | Chưa làm |
| Q01.1 | Cổng đặt lịch ban đầu dùng cùng giới hạn lượt cấu hình như start/retake | Cấu hình tối đa 1/2/3, không nhận lượt thứ tư | Chưa làm |
| Q01.2 | Hai vai đi hết CV → mail local → lịch → interview → assignment → repo/PR → chấm/sửa → kết quả | Phân biệt fixture/provider thật/SMTP local/GitHub thật; có nhánh lỗi và no-show | Chưa làm |
| Q02 | Regression FE/BE, SQL2019 và CI full-stack cùng commit pair | Giữ nguyên audit, assertion, timeout; browser đa kích thước | Chưa làm |
| Q03 | Tài liệu đọc theo vai trò, sơ đồ, ví dụ, cấu hình, recovery, map code và giới hạn nhất quán | Link check, API contract, mốc kiểm/số test có nguồn | Đang cập nhật từng lát |
| Q04 | Code và tài liệu đã push; PR có kiểm chứng đúng SHA | Remote refs, CI logs, status sạch; không merge khi chưa đủ gate | Chưa làm |
| Native | Kích hoạt migration G6 không làm mất dữ liệu | Snapshot cột cũ trước/sau cả hai DB, ba blank accounts và readiness | Chưa làm |

## Hợp đồng Q05

Không dùng resend email để đổi mật khẩu. Staff phải thuộc đúng đợt hoặc là Admin, nhập lý do 10–1000 ký tự và duyệt snapshot còn hiệu lực. Chỉ khôi phục tài khoản intern active, được cấp credential qua CV, `mustChangePassword=true` và credential đã hết hạn. Tài khoản đã đổi mật khẩu chính thức, staff, tài khoản trắng và hồ sơ đang phỏng vấn/chấm/đã đạt không được reset.

Staff chọn một slot đang mở của đúng đợt để tính thời hạn credential đến hết slot cộng 24 giờ. Đây chỉ là giới hạn thời hạn, **không giữ chỗ hoặc đổi lịch/role/lượt**. Việc đặt lại lịch vẫn qua luồng retake/reschedule hiện có. Email được xác minh trong 24 giờ; xác minh lại được thực hiện từ cổng ứng viên, không gửi password qua API hay Agent.

Transaction khóa hồ sơ/slot/user, kiểm revision và điều kiện hiện tại; thu hồi phiên cũ, hủy credential mail cũ chưa giao và lưu mail mới mã hóa + audit cùng giao dịch. Nếu email cũ đang gửi thì chờ xử lý, không cấp chồng. Replay cùng snapshot đã thành công trả cùng receipt, không tạo password/mail thứ hai. SMTP timeout giữ trạng thái chưa chắc giao nhận theo quy tắc outbox hiện có.
