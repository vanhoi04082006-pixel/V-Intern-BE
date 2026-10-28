> **Cập nhật 27/10:** [kiểm thử nghiệp vụ hiện hành](../docs/BUSINESS-ACCEPTANCE-20261027.md) và [tiến độ](final-integration-execution.md). Các trạng thái ngày 24–25/10 dưới đây được giữ như lịch sử; phần billing/native/live đã có receipt mới.

# G6 — Nộp trễ, điểm trừ và thay thành viên

Theo D01–D03/T01–T03 trong [todo](todo.md). G5 đã xác minh live pending/accepted và webhook; chu trình nhận mới/mời lại thật còn chưa kiểm. Bản sửa Sprint planned đã publish và kiểm Chrome trên local. G6 được kiểm trên database disposable; chưa kích hoạt migration G6 ở hai DB native.

## Quyết định nghiệp vụ trước khi code

- Đúng hạn là thời điểm bài nộp đã được API chấp nhận và lưu nguồn hợp lệ, không phải thời điểm giảng viên chấm. Lần nộp hợp lệ đầu tiên quyết định thời hạn; yêu cầu làm lại/rút bài không tự sinh lần vi phạm thứ hai.
- Một task/một người chỉ có một incident. Bài chưa nộp quá hạn rồi nộp muộn vẫn là incident đó. Lưu snapshot hạn, bài nộp, policy version và lý do để truy nguồn.
- Mặc định: lần đầu cảnh báo, từ lần hai xét trừ điểm, từ lần ba đề xuất thay. Giảng viên cấu hình ngưỡng, mức trừ và tổng cap. Chưa cấu hình mức thì không tự trừ.
- Điểm trừ dùng thang điểm bài nộp 0–100. Khi giảng viên duyệt bài, hiển thị điểm rubric gốc, phần trừ do nộp trễ và điểm sau trừ. Không trừ vào tiền thật, không âm điểm, không sửa ngầm bài đã duyệt/kết quả đánh giá/KPI đã chốt.
- Miễn trừ/gia hạn/hoàn tác cần lý do và audit. Policy mới không tự tăng mức phạt của incident cũ. Snapshot điểm đã chốt giữ nguyên; thay đổi sau đó được ghi như lịch sử xử lý riêng.
- Replacement Advisor là Agent có runtime/tool/retrieval/trace hiện hữu, chỉ đọc bằng chứng được phân quyền. Model chỉ chọn từ ứng viên đủ điều kiện do server cung cấp; không có ứng viên thì trả rõ không có.
- Giảng viên quyết định thay người sau khi xem ảnh hưởng và ghi lý do. Không tự kick bằng điểm hoặc output Agent. Task đã hoàn thành giữ tác giả/lịch sử; task đang review chặn thay để xử lý trước; task mở được chuyển có audit và tăng version.
- Thu hồi/cấp GitHub là công việc có retry riêng sau transaction nghiệp vụ. Chỉ thu hồi quyền hệ thống đã cấp, đối chiếu các phiên/nhóm còn cần quyền, không xóa quyền bên ngoài do người khác cấp.

## Thực hiện theo lát

| Lát | Kết quả cần có | Kiểm chứng | Trạng thái |
|---|---|---|---|
| D01 | Policy, hạn hiệu lực và incident idempotent | Unit boundary, SQL cron replay/hạn mới/bài chưa nộp/chấm muộn | Đạt kiểm local/SQL; chưa native |
| D02 | Ledger điểm/cap/miễn trừ và chấm bài có điểm trước-sau | SQL đồng thời, không trừ lặp, giữ kết quả chốt; 3 ca migration giữ dữ liệu | Đạt kiểm local/SQL; chưa native |
| D03 | GV cấu hình/xử lý, SV xem bằng chứng | FE unit, RBAC; Chrome 2 vai × 5 màn hình, policy/miễn trừ/gia hạn/Escape và 403 | Đạt QA disposable; chưa native |
| T01 | Agent đề xuất đúng ứng viên/bằng chứng/scope | 817 unit tổng; 3 SQL Agent/model-tool-model/checkpoint/fresh request; foreign/no candidate | Backend đạt local; UI đi cùng T02, chưa nghiệm thu model ngoài |
| T02 | Preview và lệnh thay người có transaction | 15 SQL workflow, 3 migration; Chrome giảng viên + SV cũ/mới ở 5 độ rộng, 20 lượt | Đạt QA disposable; chưa native; quyền GitHub chờ T03 |
| T03 | Repo access outbox/reconciliation | Shared membership, chỉ quyền hệ thống cấp, 403/429/retry | Chưa làm |

Không thay migration G3–G5 đã chạy trên native. Migration G6 bổ sung, test trên SQL disposable trước; giữ cả hai DB chính và tài khoản trắng.
