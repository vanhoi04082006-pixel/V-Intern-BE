# G1 — tri thức có scope và runtime Agent bền vững

Phạm vi tiếp nối đã được người dùng yêu cầu hoàn tất ngày 24/10/2026: K04, A01–A04 và O01; O02 có bộ eval nền cho Agent G1, các Agent nghiệp vụ được chuyển dần ở G2. Không thay luật điểm, số lượt, luồng phân công hoặc tự gửi email/GitHub.

## Các lát cắt và bằng chứng bắt buộc

| Lát | Hoàn thành khi | Kiểm chứng |
|---|---|---|
| K04 retrieval | Server quyết định actor/consumer/scope; chỉ current published, lọc trước ranking; citation có code/version/hash/source; Mentor không đọc QA/solution/rubric | Unit + SQL: giả quyền, role khác, stale revision, archive, injection, ngân sách context |
| A01 khảo sát SDK | Ghim package tương thích Node 22/Nest CommonJS, tool schema/structured output chạy thật trong spike; có ADR và audit | Build + spike, npm audit, tài liệu chính thức |
| A02 registry/tools | Agent G1 có input/output/prompt/tool allowlist/budget; không cho model chọn actor/audience/SQL/shell | Unit + HTTP: tool không cho phép, giả actor, cross-user |
| A03 durable state | SQL Server lưu checkpoint/lease/tool receipt, restart/resume đúng run, concurrent worker không nhân đôi side effect | SQL và child process bị dừng giữa các bước; lease expiry/idempotency |
| A04 giới hạn/lỗi | Deadline/steps/tokens/cancel/retry hữu hạn, lỗi có mã và nguồn; không fake fallback | Timeout, invalid schema/JSON, rate limit, cancel, resume |
| O01 trace | Correlation + prompt/model/policy/knowledge revision, không password/key/raw CV; telemetry lỗi không mất run | Payload adversarial tests + trace local; LangSmith live riêng nếu đã có key |
| O02 nền G1 | Ít nhất 10 case holdout/adversarial cho Agent được đưa vào G1; rubric và báo cáo tách khỏi kiểm model thật | Offline reproducible eval và báo cáo live riêng |

## Ranh giới an toàn

Kiến thức được xem là dữ liệu trích dẫn không đáng tin để thực thi chỉ thị. Nội dung retrieval không được đổi tool allowlist, actor, quyền hay workflow. Không tự tải nguồn URL. Chặn truy vấn quá lớn, giới hạn số tài liệu và tổng context; không dùng embedding/index ngoài SQL ở mốc này.

Runtime giữ trạng thái và trace local trong SQL Server hiện có. MemorySaver chỉ dùng spike/test không chứng minh restart bền vững. Mọi mutation của tool phải có idempotency ở domain tương ứng; receipt đơn thuần không tạo bảo đảm exactly-once cho dịch vụ bên ngoài không hỗ trợ idempotency. G1 không cấp arbitrary mutation tool cho model.

Agent nghiệm thu nền dùng công cụ catalog nghề và retrieval tri thức đã duyệt, kết quả có citation và trạng thái thiếu bằng chứng. Nó cung cấp vertical slice của runtime mới; các AI cũ không tự trở thành Agent chỉ vì thêm module này. G2 chuyển từng luồng qua runtime với eval riêng.

LangSmith thiếu key không chặn code/runtime/trace local; báo rõ chưa có bằng chứng live từ dịch vụ ngoài. Không gửi credential hoặc dữ liệu cá nhân vào trace. Không mặc định bật SDK auto tracing; dùng adapter payload allowlist.

Tất cả package/cache/evidence nằm trong workspace. Nghiệm thu mutation/restart trên database riêng, không reset/seed hai DB chính hoặc các tài khoản gốc. Chỉ cập nhật checklist khi có số liệu và nguồn tương ứng.
