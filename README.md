# V-Intern Backend

Chuẩn bị bảo vệ: **[kịch bản ngắn](docs/DEMO-CHECKLIST.md)** · [hướng dẫn demo từng bước](docs/DEMO-GUIDE.md) · [nghiệm thu hai vai trò](docs/ROLEPLAY-ACCEPTANCE.md). Thông tin đăng nhập được bàn giao riêng.

API cho hệ thống thực tập theo dự án: tuyển dụng bằng hội thoại, phân công theo phiên, kế hoạch Sprint, nhiệm vụ và bài nộp, GitHub/code review, đánh giá, KPI, lương ảo, chứng nhận và báo cáo.

**[Bắt đầu với bộ bàn giao Backend](docs/HANDOVER.md)**. Tài liệu giải thích luồng bằng ví dụ, sơ đồ, bảng điều kiện và liên kết tới từng module. [Mục lục toàn bộ tài liệu](docs/README.md) dùng khi cần đào sâu.

## Những tài liệu nên đọc trước

| Bạn cần | Tài liệu |
|---|---|
| Hiểu sản phẩm và thuật ngữ | [START-HERE](docs/START-HERE.md) |
| Thử một kỳ thực tập | [USER-JOURNEYS](docs/USER-JOURNEYS.md) |
| Chạy đúng môi trường local | [LOCAL-DEVELOPMENT](docs/LOCAL-DEVELOPMENT.md) |
| Cấu hình AI/GitHub/SQL/runner | [CONFIGURATION](docs/CONFIGURATION.md) |
| Tìm file để sửa | [CODE-MAP](docs/CODE-MAP.md) |
| Hiểu đầu vào, đầu ra HTTP | [API guide](docs/api/README.md), [routes](docs/api/ROUTES.md), [schemas](docs/api/SCHEMAS.md) |
| Kiểm tra các nhánh điều kiện | [WORKFLOW-MATRIX](docs/WORKFLOW-MATRIX.md) |
| Chạy và đọc kết quả kiểm thử | [TESTING](docs/TESTING.md), [VERIFICATION](docs/VERIFICATION.md) |
| Tiếp nhận các nhánh source | [GIT-WORKFLOW](docs/GIT-WORKFLOW.md) |
| Xử lý lỗi vận hành | [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) |

## Công nghệ

NestJS 11, TypeScript, TypeORM và SQL Server. HTTP API dùng tiền tố `/api/v1`; Swagger tại `/api/docs`. Xác thực JWT/refresh cookie, permission và scope theo bản ghi được kiểm phía server. AI là nguồn hỗ trợ; quyết định nghiệp vụ vẫn theo service, policy và quyền của con người.

## Local trên máy bàn giao

| Địa chỉ | Vai trò |
|---|---|
| http://localhost:8080/api/v1 | API chính, launcher dùng VIntern_M2_BROWSER |
| http://localhost:8081/api/v1 | API QA, launcher dùng VIntern_Test_Learning_20261014 |
| http://localhost:8080/api/docs | Swagger của bản chính |
| http://localhost:3001 | Frontend |

SQL trên máy hiện tại dùng TCP 1435. Launcher có thể override database so với .env; không khởi động API bằng env mặc định rồi mặc nhiên coi đó là bản chính.

```powershell
& .\scripts\Use-ProjectStorage.ps1
# Chạy tại thư mục gốc repository Backend
npm run lint
npm test
npm run build
# Khi cần restart đúng API thuộc workspace:
& ..\manual-runtime\restart-owned-apps.ps1 -Backend
```

Để thiết lập máy mới, làm theo [LOCAL-DEVELOPMENT](docs/LOCAL-DEVELOPMENT.md), không sao chép database hoặc secret tùy tiện. E2E chỉ chạy với database test đã định rõ. Giữ dữ liệu và ba tài khoản gốc của bản bàn giao.

## Quy tắc nghiệp vụ cần nhớ

- Phỏng vấn mới: dưới 50 không đạt; 50–70 đề xuất role khác có căn cứ; trên 70 đạt. Tối đa 3 lượt tổng cộng, giữ kết quả lịch sử.
- Đạt tuyển dụng chưa tự có assignment. Kế hoạch nháp chưa đồng nghĩa task đã phát hành.
- Admin cấp tài khoản tạo repo; người nộp bài vẫn phải có danh tính và bằng chứng phù hợp.
- AI review không đồng nghĩa code đã chạy test. Kết quả runner phải có bằng chứng riêng.
- Điểm, KPI, báo cáo và chứng nhận có scope/trạng thái/nguồn riêng; không dùng một giá trị thay thế tất cả.

Đọc [HANDOVER](docs/HANDOVER.md) để hiểu từng điểm và tìm đúng service/test. Quyết định kiến trúc được giữ tại [docs/decisions](docs/decisions).

## Giới hạn và bằng chứng

Ứng dụng đang được bàn giao cho môi trường local. Health xanh, unit test xanh và nghiệm thu GitHub là các loại bằng chứng khác nhau; xem đúng mốc trong [VERIFICATION](docs/VERIFICATION.md). Log cũ được giữ để truy vết, không đổi ngày để coi là kiểm tra hôm nay.
