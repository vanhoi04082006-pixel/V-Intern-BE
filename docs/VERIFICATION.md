# Kiểm chứng backend — local 18/10/2026

Chạy lại local: 73 unit suite/574 test đạt, không thất bại hoặc bỏ qua; build/typecheck đạt, lint0errors/15warning console có sẵn. Nguồn: `manual-runtime/private/local-audit-20261018/be-unit.json` và các log build/typecheck/lint trong cùng thư mục workspace. Số72/568 thuộc checkpoint cũ; con số573 trong báo cáo delivery trước đó đã được sửa theo JSON chạy thực tế. Báo cáo tổng hợp hiện hành: `manual-runtime/local-completion-verification.json`.

SQL local 18/10 đạt toàn bộ25suite/231test,0lỗi/0bỏ qua trên database disposable VIntern_E2E_StorageFresh_20261018124004, trong 423.96 giây. Commit kiểm chứng: f1a280e63947944a67b8e155020a92a944759aac, working tree sạch lúc bắt đầu gate. Source kiểm chứng, tên DB disposable, thời gian và log từng suite ở `manual-runtime/storage-isolated-e2e-verification.json`. Hai database chính và ba tài khoản trắng không reset; readiness hiện hành được ghi riêng sau khi khởi động lại dịch vụ.

Lần SQL đầu hôm nay đạt230/231; một ca metric vượt timeout5giây khi dựng/chuyển trạng thái năm task tuần tự. Bằng chứng lỗi được giữ ở `manual-runtime/private/local-audit-20261018/sql-first-attempt.json`. Fixture được đổi để các task độc lập chạy song song, giữ thứ tự trạng thái trong từng task và chờ mọi ghi hoàn tất trước khi đọc metric. Giữ nguyên timeout và tất cả assertion metric; thêm kiểm tra HTTP200 cho hai bước doing. Suite liên quan đã đạt16/16, ca từng timeout hoàn tất1568ms trong recheck. Không dùng recheck riêng này để thay cho gate đầy đủ.

Board Sprint trả context phạm vi (sessionId, goal, description) và tổng task overdue toàn sprint (bao gồm item ngoài trang100, loại trừ Done). Suite sprint/task có19ca, session overview12ca; gồm foreign scope, permission, paging và aggregate ngoài preview.

Thêm13regression cho tạo database trong thư mục cấu hình trên SQL Server: Windows/POSIX, escape literal và từ chối tên/đường dẫn không hợp lệ. CLI và18suite setup dùng chung DB_FILES_ROOT, giữ nguyên guard disposable. Phần bổ sung MASTER có metadata Kanban và overview sort/current Sprint/alerts; session work/timeline phân trang và role theo phân công. Suite session-overview12/12 và sprint/task19/19 đã chạy trên SQL thật, gồm foreign scope, quyền chỉ xem phiên, sort injection, deleted target và paging.

Baseline ngày15/10: full SQL gate25suites/225tests đạt trong227.359giây trên VIntern_E2E_Release_20261015, chạy lại trên cùng DB sau khi cô lập email/repository ID của fixtures: xem [chứng cứ hệ thống](LIVE-GITHUB.md) và log manual-runtime/private/master-release-e2e.log. Bao gồm auth/signup, recruitment/follow-up/scoring/history, ownership/consent, plan/publish/dependency, raw task-spec export, templates/admin, report scope, KPI/salary/certificates, signed webhook và token rotation.

Regression mới:13SQL tests refresh/callback (encrypted token pair, hai worker, state/version, disconnect/reconnect/locked user, identity/scope/provider errors);12SQL tests submission/review notifications và consent (PASS/FAIL/inconclusive, mute, đúng reviewer, không auto Done, revoke/expiry). GUID case normalization có test tái hiện lỗi trước sửa và sau sửa.

Gemini thật đã chấm evaluatorv3 sáu chiều93.3, lập draft4task/2milestone và trả Mentorv3 sau cập nhật policy. Fixtures ở DB nghiệm thu riêng; AI lỗi không tạo điểm/pass thay thế. Docker thật: NotesUI đúng2/2/lỗi1/2, TasksAPI đúng4/4/lỗi validation3/4/lỗi ownership3/4. CompiledBE xác minh HTTP/HMAC cùng executionTimeMs/score/checks;16runner tests đạt trên Windows và WSL, gồm restrictive-umask regression.

Nghiệm thu ngoài đã dùng hai tài khoản GitHub thật: OAuth, public repo, invite/accept, student PR, codeload SHA, Docker, Gemini và giảng viên duyệt90.5 qua UI. Bản lỗi1/2test, AI57.5/needs_changes; bản sửa2/2, AI98/awaiting_instructor, task chỉ Done sau human approval. Prompt code-review-v2 yêu cầu limitations chỉ chứa thiếu bằng chứng thực sự; không bỏ qua limitation tại backend. Webhook thật và redelivery có chữ ký đạt; hook/tunnel tạm đã đóng sau nghiệm thu. [Chi tiết](LIVE-GITHUB.md).

Catalog có một task QA đã seal; task/framework khác cần contract và image/suite được review. Fixtures tổng hợp kiểm tra tích hợp, không đo độ chính xác AI. Các nghiệm thu provider/browser nêu trên giữ nguyên ngày15–17/10, không phải vừa chạy lại provider hôm nay.

[PR backend2](https://github.com/vanhoi04082006-pixel/V-Intern-BE/pull/2) đã merge ngày18/10, main `dfefc6c` đạt [backend-ci39098705643](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39098705643); runner CI39029856583 đạt trên delivery tree trùng main. Đây là CI baseline trước đợt local hiện tại. Thay đổi mới chỉ gồm fixture SQL và tài liệu; kết quả local không được mô tả là remote CI cho commit mới. Production nằm ngoài phạm vi người dùng yêu cầu hiện tại.

[Cách chạy test](TESTING.md) · [Bảo mật](SECURITY.md) · [Bằng chứng/artifacts](LIVE-GITHUB.md).
