# Chốt G → dịch vụ thật → bàn giao → UI

Theo yêu cầu ngày 25/10/2026: hoàn tất các G, nghiệm thu trọn luồng với dịch vụ thật, đồng bộ tài liệu, sau đó mới redesign và nghiệm thu UI mới. Không lấy bằng chứng fixture làm live. Giữ hai DB hiện tại và ba tài khoản trắng gốc.

| Bước | Hoàn thành khi | Trạng thái hiện tại | Bằng chứng / việc tiếp theo |
|---|---|---|---|
| F01 — đối chiếu G | Master checklist khớp implementation và evidence từng G | Đang đối chiếu | Có mục G6 đã triển khai nhưng checklist cũ chưa tick; chưa sửa thành đạt khi chưa truy nguồn |
| F02 — runtime | API, web, SQL, runner chạy đúng source, cấu hình ngoài không lộ secret | Đang chạy local | Hai API 8080/8081 nạp source Agent mới, web 3001/3004; SQL native và Docker runner riêng. Nhãn SMTP đã khớp transport thật; không sửa credential |
| F03 — CI | Gate BE, FE, full-stack chạy đúng SHA và success | Cặp 0b137cd / 28cc4c1 đã đạt; đang kiểm tra pin mới | BE release 40221754231 + runner 40221754243, FE quality 40225981150 + full-stack 40225981181 success. Đang chạy lại cho BE 91a9175 / FE 7f43048. Giữ đủ gate/assertion/timeout; không gán receipt cũ cho code mới |
| F04 — CV đến phỏng vấn | CV QA → xác minh email thật → Agent thật chọn role/slot → 2 mail → login/đổi mật khẩu → phỏng vấn/chấm thật, trace đọc lại được | Đạt hành trình dịch vụ thật qua API | CV tổng hợp → Gmail nhận 3 thư thật → 3 Agent chọn Frontend/lịch → login → phỏng vấn 10 câu → AI 91,8 điểm, attempt 1; LangSmith đọc lại trace metadata. Chưa thay thế nghiệm thu click UI |
| F05 — GitHub đến kết quả | Repo QA thật, invitation nhận/mời lại, PR đúng danh tính, webhook thật, runner thật, Agent thật, giảng viên duyệt/sửa, kết quả | Đang nghiệm thu, đã chấm bài lỗi thật | Repo owner mặc định; student có push, không admin; PR #1 đúng danh tính/SHA; webhook HTTPS ping 200 và PR event; Docker 1/2 checks, Agent 58,5 needs_changes. Đã sửa lỗi automatic review dùng actor sinh viên thay vì mentor server chọn; 18 focused tests đạt. Còn sửa/nộp lại, duyệt và kết quả; quyền collaborator hiện hữu chưa chứng minh invitation lifecycle mới |
| F06 — ngoại lệ G4–G6 | Trễ/no-show, dưới ngưỡng, hết lượt, nộp trễ/miễn trừ/thay người/quyền repo có evidence đúng loại | Regression local đã có; live còn thiếu | Mọi thay người QA do vai giảng viên duyệt, không dùng tài khoản trắng |
| F07 — đồng bộ bàn giao | Plan, README, handover và JSON cùng nguồn/mốc, secret không vào Git | Chờ kết quả F01–F06 | Cần đồng bộ xác nhận Inbox; ghi rõ blocker ngoài quyền điều khiển |
| F08 — redesign | Tất cả tab theo hướng sổ tay việt quất, icon/minh họa riêng, feedback đầy đủ | Inventory và manifest đã có; chưa triển khai toàn diện | FE 78 route: intern 23, instructor 19, Admin 28, public 8. Xem `tasks/ui-route-asset-manifest.md`; giữ asset nền tảng ở 5165ced, chưa coi là redesign đã hoàn tất |
| F09 — nghiệm thu UI | Responsive, keyboard, reduced motion, lỗi/thành công, hai vai và Admin, regression đúng source | Chưa làm | Không dùng số test G7 làm nghiệm thu giao diện mới |

## Lượt kiểm thử tiếp theo bằng giao diện

- [x] Sinh viên: đăng nhập, dashboard thấy Sprint/task, mở bài nộp, đọc lỗi Agent/runner thật và gửi bình luận.
- [x] Giảng viên: mở đúng phiên/Sprint, xem bài lỗi, yêu cầu sửa, mở bài nộp lại, xác nhận điểm từ bằng chứng (task đầu; override có audit được ghi riêng).
- [x] Sinh viên: nộp PR #2 đã sửa bằng form; UI “Đang xác minh code”, lưu đúng SHA, chuyển review; xem kết quả Docker 2/2 và AI 100 nhưng inconclusive do lockfile vượt giới hạn.
- [ ] Admin: dashboard, dịch vụ, thư gửi, thư viện/Agent, cấu hình GitHub; kiểm tra dữ liệu và quyền, không chỉnh credential hay tiêu thụ tài khoản trắng.
- [ ] Hoàn tất 4 task và luồng đánh giá/KPI/chứng nhận; ghi riêng bước API và bước click.
- [ ] Responsive và UI mới chỉ đánh dấu đạt sau khi triển khai/kiểm tra tương ứng.

Nguồn hiện tại: evidence riêng đã lọc `manual-runtime/final-integration-20261025/live-evidence.json`, các log `.runtime/review-automatic-red.log`, `review-authority-green.log`, `review-authority-build.log`. Thư, CV và state chứa credential không được commit. Baseline trước bản sửa mới: BE 112 suites/845 tests; FE 638 tests lịch sử, focused communications hiện 3 tests. Chưa ghi số regression mới khi chưa chạy đủ.

### Cập nhật ngày 26/10

- BE hiện 114 suites / 858 unit tests; focused SQL notification/RBAC 9 tests. Collector hỗ trợ `.cjs/.mjs` vẫn chặn credential và tệp >30.000 byte. Không bỏ qua lockfile lớn để đổi kết luận thành đạt.
- Giảng viên click trả bài lỗi 58,5; task về doing. Sinh viên click nộp PR sửa; giảng viên thử duyệt thường bị chặn khi AI inconclusive, sau đó duyệt 90 với lý do đối chiếu đủ 6 blob/SHA, 72 package có integrity, local browser 2/2 và runner 2/2. Audit giữ lý do thủ công; AI vẫn inconclusive. Task done; PR QA #2 được merge sau khi xác minh approval/SHA. Đây là nghiệm thu nhánh chấm thủ công, không phải AI tự duyệt.
- PR QA #3 cho nhiệm vụ lưu trữ đã tạo; chưa nộp/chấm. 3 task còn lại và outcomes chưa hoàn tất hành trình mới.
- FE production build đạt sau khi bảo tồn/tạo lại cache compiler; không đổi bundler hay gate. Feedback thiếu bằng chứng đang được sửa để không chỉ báo lỗi 409 chung chung.
- Admin đang được kiểm tra bằng tài khoản bootstrap của DB QA; credentials cũ trong file accounts bị từ chối đúng cách, không reset mật khẩu hay dữ liệu.
- Admin đã click health refresh, kiểm tra JSON sai/hợp lệ không lưu, preview credential bị che và hàng đợi email; đã sửa parser bản nháp và xác nhận lại UI. FE hiện 106 file / 644 tests, production build đạt.
- Task lưu trữ đã nộp qua API, mở xem trên UI. Sau sửa JSON Schema/remainingToolCalls, Docker 1/1, Agent thật 98,5, findings/limitations rỗng, awaiting_instructor. Các lượt lỗi JSON/tool-budget cũ vẫn giữ; không dùng override che lỗi.
- BE hiện 114 suites / 859 tests. SQL notification riêng 9/9; bộ SQL runtime mở rộng 30/31 ở hai lượt local vì replay sau restart vượt timeout 5 giây. Không tăng timeout hoặc ghi đạt toàn bộ; đối chiếu CI 91a9175 và tiếp tục theo dõi hiệu năng local.
- Webhook QA tạm đã tắt đúng hook 703045072 sau khi tunnel kết thúc; vẫn giữ receipt ping/PR. Không tuyên bố webhook public thường trực đã cấu hình.

Chỉ ghi “hoàn tất tất cả” khi các điều kiện trên đã đạt. Nếu dịch vụ ngoài chặn, ghi dịch vụ, lỗi thực tế, phần đã làm và điều kiện mở lại; không tắt gate, đổi assertion hoặc bịa receipt.
