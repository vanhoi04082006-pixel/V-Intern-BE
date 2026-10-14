# Kiểm thử backend

Unit: npm test. Build: npm run build. Lint: npm run lint. Test provider chỉ trong test override, không có production fake-score fallback. Tests cần invariant/negative cases, không chỉ mirror implementation.

Nhóm mới kiểm tra question phases/conversation ownership/clarification races, sharing consent, GitHub crypto/parser/durable identities/batch, immutable diff/credential filtering, HMAC runner binding, rubric schema và provenance. Adapter mocks không chứng minh GitHub/runner ngoài đã vận hành.

E2E: npm run test:e2e với E2E_DB_NAME explicit dùng một lần và SQL listener đúng. Migrate toàn current registry, không hardcode baseline count. Test recruitment10turn phải gọi conversation next rồi answer; start/questions chỉ trả answered evidence. Test-only provider cần nhánh feature riêng cho question/clarification/evaluation/plan/mentor; không trả scoring cho mọi feature.

Live acceptance dùng dedicatedDB và HTTP thật, provider thật khi cấu hình. Ghi rõ lúc provider503/invalid JSON; retry trên evidence lưu, không sửa profile để giả pass. Kiểm tra eligibility, Start/draft/publish, own tasks/specs, consent/revoke/write403, mentor, reports và browser. GitHub/runner cần OAuth accounts và isolated runner thật để kiểm tra repo/PR/bài lỗi/bài đạt.

SQL local major17compat150 khác native2019. CI pin/legacy rollback baseline chỉ chứng minh baseline tương ứng, không tự bao phủ24migrations/features mới. Kết quả nghiệm thu hiện tại được ghi trong docs/VERIFICATION.md của workspace.
