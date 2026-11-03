# Chạy và kiểm tra hệ thống local

Hướng dẫn này đưa một checkout Backend từ “chưa có gì” đến API trả dữ liệu thật. Trên máy bàn giao đã có sẵn runtime, đọc mục [Chạy trên workspace hiện tại](#6-chạy-trên-workspace-hiện-tại) trước.

## 1. Yêu cầu

| Thành phần | Phiên bản / ghi chú |
|---|---|
| Node.js | **22** (CI dùng Node 22; không có `engines` trong `package.json`) |
| npm | Đi kèm Node; dùng đúng `package-lock.json` |
| SQL Server | **2019**, kết nối TCP được từ máy chạy API |
| Database | Một DB riêng cho môi trường bạn sở hữu, có login đủ quyền |
| Frontend | `V-Intern FE` chạy tại `http://localhost:3001` (không bắt buộc để test API) |

Backend **không** tự tạo SQL Server, không tự cấp quyền login và không có mock data mặc định. Nếu DB chưa sẵn sàng, health sẽ báo lỗi thay vì trả dữ liệu giả.

## 2. Giữ tài nguyên trong workspace

Dependency, cache, log, MDF/LDF test và bằng chứng phải nằm dưới `E:\Projects\V-INTERN`. Trong **mỗi cửa sổ PowerShell** trước khi chạy npm/build/test:

```powershell
& .\scripts\Use-ProjectStorage.ps1
```

Script đặt `TEMP`, `TMP`, cache npm/Node và `DB_FILES_ROOT` vào `.runtime` của dự án. Không cài dependency global thay cho lockfile; không đưa cache/download sang ổ C.

## 3. Cấu hình

```powershell
# Chỉ chạy khi CHƯA có .env
Copy-Item .env.example .env
```

Tối thiểu cần điền:

```dotenv
NODE_ENV=development
PORT=8080

DB_HOST=localhost
DB_PORT=1435
DB_NAME=VIntern_YourDatabase
DB_USERNAME=your_login
DB_PASSWORD=your_password

JWT_SECRET=<chuỗi-ngẫu-nhiên-đủ-mạnh>
CORS_ORIGINS=http://localhost:3001
FRONTEND_ORIGIN=http://localhost:3001
```

- `DB_PORT` là cổng **SQL Server**, không phải cổng API.
- `CORS_ORIGINS` phải chứa origin chính xác của FE, gồm scheme và port.
- Không dùng giá trị mẫu/`changeme` cho `JWT_SECRET` hoặc mật khẩu.
- Thiếu cấu hình AI/GitHub/runner chỉ làm tính năng tương ứng chưa khả dụng; **không điền secret giả** để health trông tốt.

Chi tiết từng nhóm biến: [CONFIGURATION](CONFIGURATION.md).

## 4. Cài dependency và chuẩn bị database

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm ci
```

Với database **mới hoàn toàn**:

1. Tạo DB/login theo [SQL Server 2019 setup](database/SQLSERVER2019_SETUP.md).
2. Kiểm tra migration đang chờ:

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm run migration:show
```

3. Chỉ khi đã xác nhận đúng DB đích:

```powershell
npm run migration:run
npm run audit:schema
```

> `migration:run`, `migration:revert`, `seed:*` và `db:create:e2e` **thay đổi dữ liệu/schema**. Không chạy trên database bàn giao, database chính hoặc ba tài khoản trắng gốc.

Với database đang sử dụng, đọc nội dung migration trước khi áp dụng. Không sửa migration đã chạy; xem [MIGRATION_POLICY](database/MIGRATION_POLICY.md).

## 5. Chạy API

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm run start:dev
```

| Dịch vụ | Địa chỉ |
|---|---|
| API | `http://localhost:8080/api/v1` |
| Swagger | `http://localhost:8080/api/docs` |
| OpenAPI JSON | `http://localhost:8080/api/docs-json` |
| Health | `http://localhost:8080/api/v1/health` |

Bản production:

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm run build
npm start
```

`npm start` chạy `dist/main.js`; sửa source **không** tự cập nhật. `start:dev` dùng watch mode.

## 6. Chạy trên workspace hiện tại

Workspace gồm `V-INTERN-BE`, `V-Intern FE`, `manual-runtime` và `.runtime`. Dùng launcher để giữ đúng DB/cổng thay vì vô tình mở DB mặc định trong `.env`:

```powershell
& .\scripts\Use-ProjectStorage.ps1
& ..\manual-runtime\start-owned-services.ps1 -Backend -Frontend
```

| Process | Cổng | Database theo launcher |
|---|---|---|
| API chính | 8080 | `VIntern_M2_BROWSER` |
| API QA | 8081 | `VIntern_Test_Learning_20261014` |
| SQL TCP trên máy hiện tại | 1435 | Kiểm kết nối đúng instance |
| FE chính | 3001 | Trỏ API 8080 |
| FE QA | 3004 | Trỏ API 8081 |

Launcher từ chối cổng đã dùng. Muốn restart bản đang chạy, kiểm tra ownership rồi:

```powershell
& ..\manual-runtime\restart-owned-apps.ps1 -Backend
```

Script không migrate/reset DB. **Không** suy ra database đang phục vụ UI chỉ từ `DB_NAME` trong `.env`.

## 7. Xác nhận hệ thống sẵn sàng

Kiểm tra theo thứ tự, từ tầng thấp đến tầng cao:

1. **SQL sống:** health trả `database: ok` từ truy vấn thật.
2. **Swagger đúng bản:** `/api/docs` có route/DTO hiện tại.
3. **Đăng nhập:** dùng tài khoản local được bàn giao; kiểm đúng tên và vai trò.
4. **Dữ liệu thật:** mở một phiên/task đã tồn tại; so sánh góc nhìn sinh viên và giảng viên.
5. **Mutation có kiểm soát:** chỉ thử trên DB QA riêng, không dùng DB chính.

```powershell
Invoke-RestMethod http://localhost:8080/api/v1/health
```

> `ai: configured` chỉ nghĩa là có cấu hình, không chứng minh provider nhận request. Có URL runner/webhook cũng chưa chứng minh đã chấm được bài thật.

## 8. Runner chấm code

Runner là process riêng, chạy code không tin cậy trong container cách ly. Trên máy bàn giao:

```powershell
& .\scripts\Use-ProjectStorage.ps1
& ..\manual-runtime\start-grader.ps1
```

Script chỉ làm việc với distro `VIntern-Grader` thuộc dự án. Không có process giữ phiên, WSL có thể dừng dù service báo active; dùng trạng thái worker và một request chấm thật để kiểm chứng. Không sửa cấu hình WSL toàn máy để chữa triệu chứng này.

Runner cần ba giá trị khớp nhau:

| Biến | Ý nghĩa |
|---|---|
| `GRADING_RUNNER_URL` | API gọi runner |
| `GRADING_RUNNER_TOKEN` | Token xác thực request |
| `GRADING_RUNNER_SIGNING_KEY` | Khóa xác minh HMAC của kết quả |
| `GRADING_SUITES_JSON` | Suite gắn đúng template/task/spec |

Runner online **chưa đủ**: task phải có suite tương ứng mới có trusted PASS. Xem [grading-runner](architecture/grading-runner.md).

## 9. Kiểm tra trước khi commit

```powershell
& .\scripts\Use-ProjectStorage.ps1
npm run lint
npm test
npm run build
git diff --check
```

E2E cần DB riêng; đọc [TESTING](TESTING.md) trước khi chạy để không trỏ nhầm database chính.

## 10. Khi bước nào chưa thành công

| Triệu chứng | Kiểm tra trước |
|---|---|
| API không khởi động | Lỗi cấu hình đầu log, `JWT_SECRET`, SQL credential, cổng đã dùng |
| Health trả 503 | SQL service, TCP port, `DB_NAME`, quyền login |
| FE báo không kết nối | API base URL, cổng API, CORS, process thực tế |
| Đăng nhập quay lại login | Origin/cookie, API URL, trạng thái tài khoản |
| Sửa code nhưng API không đổi | Đang chạy `start:dev` hay `npm start`? |
| `CREATE DATABASE permission denied` | Login thiếu quyền; không nâng quyền runtime hoặc đổi sang DB chính |
| GitHub/AI báo chưa cấu hình | Mở đúng chương tích hợp; không sửa dữ liệu để bỏ qua |
| Runner 401 | Thiếu/sai token hoặc chữ ký; chỉ chứng minh endpoint đang bảo vệ request |

Đọc [TROUBLESHOOTING](TROUBLESHOOTING.md) để chẩn đoán theo luồng request.

## 11. Dừng và khởi động lại

- Process mở trong terminal: `Ctrl+C`.
- Process nền: kiểm tra PID, command line và cổng trước khi dừng.
- Chỉ dừng process V-Intern cần thay; **không** tắt toàn bộ Node/SQL Server.
- Sau khi build lại, restart đúng process API; health phải trả `database: ok` trở lại.
