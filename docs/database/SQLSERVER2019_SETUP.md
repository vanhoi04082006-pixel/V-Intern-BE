# Cài đặt SQL Server

Target SQL Server2019 (major15) hoặc bản mới tương thích. Máy hiện tại là SQL Server2025 (major17), DB compatibility150; kiểm chứng local không thay nghiệm thu engine2019 thực ở CI.

Tạo database và login riêng bằng tài khoản quản trị SQL của bạn. Không hardcode sa/password trong repository. Ví dụ dùng placeholder:

~~~sql
CREATE DATABASE [VIntern_Dev];
GO
USE [VIntern_Dev];
CREATE USER [vintern_app] FOR LOGIN [vintern_app];
-- Local migration account cần DDL; production dùng runtime/migration riêng.
ALTER ROLE db_owner ADD MEMBER [vintern_app];
~~~

Login phải đã được tạo với password đủ mạnh. DB_HOST localhost, DB_PORT theo TCP listener (mặc định1433, máy hiện tại1435), DB_NAME đúng database. DB_ENCRYPT=true và certificate tin cậy ở production; trustServerCertificate chỉ dùng môi trường được kiểm soát.

Chạy npm run migration:run rồi migration:show, bootstrap:admin và seed:library. synchronize=false; không để ORM tự tạo schema hoặc chạy seed:dev khi muốn rỗng. Health kiểm tra DB, Swagger kiểm tra API sau startup.

E2E dùng tên database riêng cho từng run, explicit E2E_DB_NAME và tài khoản migration đủ quyền; không chạy destructive tests trên DB runtime. Reset local chỉ khi tên database/phạm vi đã được duyệt; không xóa các DB E2E của người khác theo wildcard.
