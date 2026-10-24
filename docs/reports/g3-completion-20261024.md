# G3 — Nghiệm thu CV, Agent, lịch và email local

Phạm vi đã triển khai: nhận/xác minh/theo dõi CV riêng tư; ba Agent phân tích/chọn nghề/chọn lịch; giữ chỗ và danh tính trong transaction; email lịch và email đăng nhập riêng; đổi mật khẩu tạm; quản lý đợt/hồ sơ/mail trên FE. Hướng dẫn người dùng và kỹ thuật: [CV-AND-INTERVIEW-SCHEDULING](../CV-AND-INTERVIEW-SCHEDULING.md).

Mốc kiểm ngày 24–25/10/2026 theo giờ Việt Nam. Bằng chứng browser ghi `2026-10-24T16:52:02.160Z` (UTC). Đây là nghiệm thu local; G4–G7 được theo dõi riêng trong `tasks/todo.md`.

## Kết quả từng nhóm

| Nhóm độc lập | Kết quả | Nguồn local dưới workspace |
|---|---|---|
| BE unit | 100 suite / 768 test qua | `.runtime/g3-be-unit-final.log` |
| BE build/lint | Qua; 15 cảnh báo console cũ, không có lỗi lint | `.runtime/g3-be-build-final.log`, `g3-be-lint-final.log` |
| SQL hồi quy chung | 34 suite / 318 test qua | `.runtime/g3-be-shared-sql-verified.log` |
| SQL G3 applications + communications | 2 suite / 19 test qua | `.runtime/g3-domain-sql-verified.log` |
| SQL migration G3 | 2 test qua, giữ identity và chặn rollback mất revocation | `.runtime/g3-migration-final.log` |
| SQL business Agent + quyền mới | 2 suite / 10 test qua | `.runtime/g3-scope-business-green.log` |
| FE unit | 96 file / 599 test qua | `.runtime/g3-fe-unit-final.log` |
| FE typecheck/lint/build | Qua | `.runtime/g3-fe-typecheck-final.log`, `g3-fe-lint-final.log`, `g3-fe-build-verified.log` |
| Chrome | 7 luồng qua; 0 page error; 390/768/1440 không tràn ngang | `manual-runtime/g3-20261024/browser-result.json`, `shots/` |
| Native runtime | 8080/8081 health 200; FE 3001; SMTP 2525/inbox 8025 | `manual-runtime/g3-20261024/native-activation.json`, `.runtime/g3-native-final-preservation.log` |

Không cộng các dòng trên thành một lần chạy toàn bộ. Các nhóm dùng DB/fixture khác nhau có chủ đích. CI kiểm đúng commit trên GitHub là một nguồn bằng chứng riêng, không được suy ra từ log local.

## Các luồng browser đã thực hiện

1. Giảng viên tạo đợt và lịch có sức chứa qua UI.
2. Ứng viên chưa đăng nhập nộp file PDF thật, đồng ý xử lý và xác minh qua mail.
3. Ba graph Agent thật đọc tool/checkpoint, đặt lịch trên SQL; SMTP nhận hai mail riêng theo mốc; người mới đăng nhập và đổi mật khẩu tạm.
4. Giảng viên mở hồ sơ đúng quyền và tải CV riêng.
5. Giảng viên xem câu trích có trang; mở/đóng modal gửi lại bằng Escape và nhận lại focus đúng nút.
6. Kiểm bố cục ứng viên/giảng viên tại 390/768/1440.
7. Admin xem HTML/text mail trên desktop/mobile; credential được che.

Request `/applications/me` trả 401 trước khi có phiên ứng viên là tình huống được chủ động kiểm và ghi lại, không phải trang crash. Bố cục nhóm nút gửi lại được chỉnh thêm thành flex-wrap sau khi xem ảnh mobile.

## Lỗi hồi quy đã xử lý

Ca kiểm ba cuộc phỏng vấn liên tiếp có lúc vượt timeout 30 giây. Đo request xác định tải tập trung ở Agent lấy câu tiếp theo. Gộp pending checkpoint writes thành một batch trong cùng transaction và gộp snapshot quyền thành một lần đọc SQL mới giúp giảm các lượt truy vấn. Không tăng timeout, không bỏ assertion hoặc giảm số câu phỏng vấn.

Test bổ sung chứng minh giới hạn số lượt SQL theo độ rộng checkpoint, replay/ghi đè kênh đặc biệt, phục hồi graph, quyền kế thừa và thu hồi quyền ngay lần đọc sau. Bộ hồi quy chung đã qua 318 ca sau sửa.

## Bảo toàn dữ liệu

Hai DB native `VIntern_M2_BROWSER` và `VIntern_Test_Learning_20261014` chỉ nhận migration bổ sung. Đối chiếu hash các danh tính/mật khẩu/trạng thái, memberships và các bảng nghiệp vụ được bảo vệ trước/sau không đổi. Không reset, không dùng ba tài khoản trắng để nghiệm thu. Đường dẫn thật MDF/LDF đã kiểm bên trong workspace.

Các ca ghi dữ liệu của bộ test và browser dùng DB SQL 2019 disposable trên cổng 1437. CV, cache và evidence ở dưới folder dự án. `.env`, credential, CV và fixture đăng nhập không được đưa lên GitHub; script tái lập và báo cáo không bí mật được commit.

## Giới hạn cần hiểu khi bàn giao

- Browser dùng **model deterministic được khai báo rõ**, chạy graph/tool/checkpoint/SQL thật. Kết quả này chưa phải nghiệm thu riêng ba Agent G3 với provider bên ngoài hoặc read-back trace LangSmith thật.
- SMTP là **local sink** theo lựa chọn đã duyệt. Không có tuyên bố Gmail/Outlook đã nhận; `accepted` khác `delivered`.
- Chưa có OCR. CV scan được yêu cầu bổ sung.
- Mốc T+15, cổng start, lịch retake thuộc G4. Lời mời/webhook thuộc G5; nộp trễ/thay người thuộc G6; hành trình tổng hợp/bàn giao cuối thuộc G7.

## Cách kiểm lại

BE: chạy lệnh của repository sau `Use-ProjectStorage.ps1`; dùng DB dùng một lần theo [TESTING](../TESTING.md). SQL G3: `npm run test:e2e -- --testRegex='(applications|communications).sql-spec.ts$'`. Migration G3 phải chạy trên DB trống riêng: `npm run test:e2e -- --testRegex=applications-migration.sql-spec.ts$`.

FE: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. Browser harness cần runtime SQL/SMTP QA riêng; không chạy nó vào DB chính hoặc nhập credential công khai.
