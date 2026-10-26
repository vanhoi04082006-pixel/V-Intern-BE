# Tiến độ nghiệm thu và giao diện — 26/10/2026

Đọc [checkpoint hiện hành](../docs/ACCEPTANCE-CHECKPOINT-20261026.md) và [receipt JSON](../docs/reports/live-service-journey-20261026.json). Bảng này mô tả việc đã kiểm thực tế; không lấy trạng thái implementation thay cho kết quả UI hoặc dịch vụ ngoài.

| Bước | Hoàn thành khi | Hiện tại | Bằng chứng / bước tiếp theo |
|---|---|---|---|
| F01 — đối chiếu G | Mỗi mục khớp code và receipt đúng loại | Đã xác định phạm vi, tiếp tục ngoại lệ | G1–G4 có báo cáo; G5 có vòng mời lại mới; G6 có receipt local/SQL và GitHub pending thật. Xem ma trận bên dưới |
| F02 — runtime | Source đúng, lưu trữ trong dự án | Đang chạy local | BE 8080/8081:91a9175;  FE 3001 đã restart build 3c6709a, QA 3004 (dev có sửa 9ef1ff6); hai DB 46 migration,4 file dưới dự án; ba tài khoản trắng giữ nguyên |
| F03 — CI | BE/runner/FE/full-stack xanh đúng SHA | Đạt cặp hiện hành | BE release 40235227782, runner 40235227783, FE quality 40241676421, full-stack 40241676508; FE 3c6709a pin BE 91a9175 |
| F04 — CV đến phỏng vấn | CV→Gmail→Agent role/slot→login→phỏng vấn→trace | Đạt hành trình thật, chủ yếu API | Ba thư Inbox; 10 câu sequential; 91,8/đậu/lượt 1; LangSmith readback |
| F05 — GitHub đến outcomes | Invitation/PR/runner/Agent/duyệt/kết quả | Đạt hành trình QA thật, có bước UI/API |4/4 task done; điểm 96,1/KPI 98,8/lương ảo/chứng nhận/PDF/XLSX. Hai lần click mời lại, pending bị hủy thật được phục hồi; accepted readback push=true/admin=false |
| F06 — ngoại lệ G4–G6 | Negative cases có receipt và không gọi fixture là live | Còn đối chiếu phạm vi | Local/SQL đã có; không chạy đồng hồ giả để gọi là no-show thật. Quyền accepted không rõ provenance phải được giữ, không thu hồi bừa |
| F07 — bàn giao | README/plan/handover/JSON đồng bộ, đã push | Đã đồng bộ, chuẩn bị push | Cập nhật 649 FE, 4 task và outcomes; cần kiểm link/secret, review và push |
| F08 — redesign | Toàn bộ tab theo một ngôn ngữ thiết kế | Inventory 78 route; chuẩn bị lát shared foundation | Xem manifest FE, asset 5165ced được bảo toàn. Trang chủ / giữ nguyên |
| F09 — nghiệm thu UI | Ba vai,5 độ rộng, keyboard, feedback và regression | Đã click luồng chính; chưa đủ toàn hệ thống | Không dùng số unit để gọi 78 route đã nghiệm thu |

## Đối chiếu G và phần bằng chứng

| G | Implementation / kiểm chứng đã có | Còn phải phân biệt |
|---|---|---|
| G1 | RuntimeAgent, role động, retrieval scope, checkpoint/tool budget, trace. Unit/SQL và LangSmith ngoài thật | Không tự động gửi raw mail/CV/code vào trace |
| G2 | Sáu bài nhỏ, starter/solution/faulty, thư viện nuôi bảy Agent; suitesDocker. Hành trình mới chạy bàiNotes | Một bài QA mới không thay cho kiểm lại cả thư viện |
| G3 | CV→role→slot→mail và credential, idempotency. Hành trình mới dùng Gemini/Gmail thật | Negative SMTP timeout vẫn là test có chủ đích; Inbox đọc lại khác SMTP accepted |
| G4 | Phòng chờ,15 phút,3 lượt,ranh giới 50/70; local/SQL regression. Phỏng vấn thật 91,8 | No-show/hết lượt/role đề xuất không được gọi đã xảy ra trong lần passed |
| G5 | Numeric ID, branded mail, resend/recovery, provenance 201, webhook và GitHub thật | Accepted xác minh bằng API; không có ảnh click nhận. Webhook tạm đã tắt khi tunnel hết hạn |
| G6 | D01–D03/T01–T03 đã triển khai; [policy](../docs/reports/g6-foundation-evidence-20261025.json), [thay người](../docs/reports/g6-replacement-evidence-20261025.json), [worker GitHub thật](../docs/reports/g6-access-live-20261025.json) | G6 GitHub dùng SQL QA disposable; không nói đó là thay người trên phiên chính. Pending do hệ thống cấp đã thu hồi thật; accepted không rõ nguồn giữ để Admin đối chiếu |
| G7 | Hành trình mới có bài lỗi/sửa,4 task,đánh giá/KPI/chứng nhận,3 vai UI và cặp CI xanh. Tài liệu cập nhật | Chưa chốt mọi nhánhUI/responsive hoặc merge stack; local SQL mở rộng30/31 còn timeout gốc5 giây |

## Lỗi UX phát hiện trong nghiệm thu

- Trang chủ sau hết phân công từng hiển thị chờ dự án lần đầu: đã sửa tại3c6709a, kiểmUI có lịch sử/kết quả.
- Trang GitHub sau hết phân công vẫn dùng câu chữ lần đầu: đã sửa tại 9ef1ff6, có ba regression tests; phải giữ active flow và không suy mọi lịch sử là completed.
- Bảng điểm có nhãn tiêu chí dự phòng; cần cải thiện khả năng đọc nhưng không suy nhãn từ thứ tự mảng.

Chỉ cập nhật thành Đạt khi receipt có source, thời gian, kết quả và phạm vi. Giữ hai DB chính; không reset hoặc dùng các tài khoản trắng để tiêu thụ luồng.
