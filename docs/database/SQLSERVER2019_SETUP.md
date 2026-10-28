# SQL Server local: chuẩn bị và xác nhận kết nối

## Phiên bản và cổng

Target của dự án là SQL Server 2019 hoặc bản tương thích. Máy local đã từng kiểm chứng engine major 17 với compatibility 150; điều đó khác một lần chạy native SQL Server 2019. Không dùng compatibility level để khẳng định hai engine hoàn toàn giống nhau.

Cổng TCP lấy từ cấu hình listener. Workspace hiện thường dùng 1435, không phải cổng API 8080 và không mặc định luôn 1433.

## Với database đã có

Giữ tên DB, login, dữ liệu và ba tài khoản gốc. Kiểm tra SQL service/TCP, quyền đăng nhập và `.env`. Chạy `migration:show` để xem schema trước khi quyết định có cần áp migration. Không tạo lại DB chỉ vì API lỗi.

## Với môi trường mới hoàn toàn

Quản trị viên SQL tạo database/login/user bằng credential đủ quyền. Runtime account và migration account nên có trách nhiệm riêng; runtime không cần quyền CREATE DATABASE trên master để phục vụ request hằng ngày.

Ví dụ sau chỉ mô tả bước gắn user sau khi login/DB đã được tạo đúng quy trình, không phải lệnh chạy trên database chính hiện tại:

```sql
USE [VIntern_Dev];
CREATE USER [vintern_app] FOR LOGIN [vintern_app];
-- Cấp quyền theo vai trò vận hành/migration đã chọn.
```

Sau khi cấu hình kết nối, cài dependencies local rồi chạy migrations trên đúng DB mới. Bootstrap Admin/reference seed chỉ thực hiện khi môi trường mới cần chúng; không dùng seed dữ liệu demo cho DB đang sử dụng.

## File dữ liệu phải ở đâu?

```sql
SELECT DB_NAME() AS databaseName, physical_name
FROM sys.database_files;
```

Đây là cách xác nhận MDF/LDF thực tế, thay vì suy từ nơi đặt source. `DB_FILES_ROOT` hướng dẫn tạo file DB test mới trên **máy SQL Server**. Workspace local yêu cầu đường dẫn nằm dưới thư mục dự án; SQL Database Engine cần quyền thư mục đó. Không dùng UNC/traversal hoặc fallback sang ổ khác khi path lỗi.

## TLS và quyền

Local có thể dùng encrypt=false/trustServerCertificate theo môi trường được kiểm soát. Khi dùng TLS thật phải có certificate tin cậy; không biến một lỗi cert thành việc tắt bảo vệ chung. Login chỉ có quyền DB sẽ không tạo được DB mới: đó là phân quyền bình thường, không phải lý do nâng runtime account thành sysadmin.

## Test SQL

Chọn DB riêng có tên E2E rõ ràng, đặt cả DB_NAME và E2E_DB_NAME đúng mục tiêu theo suite, kiểm tra file path rồi chạy test. Nếu runtime account không có CREATE DATABASE, nhờ quy trình tạo DB được cấp quyền hoặc dùng DB E2E đã được chuẩn bị; không chuyển test sang DB chính.

Nguồn: [data source](../../src/database/data-source.ts), [create database SQL](../../src/database/create-database-sql.ts), [TESTING](../TESTING.md).
