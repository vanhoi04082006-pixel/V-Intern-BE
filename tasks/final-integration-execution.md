# Chốt G → dịch vụ thật → bàn giao → UI

Theo yêu cầu ngày 25/10/2026: hoàn tất các G, nghiệm thu trọn luồng với dịch vụ thật, đồng bộ tài liệu, sau đó mới redesign và nghiệm thu UI mới. Không lấy bằng chứng fixture làm live. Giữ hai DB hiện tại và ba tài khoản trắng gốc.

| Bước | Hoàn thành khi | Trạng thái hiện tại | Bằng chứng / việc tiếp theo |
|---|---|---|---|
| F01 — đối chiếu G | Master checklist khớp implementation và evidence từng G | Đang đối chiếu | Có mục G6 đã triển khai nhưng checklist cũ chưa tick; chưa sửa thành đạt khi chưa truy nguồn |
| F02 — runtime | API, web, SQL, runner chạy đúng source, cấu hình ngoài không lộ secret | Đang kiểm tra | SQL 1435 đang nghe; 3001/8080/8081 chưa chạy ở thời điểm bắt đầu lượt này |
| F03 — CI | Gate BE, FE, full-stack chạy đúng SHA và success | Chưa đạt | GitHub connector đúng owner; job cuối BE/FE failure không có step. Đang đọc annotation |
| F04 — CV đến phỏng vấn | CV QA → xác minh email thật → Agent thật chọn role/slot → 2 mail → login/đổi mật khẩu → phỏng vấn/chấm thật, trace đọc lại được | Chưa nghiệm thu mới | Gmail có một thư được người dùng xác nhận; chưa coi là hoàn tất chuỗi |
| F05 — GitHub đến kết quả | Repo QA thật, invitation nhận/mời lại, PR đúng danh tính, webhook thật, runner thật, Agent thật, giảng viên duyệt/sửa, kết quả | Chưa nghiệm thu mới | Có bằng chứng cũ từng đoạn; cần ghép hành trình mới không thay provider/GitHub bằng fixture |
| F06 — ngoại lệ G4–G6 | Trễ/no-show, dưới ngưỡng, hết lượt, nộp trễ/miễn trừ/thay người/quyền repo có evidence đúng loại | Regression local đã có; live còn thiếu | Mọi thay người QA do vai giảng viên duyệt, không dùng tài khoản trắng |
| F07 — đồng bộ bàn giao | Plan, README, handover và JSON cùng nguồn/mốc, secret không vào Git | Chờ kết quả F01–F06 | Cần đồng bộ xác nhận Inbox; ghi rõ blocker ngoài quyền điều khiển |
| F08 — redesign | Tất cả tab theo hướng sổ tay việt quất, icon/minh họa riêng, feedback đầy đủ | Chưa bắt đầu vòng triển khai toàn diện | Xem plan FE `tasks/learning-identity.md`; mới có asset nền tảng |
| F09 — nghiệm thu UI | Responsive, keyboard, reduced motion, lỗi/thành công, hai vai và Admin, regression đúng source | Chưa làm | Không dùng số test G7 làm nghiệm thu giao diện mới |

Chỉ ghi “hoàn tất tất cả” khi các điều kiện trên đã đạt. Nếu dịch vụ ngoài chặn, ghi dịch vụ, lỗi thực tế, phần đã làm và điều kiện mở lại; không tắt gate, đổi assertion hoặc bịa receipt.
