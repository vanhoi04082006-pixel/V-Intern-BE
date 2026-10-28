# Chạy và kiểm tra hệ thống local

## 1. Kiểm tra những thứ đã có

Workspace trên máy này gồm `V-INTERN-BE`, `V-INTERN FE`, `manual-runtime` và `.runtime`. SQL Server, Windows và Node được cài sẵn là công cụ dùng chung; không di chuyển chúng như một phần dọn dẹp dự án.

Trước khi cài dependency, build hoặc chạy test trong mỗi cửa sổ PowerShell:

```powershell
& .\scripts\Use-ProjectStorage.ps1
```

Script đưa cache và file tạm của npm/Node/công cụ kiểm thử vào dự án. Cài dependency bằng `npm ci` trong từng repository khi cần; không dùng bản cài global thay cho dependency trong lockfile.

## 2. Chuẩn bị cấu hình

Nếu `.env` đã có, giữ lại và đối chiếu tên biến với `.env.example`. Nếu đây là checkout mới, sao chép mẫu rồi nhập giá trị thật tại máy. Không ghi đè cấu hình đang chạy.

```powershell
# Chạy tại thư mục gốc repository Backend
# Chỉ dùng khi CHƯA có .env:
Copy-Item .env.example .env
```

Các giá trị tối thiểu: host/cổng/tên database, tài khoản SQL, `JWT_SECRET` đủ mạnh, cổng API và CORS của FE. [CONFIGURATION](CONFIGURATION.md) giải thích từng nhóm. Thiếu AI/GitHub/runner chỉ làm các tính năng tương ứng chưa khả dụng; không nên điền secret giả để làm health trông tốt.

## 3. Kết nối database đúng nơi

Máy hiện tại thường dùng SQL TCP 1435; đừng mặc định 1433 nếu `.env` ghi khác. Dùng database chính hiện có và giữ nguyên tài khoản gốc. Không chạy `seed:dev`, reset hoặc tạo lại DB để mở giao diện.

Với database mới hoàn toàn, quản trị viên tạo DB/login trước rồi mới chạy migration. Với database đang sử dụng, kiểm tra migration pending và đọc nội dung migration trước khi áp dụng:

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm run migration:show
```

`migration:run` là thao tác đổi schema; chỉ chạy trên database được chọn đúng. Hướng dẫn tạo mới và kiểm tra đường dẫn MDF/LDF ở [SQL Server](database/SQLSERVER2019_SETUP.md).

## 4. Khởi động hai process

**Workspace hiện có:** dùng launcher giữ đúng DB/cổng, thay vì vô tình mở DB mặc định trong `.env`. Khi các process đã dừng và build sẵn:

```powershell
& .\scripts\Use-ProjectStorage.ps1
& ..\manual-runtime\start-owned-services.ps1 -Backend -Frontend
```

Launcher chính: 8080 → `VIntern_M2_BROWSER`, 8081 → `VIntern_Test_Learning_20261014`, FE chính 3001. FE dev QA 3004 có launcher riêng. Script từ chối cổng đã dùng. Muốn restart bản đang chạy, kiểm tra ownership rồi dùng `restart-owned-apps.ps1` với cờ đúng process; script không migrate/reset DB.

**Checkout phát triển thông thường:** các lệnh sau đọc `.env` trực tiếp. Xác nhận DB_NAME/API base URL trước khi chạy; không mặc định đây là cùng DB của launcher trên máy hiện tại.

Cửa sổ API:

```powershell
# Chạy tại thư mục gốc repository Backend
& .\scripts\Use-ProjectStorage.ps1
npm run start:dev
```

Cửa sổ frontend:

```powershell
# Chạy tại thư mục gốc repository Frontend
& .\scripts\Use-ProjectStorage.ps1
npm run dev
```

Trước đó kiểm tra cổng đang có process hay chưa. Bản FE chạy bằng `next start` dùng bản build đã tạo; sửa source không tự cập nhật bản này. Sau khi build thành công cần khởi động lại đúng process FE. Bản `next dev` có cập nhật khi sửa source; không chạy hai dev process dùng chung thư mục build.

## 5. Xác nhận hệ thống sẵn sàng

1. Mở `/api/v1/health`: `database: ok` phải đến từ truy vấn SQL thật.
2. Mở `/api/docs`: xem danh sách API và DTO của bản đang chạy.
3. Mở FE, đăng nhập một tài khoản local hiện có.
4. Kiểm tra đúng tên người dùng và vai trò trước khi thao tác.
5. Mở một phiên hoặc nhiệm vụ đã tồn tại; đối chiếu giữa sinh viên và giảng viên.

`ai: configured` chỉ cho biết có cấu hình, chưa chứng minh nhà cung cấp nhận được request. Tương tự, có URL runner hoặc webhook chưa có nghĩa đã chấm được bài thật.

## Dừng và khởi động lại

Process mở trong terminal có thể dừng bằng Ctrl+C. Process chạy nền phải kiểm tra PID, command line và cổng trước khi dừng. Chỉ dừng process của V-Intern cần thay; không dùng lệnh tắt toàn bộ Node/SQL Server.

## Khi bước nào chưa thành công

| Triệu chứng | Kiểm tra trước |
|---|---|
| API không khởi động | Lỗi cấu hình đầu log, JWT/SQL credential, cổng đã dùng |
| Health trả 503 | SQL service, TCP port, DB_NAME và quyền login |
| FE báo không kết nối | API base URL, cổng API, CORS và process thực tế |
| Đăng nhập liên tục quay lại login | Origin/cookie, API URL và trạng thái tài khoản |
| Sửa UI nhưng chưa thấy thay đổi | Đang xem `dev` hay bản build `start`? |
| GitHub/AI báo chưa cấu hình | Mở đúng chương tích hợp, không sửa dữ liệu để bỏ qua |

Đọc [TROUBLESHOOTING](TROUBLESHOOTING.md) để chẩn đoán theo luồng request.

## Runner và môi trường QA trên máy bàn giao

Sau khi API/FE sẵn sàng, chạy worker riêng:

```powershell
& .\scripts\Use-ProjectStorage.ps1
& ..\manual-runtime\start-grader.ps1
```

Script chỉ làm việc với distro `VIntern-Grader` thuộc dự án: khởi động Docker/worker và giữ một process WSL ẩn. Không có process giữ phiên, WSL có thể dừng dù service đã báo active. Không sửa cấu hình WSL toàn máy để chữa triệu chứng này. Dùng trạng thái worker và một request chấm thực tế để kiểm chứng; phản hồi 401 khi thiếu chữ ký chỉ chứng minh endpoint đang bảo vệ request.

QA frontend dùng `manual-runtime/start-qa-frontend.cjs` tại cổng 3004, API 8081. Launcher `validation-runtime.cjs` đặt riêng ba giá trị:

| Cấu hình | Giá trị local QA |
|---|---|
| GITHUB_CALLBACK_URL | http://localhost:8081/api/v1/github/callback |
| FRONTEND_ORIGIN | http://localhost:3004 |
| CERTIFICATE_VERIFY_BASE_URL | http://localhost:8081/api/v1/certificates/verify |

Sai callback/origin có thể đưa người dùng về môi trường khác sau OAuth; sai verify URL khiến PDF QA tìm chứng nhận ở database chính. Chỉnh launcher của môi trường tương ứng và restart API, không đổi identity hoặc sao chép record chứng nhận giữa database.

Khi máy thiếu RAM, có thể tạm dừng các process QA/worker đã xác minh sở hữu để chạy E2E. Chỉ dùng database E2E mới, giữ nguyên assertion và timeout. Sau đó khởi động lại môi trường và chạy readiness; không để runtime dừng khi bàn giao.
