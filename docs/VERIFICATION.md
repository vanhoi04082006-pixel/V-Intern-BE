# Kiểm chứng Backend — 23/10/2026

**Mốc mới nhất K01/K02:** 80 suite / 669 unit BE; lint/build đạt; SQL/HTTP kho tri thức 22 test và hồi quy M01 47 test là hai lượt riêng. [Báo cáo tri thức](reports/knowledge-library-20261023.md) gắn source API `7cb3a46`/OpenAPI `b3a1ef7`; CI Backend SQL 2019 và acceptance của bản cuối đều đạt. Hai DB chính đã nhận M02, số liệu/tài khoản giữ nguyên; readiness lúc 16:19 UTC. Kết quả chưa chứng minh UI/retrieval/Agent runtime hay bộ nội dung được duyệt; không lấy mốc M01 phía dưới thay thế.

**Mốc cập nhật M01:** 629 unit BE đạt; các lượt SQL kiểm catalog/template/tuyển dụng (47), KPI/chứng nhận nghề mới (15) và migration (5) được ghi riêng trong [báo cáo nghề nghiệp](reports/career-roles-20261023.md). Cặp FE `890c4b6` / BE `1bd3c70` đã qua CI quality + full-stack SQL 2019. Hai DB chính đã nhận hai migration M01; số bản ghi/lượt phỏng vấn giữ nguyên, 7 tài khoản gốc/demo đăng nhập và đọc catalog đạt lúc 15:08 UTC ngày 23/10. Báo cáo ghi nguồn, giới hạn fixture và phân biệt smoke local với acceptance. Bảng 625 test phía dưới thuộc bàn giao Aurora trước M01, giữ nguyên nguồn lịch sử; không phải tổng hiện hành sau M01.

Đây là mốc kiểm chứng hiện hành cho đợt Aurora Glass, bàn giao và nhập vai. Số liệu được gắn với log thực tế, không trộn unit, SQL E2E và provider thật.

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Jest unit | **78 suite / 625 test đạt** | be-unit-final-v4.log |
| ESLint | 0 lỗi; 15 cảnh báo console ở script hiện hữu | be-lint-final-v4.log |
| Nest build | Đạt | be-build-final-v4.log |
| SQL HTTP E2E | **25 suite / 237 test đạt theo ma trận tổng hợp**, 0 bỏ qua | e2e-consolidated-final.json |
| Guard live | **9/9 đạt** | guards-live.json |
| PR đổi SHA | Duyệt snapshot cũ bị 409 SUBMISSION_SHA_CHANGED | sha-freshness-live.json |
| AI/GitHub/Docker thật | Có bằng chứng riêng, không gọi fixture là provider thật | outcomes-live.json, ai-and-sharing-live.json, recommendation-live-final.json |
| PDF | Chứng nhận 1 trang, báo cáo 3 trang; nội dung và footer nằm trong khung | pdf-verification.json, screens/qa-certificate-fixed.png |

## Cách tổng hợp SQL E2E

Lần chạy mỗi suite một database mới đạt 233 test, còn 4 test lỗi tại hai suite do timeout 5 giây và fixture/provider queue kéo theo. Máy có 8GB RAM và đồng thời chạy hai API, FE dev/build cùng Docker. Không tăng timeout, không bỏ assertion và không dùng database chính để thay thế.

Sau khi tạm dừng QA runtime và Docker, **hai suite này chạy lại trên hai database mới riêng đạt 40/40**: ai-mentor 25 và kpi-salary-certificates 15. Ma trận cuối chọn 23 suite đã đạt từ fresh-suite-matrix.json cùng hai kết quả mới từ targeted-fresh-suites.json, tổng **237**. Đây không phải một lượt chạy full-suite xanh duy nhất. Log lỗi lần đầu được giữ, không ghi đè bằng kết quả rerun. Mỗi database E2E đã kiểm đường dẫn MDF/LDF nằm dưới workspace/.runtime/sql.

Các suite E2E thay transport/provider bằng fixture để kiểm guard, transaction và contract. Live GitHub/Gemini/Docker được thực hiện riêng qua luồng QA, không suy từ suite xanh.

## Các hồi quy bổ sung trong đợt nhập vai

- Retry review khi runner failed/not_configured; kết quả test âm đã chạy hoàn tất không bị tự coi là lỗi hạ tầng.
- Evaluation assistance và recommendations có tối đa một schema repair có audit; version prompt v2, không nới validator hoặc nhân retry timeout.
- AI không tự áp điểm, finalize evaluation hay chuyển task Done; refresh recommendations giữ nguyên official facts.
- Chứng nhận PDF có dòng footer độc lập, giới hạn bề rộng và wrap; vẫn deterministic bytes, metadata và font tiếng Việt.

Các ngưỡng phỏng vấn đã kiểm ở unit và recruitment SQL E2E: dưới 50 chưa đạt, 50–70 gợi ý role khác dựa trên câu trả lời, trên 70 đạt; tối đa **3 lượt tổng cộng**, đổi role không cấp thêm lượt.

## Hiểu đúng phạm vi nghiệm thu

Luồng thực hành dùng tài khoản QA riêng trên API 8081, database VIntern_Test_Learning_20261014 và FE 3004. FE chính 3001/API 8080 dùng VIntern_M2_BROWSER. Không reset/seed dữ liệu chính hoặc ba tài khoản gốc. Bài nộp là sản phẩm tổng hợp phục vụ kiểm thử, không phải bài đánh giá của một sinh viên thật.

Đã thực hiện GitHub OAuth, tạo repository dưới tài khoản chung của Admin, sinh viên khác danh tính commit/PR, Docker chạy test có chữ ký, Gemini phân tích, giảng viên trả sửa/duyệt. Kết quả cuối: 4/4 nhiệm vụ, đánh giá **85,5**, KPI **95,7**, số dư **9.570.000 đồng ảo**, chứng nhận xác minh hợp lệ, PDF/Excel tải và đọc được. Sau kết thúc phiên, sinh viên vẫn xem kết quả và khuyến nghị AI.

Xem [báo cáo nhập vai](ROLEPLAY-ACCEPTANCE.md) để đọc từng bước, lỗi tìm được, cách sửa và giới hạn. [Bàn giao](HANDOVER.md) hướng dẫn sử dụng và đọc code. [Git workflow](GIT-WORKFLOW.md) ghi các nhánh đã đối chiếu và SHA phục hồi.

## Nguồn và mốc thời gian

Tất cả tên tệp bằng chứng trong trang này tính từ **workspace/manual-runtime/aurora-handoff-20261022/**. Thư mục giữ ngày bắt đầu 22/10; kiểm tra cuối thực hiện ngày **23/10/2026, UTC+7**. Trường checkedAt trong JSON dùng UTC. final-manifest.json ghi thời điểm, source hash cả tệp chưa commit, branch/HEAD và trạng thái runtime; log ngày trước không được diễn giải thành lần chạy mới.

Tại mốc chạy các kiểm tra bên trên, thay đổi còn nằm trong working tree. Source và tài liệu được commit/công bố trên nhánh feature ngày 23/10; xem GIT-WORKFLOW. Chưa merge vào main. Đã dọn 5 tên nhánh local có commit nằm trong HEAD bằng branch -d; giữ nhánh đang làm, main, archive và nhánh có patch tương đương để bảo toàn lịch sử. Bốn PR đã merge là trong repository bài thực hành QA.

## Giới hạn còn được ghi nhận

- Webhook repository QA chưa có endpoint public được cấu hình: chưa kiểm delivery live. Live PR/SHA dùng GitHub API; E2E kiểm hợp đồng webhook riêng.
- Bộ test xuất JSON kiểm preview và version, chưa đối chiếu byte của file tải xuống từ browser.
- Ma trận responsive không thay audit WCAG hoặc Core Web Vitals đầy đủ; kết quả AI của một bài không chứng minh độ chính xác chấm mọi bài.
- Production không nằm trong yêu cầu hiện tại.

[Bằng chứng trước đợt này, giữ nguyên mốc lịch sử](archive/verification-before-aurora-20261023.md).
