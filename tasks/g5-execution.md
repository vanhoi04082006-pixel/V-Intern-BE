> **Cập nhật 27/10:** [kiểm thử nghiệp vụ hiện hành](../docs/BUSINESS-ACCEPTANCE-20261027.md) và [tiến độ](final-integration-execution.md). Các trạng thái ngày 24–25/10 dưới đây được giữ như lịch sử; phần billing/native/live đã có receipt mới.

# G5 — Quyền truy cập repository và lời mời GitHub

Tiếp G4, theo H01–H04 trong [kế hoạch](todo.md). Repo do tài khoản chung Admin cấu hình tạo; không lấy tài khoản `gh` của máy làm chủ repo.

## Audit trước khi sửa

Đã có xác minh chủ repo/ID numeric, batch năm người, worker round-robin, HMAC/dedup webhook và UI hai vai. Tuy nhiên `invited` đang gộp phản hồi 201/204, không có invitation ID/hạn/lease/cooldown/audit riêng; force mời lại bỏ qua trạng thái; chưa có thư V-Intern và CTA của từng thành viên. Webhook hiện phục vụ push/PR/CI, đối chiếu collaborator cần hoạt động cả khi không có event.

## Lát thực hiện và tiêu chí

| Lát | Hoàn thành khi | Kiểm chứng | Trạng thái |
|---|---|---|---|
| H01 | Pending/accepted/expired/failed/not_connected dựa remote, numeric ID và snapshot | Contract 201/204/403/404/429, SQL migration, identity mismatch | Đạt local; live pending/accepted đã xác minh |
| H02 | Từng người/batch tối đa năm, lease và cooldown, không spam pending/accepted | SQL bấm đôi, reconnect/đổi owner, hết hạn, audit | Đạt local; live 0 grant trùng; chu trình nhận mới/mời lại chưa kiểm |
| H03 | Notification và email V-Intern đúng phiên/repo, UI SV/GV có hành động đúng quyền | SMTP local, FE unit/browser, lỗi/keyboard | Đạt local; email ngoài không thuộc nghiệm thu |
| H04 | HMAC/dedup/scope giữ nguyên, live delivery hoặc phụ thuộc ngoài ghi rõ | Regression webhook, HTTPS route riêng và GitHub delivery | Đạt live ping HTTP 200/dedup; hook tạm đã tắt |

[Báo cáo, số liệu và giới hạn](../docs/reports/g5-completion-20261025.md). Chưa chốt checkpoint G5 chỉ bằng test deterministic.

## Ranh giới tin cậy

Browser chỉ yêu cầu đối chiếu/mời, không khai báo danh tính hoặc accepted. Numeric ID, repo ID và owner ID được kiểm trước khi cấp quyền. Lease SQL chặn hai process gửi trùng; remote có thể đã thành công khi timeout nên lần sau luôn đối chiếu trước khi gửi. Không tự thu hồi quyền cũ khi người dùng đổi GitHub: báo cần Admin đối chiếu và giữ lịch sử. Chỉ staff có quyền quản lý phiên được mời người khác; SV chỉ kiểm tra quyền của mình. Email native GitHub không chỉnh được; thư V-Intern là thông báo bổ sung qua outbox mã hóa hiện có.

Chỉ dùng DB disposable và tài khoản QA. Giữ nguyên cả hai DB chính và tài khoản trắng. SMTP nghiệm thu local theo lựa chọn của người dùng.
