# Kiểm chứng backend — 16/10/2026

Source hiện hành:71unit suites/555tests đạt, build đạt, lint0errors/15warning console có sẵn. Registry31migrations; hai runtime và DB nghiệm thu đã migrate, pending=false. Seed runtime giữ185câu/5role,6blueprint, không reset dữ liệu/tài khoản trắng.

Thêm13regression cho tạo database trong thư mục cấu hình trên SQL Server: Windows/POSIX, escape literal và từ chối tên/đường dẫn không hợp lệ. CLI và18suite setup dùng chung DB_FILES_ROOT, giữ nguyên guard disposable. SQL gate của thay đổi này phải chạy lại; không dùng kết quả CI commit cũ làm bằng chứng cho source mới.

Full SQL gate25suites/225tests đạt trong227.359giây trên VIntern_E2E_Release_20261015, chạy lại trên cùng DB sau khi cô lập email/repository ID của fixtures: xem [chứng cứ hệ thống](LIVE-GITHUB.md) và log manual-runtime/private/master-release-e2e.log. Bao gồm auth/signup, recruitment/follow-up/scoring/history, ownership/consent, plan/publish/dependency, raw task-spec export, templates/admin, report scope, KPI/salary/certificates, signed webhook và token rotation.

Regression mới:13SQL tests refresh/callback (encrypted token pair, hai worker, state/version, disconnect/reconnect/locked user, identity/scope/provider errors);12SQL tests submission/review notifications và consent (PASS/FAIL/inconclusive, mute, đúng reviewer, không auto Done, revoke/expiry). GUID case normalization có test tái hiện lỗi trước sửa và sau sửa.

Gemini thật đã chấm evaluatorv3 sáu chiều93.3, lập draft4task/2milestone và trả Mentorv3 sau cập nhật policy. Fixtures ở DB nghiệm thu riêng; AI lỗi không tạo điểm/pass thay thế. Docker thật: NotesUI đúng2/2/lỗi1/2, TasksAPI đúng4/4/lỗi validation3/4/lỗi ownership3/4. CompiledBE xác minh HTTP/HMAC cùng executionTimeMs/score/checks;16runner tests đạt trên Windows và WSL, gồm restrictive-umask regression.

Nghiệm thu ngoài đã dùng hai tài khoản GitHub thật: OAuth, public repo, invite/accept, student PR, codeload SHA, Docker, Gemini và giảng viên duyệt90.5 qua UI. Bản lỗi1/2test, AI57.5/needs_changes; bản sửa2/2, AI98/awaiting_instructor, task chỉ Done sau human approval. Prompt code-review-v2 yêu cầu limitations chỉ chứa thiếu bằng chứng thực sự; không bỏ qua limitation tại backend. Webhook thật và redelivery có chữ ký đạt; hook/tunnel tạm đã đóng sau nghiệm thu. [Chi tiết](LIVE-GITHUB.md).

Catalog có một task QA đã seal; task/framework khác cần contract và image/suite được review. Fixtures tổng hợp kiểm tra tích hợp, không đo độ chính xác AI. [Native SQL Server2019 CI](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/38826688436) đã đạt trên commit53bda76: lint/unit/build, production audit, registry31, seed185/6 chạy lại,25SQLsuites/225tests và historical rollback/reapply. [Runner CI](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/38826688574) cũng đạt. Nhánh đã push và có PR nháp; chưa merge/deploy.

[Cách chạy test](TESTING.md) · [Bảo mật](SECURITY.md) · [Bằng chứng/artifacts](LIVE-GITHUB.md).
