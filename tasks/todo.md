# Theo dõi triển khai — nền tảng Agent và tuyển thực tập

> 23/10/2026 — **đã được người dùng duyệt; G0/M00 đã đạt; bắt đầu G1/M01**. Các task chỉ được tick khi có bằng chứng. Audit source/CI và lựa chọn nghiệp vụ đã ghi ở [kế hoạch](plan.md); không đánh đồng audit với nghiệm thu tính năng.

Khi thực hiện, mỗi task bổ sung cột/ngày ghi nhận: `commit FE/BE • test • expected/actual • PASS/FAIL/BLOCKED • evidence`. Chỉ tick khi đủ bằng chứng. Nhóm file là phạm vi dự kiến; tách nhỏ thêm nếu một task cần hơn khoảng 5 file.

## G0. CI hiện hành — M00

- [x] C01. Tái hiện lỗi bước 03 từ run 39901342649 trên database dùng riêng.
  - Đạt khi: xác định chính xác sai ở locator, dữ liệu fixture hay hành vi ứng dụng; có repro và log an toàn.
  - Kiểm: chạy riêng scenario work/submission/concurrency; đối chiếu DOM/API/SQL. File: FE `scripts/phase7-work-live.mjs`, các component liên quan chỉ khi chứng minh lỗi ứng dụng.
  - Bằng chứng 23/10: local dùng riêng tái hiện sai accessible name; regression đỏ chứng minh hai cảnh báo trùng và lịch sử chưa refresh. Xem [báo cáo M00](../docs/reports/ci-recovery-20261023.md).
- [x] C02. Sửa nguyên nhân, giữ kiểm concurrency 409/refetch/retry và persistence.
  - Đạt khi: assertion vẫn chứng minh hành vi cũ; không thay bằng timeout tùy tiện hoặc bỏ bước.
  - Kiểm: scenario đỏ trước/xanh sau; Node contract/lint, regression thích hợp. Phụ thuộc C01; file theo nguyên nhân.
  - Kết quả: FE `5fdf329`, 542 unit test đạt; GitHub SQL Server 2019 run `39911945067` qua bước 03. C03 vẫn mở vì pipeline dừng ở bước 05; chưa đạt toàn bộ M00.
- [x] C03. Chạy đủ 14 bước full-stack và chốt commit pair.
  - Đạt khi: quality/full-stack đều pass, không skip/continue-on-error/hạ audit.
  - Kiểm: GitHub checks + evidence của cùng FE/BE SHA; lỗi ở bước sau được tách thành bug có repro. Phụ thuộc C02; FE workflows/scripts khi có căn cứ.
  - PASS 23/10: FE `6b11d07`, BE `3989138`; quality `39922089336` và 14/14 SQL 2019 `39922089463` cùng revision. Local 83 file/544 test. Nguồn/giới hạn trong báo cáo M00.

## G1. Role, tri thức và nền tảng Agent — M01/M02/M04/M05

- [x] R01. Mô hình và migration role nghề nghiệp động.
  - Đạt khi: giữ mã 5 role cũ, tách RBAC, archive giữ tham chiếu; có rollback an toàn.
  - Kiểm: SQL E2E migration/reference. File: BE `career-roles` entity/migration/contracts; không reset DB.
  - PASS local 23/10: 5 SQL Server 2019 migration test; 625 unit BE, lint/build đạt. Chưa áp dụng DB demo, chưa chuyển consumer. [Bằng chứng R01](../docs/reports/career-roles-20261023.md).
- [ ] R02. API quản trị và chọn role hợp lệ từ dữ liệu.
  - Đạt khi: CRUD/version/status; role inactive/draft không nhận hồ sơ mới.
  - Kiểm: validation/RBAC/conflict E2E. Phụ thuộc R01; BE `career-roles` service/controller/DTO/tests.
- [ ] R03. Admin quản trị role và chuyển consumer khỏi enum cố định.
  - Đạt khi: thêm role thứ 6 từ UI; API/FE đọc được mà không sửa danh sách mã.
  - Kiểm: FE form/route và một contract test role mới. Phụ thuộc R02; tách từng consumer khi vượt 5 file.
- [ ] K01. Phiên bản và quyền kho tri thức chung.
  - Đạt khi: draft/published/archive, source, audience, purpose và revision được lưu; sửa không đổi snapshot cũ.
  - Kiểm: SQL E2E version/RBAC. Phụ thuộc R01; BE `knowledge` contracts/entity/migration/tests.
- [ ] K02. API Q&A và workflow duyệt/publish.
  - Đạt khi: có multiple valid answers, rubric, common mistakes, follow-up; conflict được báo rõ.
  - Kiểm: validation, publish/retire/rollback, import dry-run lỗi. Phụ thuộc K01; service/controller/DTO/tests.
- [ ] K03. UI thư viện với tìm/lọc, preview và lịch sử.
  - Đạt khi: quản trị viên biết mục nào Agent được dùng; trạng thái/loading/error đầy đủ.
  - Kiểm: thao tác CRUD/publish bằng browser và keyboard. Phụ thuộc K02; FE questions/knowledge API và UI.
- [ ] K04. Retrieval theo scope và nguồn.
  - Đạt khi: chỉ lấy tài liệu đã publish được phép; có ID/version/source; Mentor không đọc hidden rubric.
  - Kiểm: retrieval test đúng/sai scope, injection và stale index. Phụ thuộc K02; BE retrieval/policy/tests.
- [ ] A01. Spike LangChain/LangGraph/SDK tương thích BE.
  - Đạt khi: ghi ADR chọn version sau kiểm docs/advisory, chạy tool và structured output trên NestJS hiện tại.
  - Kiểm: Node/ESM/CommonJS/build/provider adapter; mọi package/cache trong project. File: BE adapter spike/tests/ADR/package lock.
- [ ] A02. Registry, contracts và tool permissions.
  - Đạt khi: định nghĩa Agent rõ input/output/tools/budget, actor/resource scope do server cấp.
  - Kiểm: tool cấm/giả actor/cross-user bị chặn; allowlist được kiểm ở service. Phụ thuộc A01; BE agents contracts/runtime/tests.
- [ ] A03. Durable state, leases và resume.
  - Đạt khi: restart giữa model/tool không mất run hoặc nhân đôi mutation; không dùng RAM làm persistence cuối.
  - Kiểm: process restart, concurrent workers, retry và idempotency. Phụ thuộc A02; state port/adapter/migration/tests.
- [ ] A04. Timeout, step/token budget, cancellation và lỗi có nguồn.
  - Đạt khi: vòng lặp hữu hạn, provider/schema/tool errors được phân biệt; không có fake fallback.
  - Kiểm: timeout/invalid JSON/rate limit/cancel/resume. Phụ thuộc A03; runtime middleware/tests.
- [ ] O01. LangSmith adapter và redaction.
  - Đạt khi: run có correlation/prompt/knowledge version; password, key, raw CV không xuất hiện trong trace.
  - Kiểm: trace payload tests; live trace nếu đã có key, thiếu key ghi BLOCKED cho live. Phụ thuộc A02; telemetry adapter/config/tests.
- [ ] O02. Dataset eval tách holdout và báo cáo chất lượng.
  - Đạt khi: ít nhất 10 case/Agent, có adversarial và human rubric; không lấy cùng đáp án retrieval làm toàn bộ bài eval.
  - Kiểm: offline reproducible eval; live model report riêng. Phụ thuộc K04/A04/O01; datasets/eval runner/docs.

## G2. Dự án nhỏ và chuyển toàn bộ AI — M03/M06

- [ ] P01. Schema mẫu dự án nhỏ có version và phân quyền lời giải.
  - Đạt khi: snapshot mẫu/role/task/test mapping được giữ; lời giải/hidden tests tách khỏi student view.
  - Kiểm: template validate/access/snapshot tests. Phụ thuộc K02/R02; BE templates schema/service/tests.
- [ ] P02. Bộ mẫu nhỏ và nội dung tri thức đã duyệt.
  - Đạt khi: 6 mẫu có hướng dẫn chạy, 1–2 Sprint/3–6 task; bộ Q&A đạt số lượng/chất lượng trong plan.
  - Kiểm: seed/import dry-run không ghi đè chỉnh sửa; reviewer kiểm nội dung; chia từng mẫu/bộ role thành commit.
- [ ] P03. Starter, lời giải và biến thể sai cho từng mẫu.
  - Đạt khi: lời giải pass, lỗi mẫu fail đúng test; runner chạy thật có SHA/evidence.
  - Kiểm: từng test suite và browser demo tương ứng. Phụ thuộc P01/P02; test fixtures/grading suite/template assets.
- [ ] P04. UI thư viện và tạo phiên từ mẫu.
  - Đạt khi: scan nhanh mục tiêu/phạm vi/role/thời gian, preview task; tạo phiên đúng snapshot.
  - Kiểm: giảng viên tạo phiên mới, sinh viên đọc đúng đề. Phụ thuộc P03; FE template API/library/start flow.
- [ ] G01. Chuyển conversation, clarification, follow-up sang Interview Agent.
  - Đạt khi: giữ giới hạn câu hỏi/quyền/timeout, không lộ đáp án; có tool/retrieval run.
  - Kiểm: conversation regression + bộ eval. Phụ thuộc K04/A04; tách từng chức năng thành lát nhỏ.
- [ ] G02. Chuyển chấm phỏng vấn sang Evaluator Agent.
  - Đạt khi: rubric/snapshot có nguồn; BE vẫn tính điểm và quyết định.
  - Kiểm: 49.9/50/70/70.1, malformed output, retry không chấm trùng. Phụ thuộc G01; recruitment evaluator/agent/tests.
- [ ] G03. Chuyển sinh Sprint/Task sang Planner Agent.
  - Đạt khi: draft đúng role/ngày/dependency; giảng viên duyệt mới công bố.
  - Kiểm: generation schema/repair, plan publish và mẫu nhỏ. Phụ thuộc P03/A04; ai-generation/planner/tests.
- [ ] G04. Chuyển Code Review sang Reviewer Agent.
  - Đạt khi: lấy đúng SHA, gọi/đọc runner thật; không nhận chỉ thị từ comment/source để sửa kết quả.
  - Kiểm: bài sai→rework→nộp lại→đúng, SHA changed, runner unavailable. Phụ thuộc P03/A04; code-review/agent/tests.
- [ ] G05. Chuyển Mentor sang Agent dùng tri thức đúng quyền.
  - Đạt khi: hội thoại và context chính chủ giữ được, không lộ private answer/test/CV.
  - Kiểm: persistence, foreign resource, adversarial retrieval, timeout. Phụ thuộc K04/A04; ai/mentor/agent/tests.
- [ ] G06. Chuyển recommendations và hỗ trợ đánh giá sang Agent riêng.
  - Đạt khi: nguồn metric có version; không tự sửa KPI/điểm/finalize.
  - Kiểm: source hash, stale data, quyền giảng viên và human approval. Phụ thuộc A04/K04; chia mỗi Agent thành commit/tests riêng.
- [ ] G07. Hoàn tất đối chiếu mọi feature AI với registry/eval.
  - Đạt khi: không sót feature cũ; dashboard chỉ rõ Agent/version/run, không chỉ đổi nhãn.
  - Kiểm: feature inventory→run matrix và baseline comparison. Phụ thuộc G01–G06/O02.

## G3. CV, mail và lịch — M07/M08/M09/M10

- [ ] E01. Outbox, mail transport và delivery receipt.
  - Đạt khi: queue bền vững, scheduled send, retry/cooldown/dead-letter; timeout không đánh dấu sent giả.
  - Kiểm: transport fake + SMTP dev; gửi thật riêng khi cấu hình. File: BE communications contracts/entity/migration/worker/tests.
- [ ] E02. Template email V-Intern và notification renderer.
  - Đạt khi: HTML/text, mobile, subject/CTA rõ, template variables được encode và link allowlist.
  - Kiểm: snapshot nội dung + preview ở desktop/mobile. Phụ thuộc E01; templates/render/tests.
- [ ] E03. Admin preview, trạng thái gửi và gửi lại.
  - Đạt khi: phân quyền rõ, lỗi có thể xử lý, không lộ credential; resend không đổi mật khẩu ngầm.
  - Kiểm: UI success/error/disabled/cooldown, bấm đôi. Phụ thuộc E02; FE communication API/UI/tests.
- [ ] V01. Nộp hồ sơ công khai theo đợt và xác minh email.
  - Đạt khi: chưa có tài khoản vẫn nộp được; đúng đợt, chống trùng/spam, token xác minh một lần.
  - Kiểm: invalid/duplicate email, token expiry/replay, consent. Phụ thuộc E01; chia API/schema và FE thành lát kế tiếp.
- [ ] V02. Lưu và đọc CV an toàn.
  - Đạt khi: PDF/DOCX hợp lệ đọc được; quá giới hạn/MIME giả/bomb bị chặn; scan báo cần bổ sung.
  - Kiểm: parser fixture an toàn và giới hạn tài nguyên; không đưa file test độc hại thực lên DB chính. Phụ thuộc V01.
- [ ] V03. Theo dõi hồ sơ/bổ sung và quyền giảng viên/Admin.
  - Đạt khi: timeline, trạng thái phân tích, xem/bổ sung có kiểm quyền; không lộ CV người khác.
  - Kiểm: cross-candidate IDOR, upload retry và empty/error. Phụ thuộc V02; FE applications/detail + BE query.
- [ ] V04. CV Analyst Agent và Role Matcher Agent.
  - Đạt khi: facts kèm đoạn/trang, role đang tuyển, missing skills/confidence; thiếu thông tin không bịa.
  - Kiểm: CV phù hợp/lệch/ít thông tin/injection; role thứ 6 và archived role. Phụ thuộc K04/A04/V02/R03; chia hai Agent riêng.
- [ ] S01. Quản trị đợt tuyển và slot/capacity/timezone.
  - Đạt khi: mở/đóng slot hợp lệ; role sẵn sàng; không nhận lịch đã qua hoặc thiếu chuẩn bị.
  - Kiểm: date/time/capacity validation, ownership. Phụ thuộc R02; BE contracts/migration/service/tests rồi FE.
- [ ] S02. Coordinator Agent đặt lịch tự động.
  - Đạt khi: chỉ dùng slot đã mở, transaction không overbook, hết slot vào waitlist.
  - Kiểm: hai ứng viên tranh chỗ cuối, retry/replay/cancel. Phụ thuộc V04/S01/A04.
- [ ] S03. Tài khoản mới và credential tạm.
  - Đạt khi: email xác minh; hash password, TTL/force change; tài khoản cũ không reset ngầm.
  - Kiểm: first login/change/expiry, existing identity, credential redaction. Phụ thuộc V01; auth/users migration/service/tests chia nhỏ.
- [ ] S04. Hai email theo lịch và recovery.
  - Đạt khi: lịch và quyền đăng nhập là hai mail riêng; gửi đúng mốc; sửa lịch không gửi job cũ.
  - Kiểm: fake clock, cancel/reschedule, SMTP timeout, duplicate worker; inbox thật khi cấu hình. Phụ thuộc E02/S02/S03.

## G4. Phỏng vấn theo lịch — M11

- [ ] I01. Gate start theo booking và role phía BE.
  - Đạt khi: không chọn role tùy ý; trước giờ chỉ chờ; role gửi giả bị từ chối.
  - Kiểm: API auth/booking/role, direct URL bypass. Phụ thuộc G02/S04.
- [ ] I02. No-show tại T+15:00 và resume session.
  - Đạt khi: T+14:59 được bắt đầu, T+15:00 không; đã bắt đầu không bị cron loại; giữ CV/lượt.
  - Kiểm: fake clock, concurrency start/no-show, restart/mất mạng và override có audit. Phụ thuộc I01.
- [ ] I03. UI phòng chờ/phỏng vấn/kết quả và lịch phỏng vấn lại.
  - Đạt khi: role có sẵn; thời gian rõ; 50–70 có gợi ý có bằng chứng; không vượt 3 lượt.
  - Kiểm: browser đúng giờ/muộn/còn lượt/hết lượt, boundary scores. Phụ thuộc I02; FE onboarding/API/tests chia từng trang.

## G5. GitHub — M12

- [ ] H01. Invitation state và đối chiếu collaborator thật.
  - Đạt khi: tách pending/accepted/expired/failed/not_connected; lưu invitation ID và timestamp; bám numeric user ID.
  - Kiểm: GitHub contract 201/204/403/404/rate limit và identity mismatch. File: BE github contracts/migration/service/tests.
- [ ] H02. Mời lại từng người và batch có giới hạn.
  - Đạt khi: pending không tạo trùng, accepted không spam, expired/lỗi có recovery; cooldown và audit.
  - Kiểm: double-click/concurrency/token đổi/owner đổi/invite hết hạn. Phụ thuộc H01.
- [ ] H03. Email/in-app theo chủ đề và UI nhận/mời lại.
  - Đạt khi: đúng phiên/project/repo/người nhận; CTA chính xác; role sinh viên không tự mời người khác.
  - Kiểm: preview + FE/RBAC + SMTP live riêng; ghi rõ email native GitHub không tùy biến. Phụ thuộc H02/E02.
- [ ] H04. Webhook live và đường đối chiếu khi mất event.
  - Đạt khi: HTTPS giới hạn route, HMAC, dedup, repo scope; có delivery GitHub thật và sự kiện BE.
  - Kiểm: unsigned/wrong repo/replay và live ping/event; không coi E2E ký tay là live. Phụ thuộc H01; cấu hình endpoint riêng, không mở API toàn bộ.

## G6. Nộp trễ và thay thế — M13/M14

- [ ] D01. Policy, incident và cách xác định nộp trễ.
  - Đạt khi: so timestamp bài nộp hợp lệ với hạn; task chưa nộp/nộp sau đó chỉ một incident; chấm muộn không phạt.
  - Kiểm: boundary dueDate, cron replay, version hạn và submission. File: BE participation schema/migration/rules/tests.
- [ ] D02. Cảnh báo và điểm trừ có hoàn tác.
  - Đạt khi: ngưỡng cấu hình, penalty cap; chưa đặt mức thì không tự trừ; miễn trừ/gia hạn/reversal có audit.
  - Kiểm: lần 1/2/3, duplicate job, policy đổi không hồi tố kết quả đã chốt. Phụ thuộc D01/E01.
- [ ] D03. UI chính sách và bằng chứng vi phạm.
  - Đạt khi: GV cấu hình; SV biết lý do/điểm trước sau; không lẫn tiền thật với điểm/lương ảo.
  - Kiểm: permission/validation/a11y và workflow miễn trừ. Phụ thuộc D02; FE policy/incident API/UI.
- [ ] T01. Replacement Advisor Agent và danh sách ứng viên đủ điều kiện.
  - Đạt khi: bằng chứng vi phạm, role, workload và eligibility; không có người thay thì nói rõ.
  - Kiểm: ứng viên đã bận/không đạt/khác role, scope CV và injection. Phụ thuộc V04/D02/A04.
- [ ] T02. Giảng viên duyệt loại/thay và phân công task.
  - Đạt khi: preview ảnh hưởng; quyết định có lý do; không xóa lịch sử; chống hai GV thay trùng.
  - Kiểm: transaction/concurrency, task đang review/đã chốt, assignment snapshots. Phụ thuộc T01; BE domain command/tests rồi FE confirm.
- [ ] T03. Thu hồi/cấp quyền repo khi thay người.
  - Đạt khi: chỉ quyền hệ thống cấp, không ảnh hưởng vai trò/phiên khác; lỗi GitHub có recovery.
  - Kiểm: shared membership, remote 403/rate limit, worker retry và reconciliation. Phụ thuộc T02/H02.

## G7. Nghiệm thu và bàn giao — M15

- [ ] Q01. Đóng vai ứng viên mới và giảng viên đi hết hành trình.
  - Đạt khi: CV→email→lịch→phỏng vấn→phân công→repo→PR→chấm/sửa→kết quả; có case chưa đạt, muộn, mời lại, thay người.
  - Kiểm: browser/API/SQL/runner/mail/GitHub evidence đúng loại; dùng QA, không tiêu hao tài khoản trắng.
- [ ] Q02. Chạy regression và UI đa kích thước.
  - Đạt khi: FE lint/typecheck/unit/build/audit, BE unit/SQL E2E, full-stack CI pass; keyboard/mobile không mất luồng.
  - Kiểm: một commit pair có đủ nguồn số liệu; không làm nhẹ gate. Phụ thuộc mọi task tính năng.
- [ ] Q03. Viết lại tài liệu bàn giao cho người dùng và kỹ thuật.
  - Đạt khi: README có đường đọc, sơ đồ, ví dụ, cấu hình, xử lý lỗi, demo; giải thích Agent/tri thức/lịch/trễ/GitHub từng phần.
  - Kiểm: link checker, đọc thử theo persona mới, đối chiếu code/config/runtime; không có secret. Cập nhật theo từng mốc, không đợi cuối mới viết.
- [ ] Q04. Publish và chốt ma trận nghiệm thu.
  - Đạt khi: remote HEAD khớp local, PR/docs/evidence có link; commit pair xanh; giới hạn và phần blocked được nêu rõ.
  - Kiểm: `git status`, remote refs, GitHub checks và ma trận expected/actual. Không merge khi chưa đạt gate.

## Checkpoint bắt buộc

- [ ] G0: CI FE cùng SHA xanh đầy đủ.
- [ ] G1: role động + retrieval scope + Agent tool/state/trace được chứng minh.
- [ ] G2: nội dung/mẫu nhỏ được kiểm; toàn bộ AI cũ đã map và regression.
- [ ] G3: CV→role→slot→hai email, đúng identity và không trùng tác dụng phụ.
- [ ] G4: lịch, mốc 15 phút, 3 lượt và ranh giới 50/70 đạt.
- [ ] G5: mời/nhận/mời lại GitHub, branded mail và webhook live đạt hoặc ghi BLOCKED rõ.
- [ ] G6: policy đúng và giảng viên tự quyết thay người; dữ liệu/quyền repo giữ nhất quán.
- [ ] G7: tài liệu có nguồn, demo hai vai, code/doc đã push, CI/evidence cùng commit pair.
