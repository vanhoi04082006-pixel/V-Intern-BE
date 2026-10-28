# Sáu bài nhỏ: chọn bài, chạy starter và cung cấp tri thức cho Agent

Tài liệu này dành cho giảng viên giao bài, Admin quản lý thư viện và người tiếp nhận code. Đây là **G2/P02**, phần nội dung tiếp sau [nền tảng version/public/private P01](SMALL-PROJECT-LIBRARY.md).

## 1. Người học thực sự nhận được gì?

Mỗi bài là một module nghiệp vụ JavaScript chạy trong terminal bằng Node 22+, một người làm trong 3–5 ngày. Bộ này luyện cách đọc hợp đồng, kiểm dữ liệu, viết test, dùng Git/PR và giải thích kết quả. Nó không yêu cầu cài cả React/Nest/SQL cho một bài cơ bản.

Mỗi gói gồm README tiếng Việt, package.json không dependency, `src/model.cjs` để hoàn thành, demo, dữ liệu giả và hai public acceptance test. Mỗi bài có bốn task theo thứ tự: đọc hợp đồng → viết core → kiểm dữ liệu biên → bàn giao. Task và lịch được version hóa như mọi mẫu khác.

**Starter chưa phải lời giải.** `node demo.cjs` chỉ in dữ liệu mẫu và hướng dẫn. `node demo.cjs --run` ban đầu báo TODO, exit 2; public test ban đầu exit 1. Sau khi sinh viên viết core, hai lệnh cuối cần exit 0. Màu xanh của public test không thay điểm chấm hoặc receipt trusted runner.

| Mã | Bài và thời gian | Phần phải làm | Demo quan trọng |
|---|---|---|---|
| `MINI-NOTES-V1` | Ghi chú · 3 ngày | Thêm, tìm, xóa plain text | Tìm chữ hoa, trim title, xóa id lạ không mất dữ liệu |
| `MINI-TASKS-V1` | Công việc · 4 ngày | Tạo todo, chuyển trạng thái, lọc | Chặn todo→done; lặp cùng status không đổi kết quả |
| `MINI-CART-V1` | Giỏ hàng · 4 ngày | Báo giá theo catalog, kiểm stock | Giá client gửi không thay giá catalog; quantity sai bị từ chối |
| `MINI-ROSTER-V1` | Danh sách lớp · 3 ngày | Thêm hồ sơ giả, chuẩn hóa mã/email, tìm | sv01 trùng SV01; không gọi mạng để kiểm email |
| `MINI-BOOKING-V1` | Một phòng học · 5 ngày | Đặt/hủy theo thời điểm UTC | Giờ sát nhau được phép; overlap khác timezone bị chặn |
| `MINI-BLOG-V1` | Nháp và xuất bản · 4 ngày | Lưu draft, publish, danh sách public | Draft không public; sửa bài published đưa về draft |

Sáu bài dành cho nền tảng role `backend` hiện có trong catalog, không phải sáu nghề mới. Chúng chưa có web UI/HTTP server, auth hay database. Với Booking, test hàm tuần tự không chứng minh transaction chống hai request đồng thời. Với Blog, lọc public không thay kiểm quyền của API. Phần mở rộng phải được giao riêng, không âm thầm tăng phạm vi bài gốc.

## 2. Thêm mẫu vào local mà giữ bài đang chạy

Các mã `MINI-*` khác sáu mẫu `LEARN-*` 14 ngày. Seed mới chỉ thêm mã chưa tồn tại. Mã đã có được giữ nguyên, kể cả version 1, nội dung đã chỉnh hoặc đang archive. Seed không đổi run snapshot, người dùng, số lượt phỏng vấn hoặc mẫu cũ.

Mở PowerShell tại repository Backend, kiểm `.env` trỏ đúng database local cần thao tác. Trên máy bàn giao có hai DB; đổi DB ở launcher không tự đổi `.env` của terminal.

```powershell
& ..\manual-runtime\Use-ProjectStorage.ps1
# Chỉ xem, không ghi dữ liệu:
npm run seed:mini-projects
# Sau khi đọc preview, thêm các mã còn thiếu:
npm run seed:mini-projects -- --apply
```

Preview trả `mode: preview`, `mutationsPerformed: 0` và từng mã insert/preserve. Apply cần Admin đang active; không tự tạo tài khoản. Lệnh từ chối production/DB_HOST ngoài local. Rerun sau lần đầu thường trả `inserted: 0, preserved: 6`.

Mở thư viện dự án giảng viên, tìm tên hoặc mã MINI. Tạo phiên bằng luồng hiện có. Phiên ghim version đề bài; sửa mẫu sau đó không đổi đề giữa chừng. UI soạn/preview tải nhiều file của gói là P04: ở bước này nội dung có trong API/snapshot, đừng hiểu rằng đã có nút tải ZIP mới trên FE.

## 3. Chạy một bài mẫu trước khi giao

Lấy các file `learningPackage.starterFiles` và `sampleData` từ revision public được giao, giữ nguyên đường dẫn tương đối trong **một thư mục riêng thuộc workspace**. Không chép đè repository Backend. Mở terminal ở thư mục chứa package.json của bài:

```powershell
node --version
node demo.cjs
node demo.cjs --run
node --test test/acceptance.test.cjs
```

Lần đầu, đọc TODO và tên test đỏ để hiểu phần cần viết trong `src/model.cjs`. Giữ chữ ký export, không xóa assertion có sẵn. Sau khi hoàn thành, thêm ca biên theo README và chạy lại. Nộp PR/SHA qua hệ thống; log riêng trên máy không tự trở thành bằng chứng runner tin cậy.

Không chạy file sinh viên gửi trong API để mô phỏng chấm. Smoke test của dự án chỉ chạy starter cố định do chính repository biên soạn, trong thư mục tạm của workspace. P03 mới cung cấp lời giải, biến thể sai, hidden suite và bằng chứng trusted runner gắn SHA/digest/spec hash.

## 4. Bộ tri thức phục vụ nhiều Agent

Có **18 mục** để biên soạn trong kho tri thức: sáu đề bài public, sáu Q&A riêng cho đánh giá, sáu hướng dẫn liên chức năng. Mỗi Q&A có hai cách trả lời hợp lệ, khái niệm cần hiểu, ví dụ trả lời, lỗi thường gặp, câu hỏi đào sâu, câu trả lời yếu và rubric 60/25/15.

| Nhóm Agent | Nội dung có thể dùng sau khi duyệt | Giới hạn |
|---|---|---|
| Mentor / Advisor / Knowledge assistant | Đề bài, đọc lỗi và kiểm chứng | Chỉ `student_safe`; không đưa nguyên lời giải |
| Interviewer | Hỏi mở theo bằng chứng | Không đọc Q&A/rubric chấm vào câu hỏi |
| Interview evaluator | Q&A có nhiều hướng đúng | Riêng `grading_only`, không chấm theo khớp từ khóa đơn thuần |
| Planner | Bốn bước, dependency, phạm vi nhỏ | Dùng snapshot của phiên; không tự mở rộng cloud/auth/SQL |
| Reviewer / Evaluation assistant | Q&A và cách đọc receipt | Không gọi nhận xét tĩnh là test đã chạy |
| CV analyst | Trích dẫn CV, phân biệt dữ kiện và suy luận | Chỉ role đang tuyển; module nhận CV còn ở G3 |
| Coordinator | Thông báo V-Intern có trạng thái thật | Pending khác accepted; outbox và lifecycle GitHub còn G3/G5 |

Đây là nội dung tham khảo để retrieval cung cấp context, không phải fine-tuning model. Chín purpose đều có tài liệu, nhưng **có nội dung chưa chứng minh AI nghiệp vụ đã được chuyển sang Agent hoặc đã đọc nó trong một run thật**. Việc chuyển từng AI và eval riêng vẫn thuộc phần còn lại của G2.

Phạm vi `grading_only` bảo vệ đường đọc của ứng dụng. Nội dung bundled được version hóa trong source; không xem Q&A đã commit lên repository công khai là bí mật đề thi. Không đặt hidden tests có giá trị bảo mật hoặc credential vào bundle public này.

## 5. Export, kiểm nguồn và duyệt

```powershell
& ..\manual-runtime\Use-ProjectStorage.ps1
# -s tránh banner npm; đích nằm trong repository, được ignore:
New-Item -ItemType Directory -Force .runtime | Out-Null
npm run -s export:mini-knowledge | Set-Content -Encoding utf8 .runtime\mini-knowledge.json
```

File là mảng `{code,draft}` đúng hợp đồng import, không chứa status/reviewer và không ghi DB. Admin dùng trang kho tri thức hoặc Swagger:

1. Gửi `{"entries": [...]}` đến `POST /api/v1/admin/knowledge/import/dry-run`. Mong đợi HTTP 200, 18 validDrafts, 18 publishable, 0 mutations. Publishable ở đây chỉ là đủ cấu trúc.
2. Kiểm nội dung, nguồn và audience. Nguồn có tài liệu Node chính thức và reference nội bộ P02-v1; hệ thống không tự tải URL.
3. Với mã chưa có, gửi từng `{code,draft}` đến `POST /api/v1/admin/knowledge`. Bản đầu là draft. Không dùng endpoint tạo mới để ghi đè mã đang có.
4. Với mã đã có, đọc phiên bản hiện tại, so diff rồi cập nhật bằng `PUT /api/v1/admin/knowledge/:code` kèm version hiện tại và draft. Conflict 409 yêu cầu tải lại; không đoán version.
5. Đọc publication-check; người duyệt chấp nhận nội dung thì publish bằng version vừa đọc. History giữ người thao tác, hash và version.

Export/seed mẫu không tự publish tri thức, không tạo audit giả về người đã duyệt và không tự cấp tool cho Agent. Thư viện mẫu và kho tri thức là hai nguồn version khác nhau: khi sửa đề bài, cập nhật draft exercise liên quan, duyệt lại và lưu cả hai mốc khi nghiệm thu run.

## 6. Tìm code và đọc kết quả

| Cần xem/sửa | File |
|---|---|
| Sáu hợp đồng và public tests | `src/templates/mini-project-domains.ts` |
| Ghép blueprint, tasks, starter và README | `src/templates/mini-project-catalog.ts` |
| Seed chỉ thêm, không ghi đè | `src/templates/mini-project-seed.ts` |
| Q&A và hướng dẫn nhiều Agent | `src/knowledge/mini-project-knowledge.ts` |
| CLI preview/apply và export | `src/scripts/seed-mini-projects.ts`, `export-mini-knowledge.ts` |
| Kiểm gói và starter thật | `mini-project-catalog.spec.ts`, `mini-project-starters.spec.ts` |
| SQL/HTTP tạo phiên và giữ dữ liệu | `test/mini-project-library.e2e-spec.ts` |

[Đặc tả P02](../SPEC-mini-project-content.md) ghi tiêu chí. [Báo cáo có nguồn](reports/mini-project-content-20261024.md) ghi commit, lệnh, kết quả và trạng thái local/CI. Sáu starter chạy được không phải sáu bài giải đã chạy qua trusted runner; trạng thái này phải giữ rõ khi bàn giao.
