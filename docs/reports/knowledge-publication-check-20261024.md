# K03 — kiểm bản đã lưu trước khi xuất bản · 24/10/2026

Endpoint mới `GET /api/v1/admin/knowledge/:code/publication-check` hỗ trợ UI duyệt tài liệu với đúng validator của backend. Kết quả gồm version, trạng thái, SHA-256, điều kiện xuất bản và lý do chưa đạt. Endpoint không ghi dữ liệu và không yêu cầu quyền quản lý; vẫn yêu cầu Admin hiệu lực và quyền đọc. Import dry-run giữ nguyên quyền quản lý.

## Kiểm chứng local

Nguồn log: `workspace/manual-runtime/knowledge-library-20261024/`. Ngày báo cáo theo Asia/Bangkok; không suy luận thời điểm từ đồng hồ máy host.

| Kiểm tra | Kết quả | Nguồn |
|---|---|---|
| Unit BE | 80 suite / 669 test đạt | `be-unit.log` |
| Lint và build | Đạt; warning console có sẵn giữ nguyên | `be-lint.log`, `be-build.log` |
| SQL/HTTP thật | 23/23 đạt trên DB SQL Server 2019 dùng riêng để thử | `publication-check-green.log` |
| RED trước nối endpoint | 22 đạt / 1 thất bại vì route chưa tồn tại | `publication-check-red.log` |

Case mới xác nhận 401 khi chưa đăng nhập, 403 với non-admin kể cả được cấp permission, Admin chỉ có quyền đọc có thể kiểm bản đã lưu, import vẫn bị chặn nếu thiếu manage. QA chưa đủ trả lý do; số entry/revision không thay đổi. 22 case nền tiếp tục đạt trong cùng lượt chạy.

Đây là bằng chứng backend local. Chưa dùng báo cáo này để kết luận browser K03, retrieval K04 hoặc toàn bộ Agent đã hoàn thành. Không đổi migration, không reset/seed database chính. [Hướng dẫn thao tác](../KNOWLEDGE-LIBRARY.md).
