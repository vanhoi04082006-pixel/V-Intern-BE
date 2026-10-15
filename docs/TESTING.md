# Kiểm thử backend

Unit: npm test. Build: npm run build. Lint: npm run lint. Test provider chỉ trong test override, không có production fake-score fallback. Tests cần invariant/negative cases, không chỉ mirror implementation.

Nhóm mới kiểm tra question phases/conversation ownership/clarification races, sharing consent, GitHub crypto/parser/durable identities/batch, immutable diff/credential filtering, HMAC runner binding, rubric schema và provenance. Adapter mocks không chứng minh GitHub/runner ngoài đã vận hành.

E2E: npm run test:e2e với E2E_DB_NAME explicit dùng một lần và SQL listener đúng. Migrate toàn current registry, không hardcode baseline count. Test recruitment10turn phải gọi conversation next rồi answer; start/questions chỉ trả answered evidence. Test-only provider cần nhánh feature riêng cho question/clarification/evaluation/plan/mentor; không trả scoring cho mọi feature.

Live acceptance dùng dedicatedDB và HTTP thật, provider thật khi cấu hình. Ghi rõ lúc provider503/invalid JSON; retry trên evidence lưu, không sửa profile để giả pass. Kiểm tra eligibility, Start/draft/publish, own tasks/specs, consent/revoke/write403, mentor, reports và browser. GitHub/runner cần OAuth accounts và isolated runner thật để kiểm tra repo/PR/bài lỗi/bài đạt.

SQL local major17compat150 khác native2019. CI pin/legacy rollback baseline chỉ chứng minh baseline tương ứng, không tự bao phủ schema hiện hành. Hiện registry có31migrations; kiểm tra `migration:show` thay vì suy ra từ con số tài liệu. Không reset runtime để chạy test. Kết quả hiện tại: [kiểm chứng backend](VERIFICATION.md) và [kiểm chứng toàn hệ thống](../../docs/VERIFICATION.md).

## Các hồi quy quan trọng

- Recruitment: hội thoại10câu, tối đa2follow-up, refresh/replay/expiry, rubric sáu chiều, không lộ câu hỏi tương lai, phân quyền ứng viên.
- Planning: metadata/phụ thuộc/milestone, publish transaction, UUID thật, idempotency và chặn task trước khi tiền nhiệm Done.
- GitHub: state/PKCE/encryption, callback disconnect/reconnect/locked-user, lease/version khi refresh token, raw webhook HMAC và immutable SHA.
- Submission: reviewer scope, trusted evidence/HMAC, AI không tự Done, manual override có lý do, thông báo task và muted preference.
- Outcomes: report snapshot/scope revocation, KPI ổn định phân trang, certificate giữ identity/ngày hoàn thành sau rename, lịch sử của sinh viên hết assignment.
- Admin: bank version/retire, template edit/archive, policy AI chỉ nhận trường cho phép, không lộ secrets.

Các suite SQL dùng fixtures riêng có khóa ngẫu nhiên và kiểm tra database explicit. Test mới không được phụ thuộc việc xóa database chính hoặc tài khoản trắng. Refresh OAuth test chỉ mock HTTP provider; lease, version, token ciphertext và SQL persistence là thật. Browser và Docker smoke là gate riêng, không được thay thế bằng unit test.
