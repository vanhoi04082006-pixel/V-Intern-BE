# Chính sách migration

Migrations1–21 là lịch sử đã có; không viết lại migration đã áp dụng. Thay đổi schema mới dùng migration additive, đăng ký data-source.ts và kiểm tra freshDB + upgradeDB + pending=false. synchronize luôn false.

Ba migration mới: CreateSessionSharing1761686400000, CreateInterviewConversation1761772800000, CreateGithubDelivery1761859200000. Schema đầy đủ hiện24migrations. Tài liệu/count không phải authority; CLI và TypeORM configuration là nguồn thật.

Chạy bằng account migration với quyền DDL, không dùng user/application connection để CREATE DATABASE nếu user đó không có quyền. Tách cấp quyền server/database. TypeORM runMigrations transaction:'all' đảm bảo migration không để schema nửa chừng khi SQL hỗ trợ.

Đọc down trước rollback. GitHub delivery down từ chối khi có lịch sử submission withdrawn vì constraint cũ không biểu diễn được trạng thái này; không tự xóa lịch sử để revert. Backup/restore hoặc forward fix theo quy trình vận hành; không dùng revert như reset dữ liệu nghiệp vụ.

Reset local được duyệt là operation riêng ngoài migrations: dừng API, xác nhận DB cụ thể, tạo lại, migrate/bootstrap/reference seed và kiểm tra counts. Không xóa DB từ tên tính toán không kiểm tra, không phá production hoặc bỏ test để giữ green.

Fresh schema đã chạy trên SQL Server17compat150 trong kiểm tra local14/10/2026; native2019 vẫn là gate deployment riêng.
