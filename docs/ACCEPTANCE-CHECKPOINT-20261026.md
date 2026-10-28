# Nghiệm thu ngày 26/10/2026

> Lượt tiếp theo: [nghiệp vụ 27/10](BUSINESS-ACCEPTANCE-20261027.md). Các số liệu sau thuộc source ghi riêng bên dưới.

Hành trình QA mới đã đi hết từ CV đến chứng nhận với Gmail, Gemini, LangSmith, GitHub và Docker thật. Các bước qua UI và API được phân biệt bên dưới. **Chưa kết luận nghiệm thu mọi nhánh của ba vai hoặc redesign toàn hệ thống.**

## Đọc nhanh tình trạng

| Phần | Kết quả | Còn giới hạn gì? |
|---|---|---|
| CV, thư, phỏng vấn | Nhận ba thư thật; Agent chọn Frontend/lịch; phỏng vấn 10 câu, **91,8**, đậu lượt 1 | CV tổng hợp và tài khoản QA; bước nhận CV/phỏng vấn chủ yếu qua API |
| Bài nộp và chấm | **4/4 task** được giảng viên duyệt; có bài lỗi, trả bài, sửa và nộp lại | AI không tự thay quyết định giảng viên |
| Kết quả cuối | Đánh giá chính thức **96,1**; KPI **98,8**; chứng nhận hợp lệ; PDF/XLSX đã đối chiếu | Không suy điểm AI của task thành điểm đánh giá cuối |
| GitHub invitation | Tạo mới 201 → nhận; sau đó mất quyền → mời lại trên UI → hủy pending ở GitHub → UI mời lại → accepted readback | Không giả lập hết hạn 7 ngày; không có ảnh click nhận lời mời trên GitHub |
| CI | BE release, runner, FE quality và full-stack xanh | Chưa merge bộ PR sản phẩm |
| UI | Đã click các luồng chính và kết quả sau hoàn tất của ba vai | Chưa kiểm hết78 route và mọi trạng thái; redesign mới chưa toàn diện |

## 1. Một bộ số liệu có nguồn

| Kiểm tra | Kết quả | Source và bằng chứng |
|---|---|---|
| BE unit | **114 suites / 859 tests đạt** | Code 91a9175a99555036e3fdd247e94146b875c9716f; lint file đổi và Nest build đạt |
| FE unit | **109 files / 660 tests đạt** | Source 603ee3f; số liệu theo receipt nghiệp vụ 27/10. Mốc 649 test của 9ef1ff6 là lượt trước đó |
| Script contracts | **25 đạt** | Chờ background review qua GET; giữ assertion SHA/inconclusive/override |
| SQL notification/RBAC | **9/9 đạt** | Database QA; PermissionsService/RBAC thật |
| SQL mở rộng local | **31/31 đạt theo kết quả mới** | Fixture 254cabd8e5097d86bc6971f03419944b40b2f592, LangSmith export cô lập trong test module; timeout vẫn 5 giây. Giữ log 30/31 trước đó; xem receipt nghiệp vụ 27/10 và log được giữ riêng |
| Bài QA cuối | **6/6 Playwright đạt** | Validation, sửa bằng bàn phím, reload, filter/xóa, JSON tải thật, giữ dữ liệu hỏng |

CI: [BE release](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40235227782) · [runner](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40235227783) · [FE quality](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40241676421) · [full-stack](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40241676508).

FE full-stack pin đúng BE 91a9175. Hai PR sản phẩm vẫn draft: [BE #12](https://github.com/vanhoi04082006-pixel/V-Intern-BE/pull/12), [FE #22](https://github.com/vanhoi04082006-pixel/V-Intern-FE/pull/22). Các số 840/638, 644 và các mốc CI cũ trong báo cáo lịch sử thuộc phiên bản trước.

Nguồn máy đọc được: [live-service-journey-20261026.json](reports/live-service-journey-20261026.json). Report chỉ chứa metadata đã chọn, điểm, SHA, trạng thái, artifact hash và readback; không chứa credential, email, CV hoặc thư gốc. Log local ở .runtime; bằng chứng riêng ở manual-runtime/final-integration-20261025, đều trong workspace dự án.

Bản sửa GitHub sau hết phân công: 9ef1ff6, 107 files / 649 tests local đạt; typecheck/lint và [quality CI gồm production build](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40252418448) đạt. [Full-stack mới](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/40252418106) đã đạt; cặp 3c6709a / 91a9175 phía trên đã xanh đầy đủ.

## 2. Bài lỗi, sửa và hoàn thành

~~~mermaid
flowchart LR
  A[CV và Gmail] --> B[Agent chọn role và lịch]
  B --> C[Phỏng vấn 91,8]
  C --> D[Sprint 4 task]
  D --> E[Bài lỗi 58,5 - trả bài]
  E --> F[Sửa - duyệt thủ công 90]
  F --> G[Ba task tiếp: 98,5 /99 /100]
  G --> H[Đánh giá 96,1]
  H --> I[KPI 98,8 và chứng nhận]
~~~

| Bài QA | Docker | Agent | Quyết định giảng viên qua UI |
|---|---|---|---|
| PR #1, cố ý sai validation | 1/2 | 58,5; citation đúng dòng lỗi | Trả bài58,5 |
| PR #2, sửa nền tảng | 2/2 |100 nhưng **inconclusive**, lockfile37.717 byte vượt giới hạn30.000 byte/tệp | Duyệt 90, có lý do/audit; so khớp 6 blob/SHA và chạy test. Không gọi đây là AI tự duyệt |
| PR #3, lưu/khôi phục |1/1|98,5; source đủ, không finding/limitation|Duyệt thường 98,5|
| PR #4, tìm kiếm/xóa |3/3|99; source đủ, không finding/limitation|Duyệt thường 99|
| PR #5, xuất/bàn giao |1/1|100; source đủ, không finding/limitation|Duyệt thường 100|

Các PR bài QA ở [repository nghiệm thu](https://github.com/hbuivanhoi6-stack/vintern-so-tay-hoc-tap-ca-nhan-qa-live-frontend-notes-mvnvp-20261025-13df4e04). Chỉ merge PR 2–5 vào repo bài QA sau duyệt/SHA; bài lỗi PR 1 được giữ. Không merge FE/BE theo đó.

Lượt stage2 từng trả JSON sai rồi vượt tool budget được giữ trong nhật ký. Sửa bằng schema sinh từ validator và quyết định biết số lượt tool còn lại; không sửa chuỗi JSON, bỏ finding, nới budget hoặc timeout để đạt.

Giảng viên nhập rubric 98/100/90/92 với trọng số 35/30/20/15, server tính 96,1. Agent chỉ gợi ý; giảng viên lưu, submit và finalize qua UI. KPI 98,8 lấy chất lượng 96,1, tiến độ 100 và đúng hạn 100. Lương 9.880.000 đồng **ảo**, một giao dịch; chạy lại batch sinh 0 giao dịch. Chứng nhận xác minh công khai valid. PDF báo cáo 32.500 byte, XLSX 11.425 byte / 5 sheet, PDF chứng nhận 31.274 byte; SHA256 trong JSON.

## 3. Những gì đã click trên giao diện

| Vai | Thao tác và kết quả đã quan sát |
|---|---|
| Sinh viên | Login, Sprint/task, đọc lỗi/citation, bình luận, nộp lại PR, xem runner/Agent; sau hoàn thành mở trang chủ lịch sử, đánh giá 96,1, KPI 98,8 và nguồn chất lượng, sổ lương ảo, chứng nhận list/detail, sao chép mã có báo thành công, tra cứu công khai hợp lệ |
| Giảng viên | Dashboard→phiên→task; trả bài; kiểm chặn duyệt thường khi evidence thiếu; duyệt thủ công có audit; duyệt thường ba bài sau; Agent gợi ý đánh giá, lưu/submit/finalize; hai lần mời lại GitHub và tải lại thấy accepted |
| Admin | Login QA, dashboard, health refresh, tích hợp/Agent, JSON nháp sai và9 contract hợp lệ, preview mail che credential, hàng đợi email và outcomes batch. Batch/chứng nhận/xuất dữ liệu còn có bước qua API |

Không coi một trang đã mở là mọi hành động của trang đã được nghiệm thu. Phiên QA đã completed; không mở lại chỉ để thử. Không dùng ba tài khoản trắng gốc.

## 4. Dịch vụ ngoài và giới hạn thực tế

- Gmail: nhận thư xác minh/lịch/tài khoản qua IMAP TLS ở đúng hộp thư QA, không chỉ SMTP accepted.
- Gemini/LangSmith: Agent thật; đọc lại trace metadata từ LangSmith, không đưa raw CV/mail/code vào trace.
- GitHub: invitation 201, pending, missing/reinvite và accepted được đối chiếu numeric ID. Phản hồi lúc nhận lời mời không rõ; readback độc lập xác nhận push=true/admin=false, pending = 0 rồi sản phẩm accepted. Không suy từ thao tác gửi thành công rằng đã nhận.
- Webhook: HTTPS tạm, ping 200 và sự kiện PR thật. Hook QA đã inactive khi tunnel hết hạn; chưa có public webhook thường trực.
- Docker: runner sealed suite độc lập. Không dùng CI của repo sinh viên thay trusted runner.
- SQL: 46 migration ở hai DB native; cả 4 file data/log được đọc qua sys.database_files và nằm dưới folder dự án. Giữ DB chính và ba tài khoản trắng.

## 5. Việc còn mở

1. Đối chiếu đầy đủ nhánh muộn/no-show/hết lượt/miễn trừ/thay người với receipt từng G. Các ca giả lập có chủ đích vẫn ghi local, không gọi là provider ngoài thật.
2. Câu chữ GitHub sau hết phân công đã sửa ở 9ef1ff6, có ba regression tests: giữ hướng dẫn lần đầu, giữ active repository và phân biệt lịch sử mà không tự suy hoàn thành. Đã kiểm UI: login sinh viên, mở từ drawer và thấy hướng dẫn hành trình tiếp theo.
3. Hoàn tất ma trận tương tác ba vai, responsive, keyboard và trạng thái lỗi/thành công cho toàn bộ trang.
4. Triển khai redesign theo [manifest](https://github.com/vanhoi04082006-pixel/V-Intern-FE/blob/codex/g7-live-frontend/tasks/ui-route-asset-manifest.md), giữ trang chủ /. Inventory78 route là phạm vi cần làm, không phải78 route đã được redesign.

Chỉ chạy local. Chưa tuyên bố tất cả G hoặc UI mới hoàn thành; không hạ gate để chốt.
