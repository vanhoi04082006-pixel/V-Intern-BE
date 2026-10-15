# Kiểm chứng backend — 15/10/2026

Source hiện hành:70unit suites/542tests đạt, build đạt, lint0errors/15warning console có sẵn. Registry31migrations; hai runtime và DB nghiệm thu đã migrate, pending=false. Seed runtime giữ185câu/5role,6blueprint, không reset dữ liệu/tài khoản trắng.

Full SQL gate25suites/225tests đạt trong222.653giây trên VIntern_E2E_Release_20261015: xem [chứng cứ hệ thống](../../docs/VERIFICATION.md) và log manual-runtime/private/master-release-e2e.log trong workspace. Bao gồm auth/signup, recruitment/follow-up/scoring/history, ownership/consent, plan/publish/dependency, templates/admin, report scope, KPI/salary/certificates, signed webhook và token rotation.

Regression mới:13SQL tests refresh/callback (encrypted token pair, hai worker, state/version, disconnect/reconnect/locked user, identity/scope/provider errors);12SQL tests submission/review notifications và consent (PASS/FAIL/inconclusive, mute, đúng reviewer, không auto Done, revoke/expiry). GUID case normalization có test tái hiện lỗi trước sửa và sau sửa.

Gemini thật đã chấm evaluatorv3 sáu chiều93.3, lập draft4task/2milestone và trả Mentorv3 sau cập nhật policy. Fixtures ở DB nghiệm thu riêng; AI lỗi không tạo điểm/pass thay thế. Docker thật: NotesUI đúng2/2/lỗi1/2, TasksAPI đúng4/4/lỗi validation3/4/lỗi ownership3/4. CompiledBE xác minh HTTP/HMAC cùng executionTimeMs/score/checks;15runner tests đạt trên Windows và WSL.

Transport GitHub/AI/runner chỉ được mock trong automated test có ghi rõ. Chưa live repository/PR từ hai tài khoản GitHub thật; catalog trống chờ seal đúng repo/task/spec. Không coi fixture Docker hoặc SQL OAuth identity là nghiệm thu GitHub ngoài. Local SQLengine17compat150; native2019/remoteCI chưa chạy. Chưa push/merge/deploy trong tác vụ local.

[Cách chạy test](TESTING.md) · [Bảo mật](SECURITY.md) · [Bằng chứng/artifacts](../../docs/VERIFICATION.md).
