# M02 — Tiến độ kho tri thức · 23/10/2026

**Nền lưu trữ K01 đã đạt local; đang hoàn thiện workflow K02.** Schema, metadata/phân loại, bản nháp, lịch sử bất biến, hash, transaction và quyền Admin đã có. Chưa có API/UI publish hoặc retrieval; chưa gọi đây là Agent đã được nuôi tri thức. Hai database demo chưa nhận migration M02.

Đặc tả: [SPEC-knowledge-library](../../SPEC-knowledge-library.md). Checklist: [K01–K04](../../tasks/todo.md).

| Mốc code | Phạm vi |
|---|---|
| `99f5fae` | Hợp đồng, policy, snapshot, entity, migration/index/constraint/trigger |
| `1faba2b` | Dịch vụ nội bộ Admin, lưu draft/history và kiểm thử SQL |

## Kiểm chứng local có nguồn

Log nằm trong `workspace/manual-runtime/ci-recovery-20261023/`; các lượt chạy dưới đây tách biệt, không cộng thành một tổng E2E duy nhất.

| Kiểm tra | Kết quả | Nguồn |
|---|---|---|
| Unit BE toàn bộ | 79 suite / 654 test đạt; gồm 25 case policy mới | `knowledge-k01-final-unit.log` |
| Lint/build | 0 lỗi lint, 15 warning console cũ; Nest build đạt | `knowledge-k01-final-lint.log`, `knowledge-k01-final-build.log` |
| SQL K01 | 11/11 đạt trên SQL Server 2019, DB disposable | `knowledge-k01-storage-final.log` |
| Hồi quy M01 | 5 suite / 47 test đạt: catalog, tuyển dụng, đăng ký, câu hỏi, template | `knowledge-k01-career-regression.log` |

SQL xác nhận: schema không seed nội dung; down/up khi rỗng giữ số tài khoản/nghề/buổi phỏng vấn; non-admin không đọc/ghi/history; sửa và tạo trùng có một kết quả thành công + một conflict; audit không chứa nội dung; audit lỗi thì cả current/revision rollback; trigger chặn sửa/xóa revision; down từ chối mất dữ liệu; thu hồi role có hiệu lực ở lời gọi kế tiếp. Đây là kiểm thử dịch vụ với RBAC/SQL thật, chưa phải kiểm HTTP/browser.

Unit kiểm metadata, JSON không hợp lệ/cyclic/quá sâu/quá lớn, nguồn HTTPS không có user/password, phân loại tài liệu chấm và hash ổn định. Log đỏ policy/schema được giữ để đối chiếu; helper local được sửa đúng thư mục đăng ký ts-node, không đổi cấu hình sản phẩm.

## Những phần chưa được nghiệm thu

- K01 mới kiểm nền lưu trữ/quyền và draft; chu trình publish/archive/restore được đóng cùng K02, chưa tick toàn bộ chỉ vì đã tạo bảng.
- K02: API/permission HTTP, validation Q&A với nhiều đáp án đúng, rubric có trọng số, duyệt/publish/retire/restore, dry-run import.
- K03: UI tìm/lọc, preview, editor và lịch sử.
- K04: lọc quyền trước ranking, citation ID/version/source, bảo vệ Mentor khỏi rubric, stale-index và injection tests.
- Chưa nhập/publish bộ 144 Q&A hoặc các tình huống theo Agent; không tự sinh hàng loạt nội dung để đủ số.
- CI mới phải gắn revision và kết quả thật sau push; CI M01 không chứng minh M02.
