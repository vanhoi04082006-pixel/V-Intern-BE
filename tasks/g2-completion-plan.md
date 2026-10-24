# G2 — hoàn tất một mạch: mẫu nhỏ, UI và các Agent nghiệp vụ

Người dùng yêu cầu hoàn thành toàn bộ G2 ngày 24/10/2026. P01/P02 đã có bằng chứng; đây là kế hoạch nối tiếp, không thay kế hoạch G0–G7 trong plan.md. Local trước; không reset DB, không sửa ba tài khoản trắng; mọi runtime/cache/evidence dưới workspace.

| Lát cắt | Đầu ra hoàn chỉnh | Nghiệm thu bắt buộc | Trạng thái |
|---|---|---|---|
| P03a | Sáu lời giải, hidden behavioral checks, mỗi bài ít nhất hai faulty variant | Correct pass; starter và faulty fail đúng check; kiểm boundary/immutability, không gọi test công khai là hidden receipt | Đạt |
| P03b | Adapter module Node trong sandbox hiện có; catalog seal theo repository/task/spec hash/image digest | Docker chạy thật cả 6 đúng và các biến thể sai; chữ ký/nonce/SHA/scope giữ nguyên; BE không chạy submission trên host | Đạt |
| P04a | FE parse package/revision/assessment đúng schema; preview và tải public files | Parser reject payload lỗi; legacy không package vẫn dùng được; không execute nội dung | Đạt |
| P04b | Admin soạn public/private riêng, xem version/conflict; giảng viên đọc gói; sinh viên tải gói đã ghim | Component/API tests; browser trên DB disposable, staff/intern scope, responsive/keyboard, không lộ đáp án | Đạt |
| A01 | Registry 7 Agent: Interviewer, Evaluator, Planner, Reviewer, Mentor, Advisor, Instructor assistant | Mọi feature AI hiện hữu map đúng; model chọn tool/query có giới hạn, dữ liệu không cấp quyền | Đạt |
| A02 | LangGraph workflow, context/retrieval có scope, durable receipt/checkpoint/cache result và provenance | SQL restart/retry/revocation/IDOR/budget/provider-failure; không gọi raw model thay Agent âm thầm | Đạt |
| A03 | Nối mọi luồng cũ qua Agent; giữ validator, điểm 50/70, 3 lượt, quyết định giảng viên | Toàn bộ regression cũ + holdout từng Agent; public API contract giữ nguyên | Đạt |
| A04 | 18 tri thức có phiên bản được kiểm/duyệt; trace/eval/model thực | Retrieval đúng consumer; live Gemini + LangSmith đọc lại; ghi model/latency thật, không raw PII/secret | Đạt |
| G2-final | Bàn giao FE/BE, CI đúng source SHA, runtime local và nhập vai | CI BE + FE gate gốc, Docker/provider/browser tách bằng chứng; docs/source push GitHub | Đạt |

## Quyết định kiến trúc và giới hạn

- Tái dùng SQL Server, AgentStateStore/checkpointer và provider Gemini hiện có. Domain service tiếp tục sở hữu transaction và quyết định; tools của G2 chỉ đọc, không tự duyệt điểm/kick/gửi email.
- Giữ một facade AI, thêm orchestration có registry; không tạo vòng import giữa AiModule và AgentsModule. Context scope do server xác lập theo resource và actor thật, không nhận role/permission từ model.
- Checkpoint business giữ hash context và nguồn đã đọc. Khi domain retry sau restart, context/validator được dựng lại và phải khớp hash trước khi resume; kết quả đã hoàn tất được dùng lại, không tự lặp tác dụng phụ của domain.
- P03 khai thác runner hai container hiện có, không chạy file của sinh viên trong API. Lời giải bundled phục vụ học/demonstration không phải bí mật nếu repository public; private API vẫn bảo vệ nội dung theo quyền. Hidden check có giá trị thi thật phải được operator quản lý ngoài repo công khai.
- P04 bám design system hiện tại, text preview an toàn và tải file có xác nhận rõ public/private. Không thêm package upload/extraction hay auth flow mới ngoài phạm vi.
- G3–G6 (CV/email/lịch/GitHub lifecycle/kỷ luật/thay người) không được ghi hoàn tất từ bằng chứng G2.

## Thứ tự và checkpoint

1. P03a → kiểm focused; P03b → Docker thật và unit runner.
2. P04a → parser/component tests; P04b → browser thật sau API/schema ổn định.
3. A01/A02 → focused + SQL; A03 → regression toàn bộ; A04 → live/eval.
4. G2-final → code review, CI, activate local không reset, docs có source và mốc thời gian, push.

Mỗi lát cắt lưu commit riêng. Phát hiện lỗi thì giữ log đỏ, sửa nguyên nhân và kiểm lại; không skip test/nới assertion/giảm audit để đóng gate. Bảng này chỉ đánh dấu đạt sau bằng chứng tương ứng.

## Nghiệm thu cuối 24/10/2026

BE bb67573 / FE 958691a: CI release, runner, quality và full-stack đều success. Admin dashboard G07 bổ sung registry/version/run/model, lọc và metadata-only. Local giữ dữ liệu/tài khoản; xem [báo cáo G2](../docs/reports/g2-completion-20261024.md) cho số liệu, artifact, source và giới hạn. G3–G7 chưa được tick từ chứng cứ này.
