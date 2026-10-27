# Tiến độ nghiệm thu và giao diện — 26/10/2026

## Tiếp tục nghiệp vụ — 27/10/2026

Người dùng tạm dừng redesign, ưu tiên hoàn tất các G và kiểm thử luồng nghiệp vụ. Giữ nguyên hai DB chính và ba tài khoản trắng. Mọi ca tạo dữ liệu lỗi/ngoại lệ dùng DB QA hoặc DB disposable riêng; phân biệt provider fixture với dịch vụ ngoài thật.

| Mục | Điều kiện hoàn thành | Trạng thái |
|---|---|---|
| N01 — đối chiếu bằng chứng | G1–G7 khớp receipt hiện hành, sửa số liệu cũ có nguồn | Đang đối chiếu; receipt SQL mới đã ghi 31/31, không còn 30/31 ở mốc mới |
| N02 — nhánh G3–G4 | CV/mail/lịch, no-show, role và giới hạn lượt đạt regression SQL, phân loại đúng fixture | Đạt 48/48 SQL/HTTP, source 254cabd; không gọi fixture là provider thật |
| N03 — nhánh G5–G6 | Mời lại/quyền, vi phạm/miễn trừ/thay người và bảo toàn lịch sử | 17/17 invitation; 52 ca participation theo kết quả mới nhất. Lượt nhóm đầu có 1 timeout, advisor riêng 3/3 đạt; không che log đỏ |
| N04 — UI ba vai | Click thao tác nghiệp vụ, kiểm pending/result và dữ liệu sau tải lại | Đạt các ca chọn lọc: báo cáo/policy, KPI/chứng nhận/quyền/Mentor, Admin validation/audit. Chưa phải mọi nhánh UI |
| N05 — bàn giao | Plan/receipt/README đồng bộ, code/docs đã push và CI đúng SHA | Đã đồng bộ tài liệu/JSON; đang công bố và kiểm CI của commit tài liệu |

Phần giao diện F08/F09 được tạm gác theo chỉ đạo mới, không đánh dấu hoàn thành.

Đọc [báo cáo nghiệp vụ 27/10](../docs/BUSINESS-ACCEPTANCE-20261027.md), [checkpoint 26/10](../docs/ACCEPTANCE-CHECKPOINT-20261026.md) và [receipt JSON](../docs/reports/live-service-journey-20261026.json). Bảng này mô tả việc đã kiểm thực tế; không lấy trạng thái implementation thay cho kết quả UI hoặc dịch vụ ngoài.

| Bước (mốc 26/10) | Hoàn thành khi | Trạng thái ở mốc đó | Bằng chứng / bước tiếp theo |
|---|---|---|---|
| F01 — đối chiếu G | Mỗi mục khớp code và receipt đúng loại | Đã xác định phạm vi, tiếp tục ngoại lệ | G1–G4 có báo cáo; G5 có vòng mời lại mới; G6 có receipt local/SQL và GitHub pending thật. Xem ma trận bên dưới |
| F02 — runtime | Source đúng, lưu trữ trong dự án | Đang chạy local | BE 8080/8081:91a9175;  FE 3001 đã restart build 3c6709a, QA 3004 (dev có sửa 9ef1ff6); hai DB 46 migration,4 file dưới dự án; ba tài khoản trắng giữ nguyên |
| F03 — CI | BE/runner/FE/full-stack xanh đúng SHA | Đạt cặp hiện hành | BE release 40235227782, runner 40235227783, FE quality 40241676421, full-stack 40241676508; FE 3c6709a pin BE 91a9175 |
| F04 — CV đến phỏng vấn | CV→Gmail→Agent role/slot→login→phỏng vấn→trace | Đạt hành trình thật, chủ yếu API | Ba thư Inbox; 10 câu sequential; 91,8/đậu/lượt 1; LangSmith readback |
| F05 — GitHub đến outcomes | Invitation/PR/runner/Agent/duyệt/kết quả | Đạt hành trình QA thật, có bước UI/API |4/4 task done; điểm 96,1/KPI 98,8/lương ảo/chứng nhận/PDF/XLSX. Hai lần click mời lại, pending bị hủy thật được phục hồi; accepted readback push=true/admin=false |
| F06 — ngoại lệ G4–G6 | Negative cases có receipt và không gọi fixture là live | Còn đối chiếu phạm vi | Local/SQL đã có; không chạy đồng hồ giả để gọi là no-show thật. Quyền accepted không rõ provenance phải được giữ, không thu hồi bừa |
| F07 — bàn giao | README/plan/handover/JSON đồng bộ, đã push | Đã push BE b44c15c / FE d9a4e08; bổ sung receipt mới | Checkpoint nghiệp vụ: FE 649 test, 4 task và outcomes; CI 9ef1ff6 xanh đầy đủ. Tài liệu và secret scan đã kiểm |
| F08 — redesign | Toàn bộ tab theo một ngôn ngữ thiết kế | Đã triển khai nền chung; còn chi tiết từng tab | [Nền sổ tay FE](https://github.com/vanhoi04082006-pixel/V-Intern-FE/blob/codex/notebook-workspace/docs/design/NOTEBOOK-FOUNDATION-20261026.md): code 4808210, 12 icon, hai companion, token/sidebar/tab/section cả ba vai; 651 test, build và 15 probe responsive trên ba trang mẫu. Chưa hoàn tất 78 route |
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
| G7 | Hành trình mới có bài lỗi/sửa,4 task,đánh giá/KPI/chứng nhận,3 vai UI và cặp CI xanh. Tài liệu cập nhật | Chưa chốt mọi nhánhUI/responsive hoặc merge stack; local SQL mở rộng đã đạt 31/31 ở fixture 254cabd, timeout gốc 5 giây; giữ log lỗi trước đó |

## Lỗi UX phát hiện trong nghiệm thu

- Trang chủ sau hết phân công từng hiển thị chờ dự án lần đầu: đã sửa tại3c6709a, kiểmUI có lịch sử/kết quả.
- Trang GitHub sau hết phân công vẫn dùng câu chữ lần đầu: đã sửa tại 9ef1ff6, có ba regression tests; phải giữ active flow và không suy mọi lịch sử là completed.
- Bảng điểm có nhãn tiêu chí dự phòng; cần cải thiện khả năng đọc nhưng không suy nhãn từ thứ tự mảng.

Chỉ cập nhật thành Đạt khi receipt có source, thời gian, kết quả và phạm vi. Giữ hai DB chính; không reset hoặc dùng các tài khoản trắng để tiêu thụ luồng.
