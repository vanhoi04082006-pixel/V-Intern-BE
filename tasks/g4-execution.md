> **Cập nhật 27/10:** [kiểm thử nghiệp vụ hiện hành](../docs/BUSINESS-ACCEPTANCE-20261027.md) và [tiến độ](final-integration-execution.md). Các trạng thái ngày 24–25/10 dưới đây được giữ như lịch sử; phần billing/native/live đã có receipt mới.

# G4 — Phỏng vấn theo lịch

Tiếp G3 (`7e489fb` BE / `62fdfe9` FE), theo phạm vi đã được duyệt. Triển khai trên `codex/g4-scheduled-interviews`; giữ DB/tài khoản trắng và các gate cũ.

## Quy tắc cụ thể

- Tài khoản đã liên kết CV dùng nghề/booking do hệ thống xếp. Không thể dùng PATCH role hoặc direct URL để đổi nghề/bỏ lịch. Tài khoản lịch sử chưa có liên kết CV giữ đường cũ để bảo toàn chức năng và dữ liệu.
- Trước giờ: chờ. Từ T đến T+14:59: được bắt đầu. T+15:00: chưa bắt đầu thì no-show, CV deferred, đợi đợt khác. Đồng hồ server quyết định, không nhận thời gian từ body.
- Lượt đã bắt đầu được tiếp tục sau T+15 và sau khi process restart; thời hạn bài phỏng vấn riêng vẫn có hiệu lực. Không tăng lượt do reload.
- Một booking version chỉ được dùng một lần. Lần tiếp cần lịch mới; tổng không vượt ba lượt và giữ cooldown hiện có.
- Giảng viên có quyền có thể hẹn lại sau thất bại hoặc xử lý ngoại lệ no-show với lý do và audit. Không mở lại vô hạn hoặc reset attempt. Nghề mới chỉ cùng nghề hiện tại hoặc nghề khác có đề xuất từ kết quả đã lưu; khung giờ phải đủ điều kiện.
- Giữ ranh giới điểm: dưới 50 chưa đạt; 50–70 bao gồm hai đầu là định hướng nghề khác; trên 70 đạt. Không thay cơ chế chấm/điểm bằng UI.

## Lát kiểm chứng

| Lát | Hoàn thành khi | Kiểm | Trạng thái |
|---|---|---|---|
| I01 | Start/role gate theo identity và booking, attendance snapshot | SQL API sớm/đúng giờ/giả role/đụng lịch | Đạt local |
| I02 | No-show đúng mốc, race an toàn, resume và audit ngoại lệ | Unit boundary, SQL start-vs-sweep/restart/attempt | Đạt local |
| I03 | Phòng chờ, role có sẵn, retake/lý do và timeline | FE unit, Chrome, keyboard/mobile | Đạt local |

Kết quả ngày 25/10/2026 (UTC+7): [báo cáo](../docs/reports/g4-completion-20261025.md) và [manifest có hash nguồn](../docs/reports/g4-evidence-20261025.json). CI GitHub sẽ được đối chiếu riêng sau khi publish; không coi local pass là remote pass.

Attendance lưu booking version, slot/role/time và session riêng để việc dời lịch sau không sửa lịch sử cũ. Worker và start dùng cùng thứ tự khóa theo CV → profile → booking; no-show không được rollback cùng lỗi HTTP. Không chỉnh migration G3 đã áp dụng; dùng migration bổ sung.
