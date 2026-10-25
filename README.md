**Checkpoint 26/10/2026:** [kết quả có nguồn, luồng đã click và việc còn mở](docs/ACCEPTANCE-CHECKPOINT-20261026.md). BE 859 / FE 644 unit tests; cặp CI đã có receipt xanh, code mới tiếp tục gate theo SHA. CV–Gmail–Agent–GitHub–Docker đã chạy thật tới task đầu được giảng viên duyệt; chưa hoàn tất toàn bộ hành trình hay redesign. [Bàn giao nền tảng](docs/DELIVERY-20261025.md) · [khôi phục mật khẩu tạm](docs/TEMPORARY-CREDENTIAL-RECOVERY.md).

**G6/T03 — quyền repository sau thay người:** [hướng dẫn trạng thái, đối chiếu và phục hồi](docs/REPOSITORY-ACCESS-RECOVERY.md). Đã kiểm QA, GitHub pending thật và đã kích hoạt cả hai DB native.

# V-Intern Backend

**G6 — thời hạn và thay thành viên:** [quy tắc và điểm phạt](docs/PARTICIPATION.md) · [hướng dẫn tư vấn, xem trước và phê duyệt](docs/REPLACEMENT.md) · [bằng chứng QA và phần còn lại](docs/reports/g6-replacement-evidence-20261025.json). Đã kích hoạt G6 trên cả hai DB native, giữ nguyên dữ liệu cũ.

**G5 — GitHub:** [lời mời, quyền cộng tác và cách mời lại](docs/GITHUB-INVITATIONS.md) · [kết quả local và phụ thuộc live](docs/reports/g5-completion-20261025.md).

**G4 — phỏng vấn theo lịch:** [phòng chờ, mốc 15 phút, ba lượt và hẹn lại có audit](docs/SCHEDULED-INTERVIEWS.md) · [kiểm chứng và giới hạn](docs/reports/g4-completion-20261025.md).

**G3 — nhận CV và lịch hẹn:** [hướng dẫn sử dụng, Agent, tài khoản và email local](docs/CV-AND-INTERVIEW-SCHEDULING.md) · [nghiệm thu và giới hạn](docs/reports/g3-completion-20261024.md).

**G2 — bài nhỏ và bảy Agent:** [hướng dẫn từ đầu đến vận hành](docs/AGENTS-AND-MINI-PROJECTS.md) · [nghiệm thu và giới hạn](docs/reports/g2-completion-20261024.md).

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
| Quản trị nghề nghiệp động | [Hợp đồng M01](SPEC-career-roles.md), [tiến độ và kiểm chứng](docs/reports/career-roles-20261023.md) |
| Biên soạn tri thức cho Agent | [Hướng dẫn kho tri thức](docs/KNOWLEDGE-LIBRARY.md), [đặc tả](SPEC-knowledge-library.md), [kết quả K01–K03, UI/CI/runtime và phần còn lại](docs/reports/knowledge-ui-20261024.md) |
| Hiểu và vận hành Agent G1 | [Luồng chạy, API, giới hạn, phục hồi và trace](docs/AGENT-RUNTIME.md), [bằng chứng G1](docs/reports/agent-foundation-20261024.md) |
| Tiếp nhận thư viện mẫu nhỏ G2/P01 | [Đề bài, phiên bản và tài liệu chấm riêng](docs/SMALL-PROJECT-LIBRARY.md), [đặc tả](SPEC-small-project-library.md) |
| Chọn bài nhỏ và tri thức G2/P02 | [Sáu starter, cách chạy, seed an toàn và duyệt tri thức cho Agent](docs/MINI-PROJECT-CONTENT.md) |
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
