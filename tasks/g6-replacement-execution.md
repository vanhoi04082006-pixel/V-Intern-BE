# G6 T02–T03 — Thay thành viên có phê duyệt

Tiếp T01 backend đã kiểm. Đã bật trên hai DB native ngày 25/10/2026, giữ nguyên dữ liệu cũ.

| Lát | Điều kiện hoàn thành | Kiểm chứng bắt buộc | Trạng thái |
|---|---|---|---|
| T02.1 | Lưu preview, fingerprint, TTL, kết quả idempotent; migration không xóa lịch sử | SQL up/down trên dữ liệu cũ | Đạt 3 ca SQL migration |
| T02.2 | Preview đúng target/candidate/role, task chuyển và task lịch sử; chặn bài đang review | SQL RBAC, scope, nguồn tư vấn hết hạn/đã đổi | Đạt; kiểm lại số vi phạm còn hiệu lực và snapshot gốc |
| T02.3 | Một transaction hủy assignment cũ/tạo mới, chuyển task mở, version/audit/notification | Hai người duyệt đồng thời, retry sau mất response, rollback khi lỗi | Đạt trong 15 ca SQL workflow, gồm trigger gây lỗi outbox |
| T02.4 | Giảng viên xem ảnh hưởng và nhập lý do trước phê duyệt; SV thấy kết quả của mình | FE unit + Chrome hai vai/keyboard/responsive | Đạt 6 ca dialog; Chrome GV + SV cũ/mới, 20 lượt độ rộng; chưa native |
| T03.1 | Theo dõi quyền GitHub có bằng chứng V-Intern đã cấp; quyền có sẵn không bị nhận là sở hữu hệ thống | Remote 201/204/pending/external, SQL provenance | Đạt 17 ca ledger/invitation, ba migration; chỉ 201 mới ghi ownership |
| T03.2 | Hàng đợi phục hồi sau transaction, lease/retry, đối chiếu phạm vi dùng chung | Race sync/replacement, 403/429/network, disconnect/đổi numeric ID | Đạt 21 ca queue/worker/HTTP, gồm isolation pool và retry revision |
| T03.3 | Cấp/mời người mới; thu hồi chỉ quyền hệ thống cấp và không còn phạm vi cần giữ | SQL/webhook và GitHub live theo phạm vi thực tế | Đạt Chrome 30 lượt độ rộng; GitHub thật tạo/hủy đúng pending; quyền accepted cần Admin đối chiếu |

## Quyết định thực thi

- Tư vấn là sự kiện bất biến có ID, không phải lệnh. Preview chỉ chấp nhận ứng viên đã có trong sự kiện tư vấn và vẫn đạt điều kiện hiện tại.
- Tư vấn dùng trong 30 phút; preview dùng trong 15 phút theo giờ SQL. Phê duyệt phải khớp fingerprint lưu trên server, kiểm quyền và bằng chứng hiện tại một lần nữa.
- Bài đang review/pending submission chặn thay để giảng viên xử lý trước. Task đã xong và lịch sử ở Sprint kết thúc giữ tác giả, bài nộp, điểm và đánh giá cũ.
- Task mở thuộc assignment hiện hành chuyển sang người mới và tăng version; tác giả lịch sử không đổi. Dữ liệu nhiệm vụ khác phiên bị loại khỏi phạm vi chuyển.
- Để không phạt người mới ngay bởi hạn cũ đã qua, preview có khoảng bàn giao mặc định 24 giờ, giảng viên điều chỉnh 1–168 giờ. Chỉ gia hạn task có hạn sớm hơn mốc bàn giao, hiển thị ngày cụ thể trước phê duyệt; task không có hạn vẫn không có hạn. Mọi thay đổi hạn/assignee có audit, không viết lại incident cũ.
- Không xóa tài khoản hoặc thay role tuyển dụng. Hủy assignment cũ/gỡ roster hiện hành theo quyết định giảng viên; giữ project membership lịch sử như quy tắc hiện có. Assignment mới bảo vệ unique active/capacity/role slot.
- Thay người không gọi GitHub bên trong transaction SQL. Hai công việc đối chiếu quyền được lưu cùng transaction và phục hồi riêng; không mặc định quyền GitHub có sẵn là do V-Intern cấp.
- Chỉ thay khi được giảng viên/Admin phê duyệt và có lý do. Model không được tự kick, tự tạo tài khoản hoặc tự cấp quyền.
