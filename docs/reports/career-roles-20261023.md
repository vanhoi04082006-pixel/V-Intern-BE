# M01 — Thư viện nghề nghiệp động · 23/10/2026

**R01/R02/R03 đã đạt local và CI; đã kích hoạt trên hai DB demo.** Đã có schema, API, Admin UI, onboarding, question bank, template, bộ lọc/phân công giảng viên và tên nghề trên chứng nhận. Cặp FE `890c4b6` / BE `1bd3c70` đã qua CI; hai migration được áp dụng lúc 15:00 UTC ngày 23/10/2026, giữ nguyên dữ liệu nghiệp vụ. M02–M15 (tri thức chung, runtime Agent, CV/lịch/mail, lời mời và chính sách nộp trễ) chưa được nghiệm thu từ kết quả này.

Đọc cách dùng trong FE `docs/CAREER-ROLES.md`; hợp đồng và quyết định dữ liệu trong [SPEC-career-roles](../../SPEC-career-roles.md); [checklist toàn chương trình](../../tasks/todo.md).

## 1. Phần đã hoạt động

| Khả năng | Kết quả đã kiểm |
|---|---|
| Career khác RBAC | Tạo nghề không tạo quyền/tài khoản. Giữ 5 mã gốc; các mã lịch sử được giữ làm metadata đóng tuyển |
| Admin quản trị | Draft, publish, mở/đóng tuyển, archive/mở lại, tìm/lọc/phân trang; mã bất biến, version bắt buộc |
| Cạnh tranh và lịch sử | Hai update cùng version cho đúng 1 thành công/1 conflict; current, revision và audit cùng transaction; không ghi đè snapshot |
| Tuyển dụng | Nghề mới đọc được từ API/FE không sửa enum. Draft/đóng tuyển bị chặn; thiếu câu hỏi trả lỗi cũ 503, attempt vẫn 0 |
| Ngân hàng câu hỏi | Soạn/lọc theo mã động; cần tối thiểu 2 giới thiệu + 6 chuyên môn + 2 tiếng Anh, không lấy câu của nghề khác |
| Đánh giá/gợi ý | Prompt v5 dùng catalog đang tuyển; input run có mã/tên/version/kỹ năng. Đề xuất ngoài catalog bị từ chối; không có lựa chọn thì giữ điểm và thông báo, không bịa nghề |
| Template và phân công | Tạo/cập nhật/start mẫu với nghề mới; snapshot/slot đúng mã. Giảng viên lọc và phân công ứng viên đã đậu qua UI, kể cả nghề đã đóng tuyển |
| Chứng nhận | Tên nghề lấy từ catalog lúc cấp, không lấy enum 5 nghề. Đổi tên catalog sau đó không đổi public verify/PDF đã cấp |

Danh sách tham chiếu giảng viên chỉ trả code/label, yêu cầu `recruitment.view`; không chứa rubric/trọng số. Draft mới chưa có hồ sơ không xuất hiện; nghề đã có hồ sơ vẫn lọc được nếu được đưa lại về draft. Catalog ứng tuyển sinh viên vẫn chỉ published/đang tuyển.

## 2. Bằng chứng local có nguồn

Tất cả log dưới đây nằm tại `workspace/manual-runtime/ci-recovery-20261023/`. Mỗi hàng là một lượt riêng; không cộng thành một lượt tổng. SQL dùng engine 15.x (SQL Server 2019), cổng 1437, DB disposable có tên được guard; dữ liệu Docker nằm trong VHD project-owned của VIntern-Grader.

| Kiểm tra | Kết quả | Evidence |
|---|---|---|
| Unit BE | 78 suite / 629 test đạt | `career-r03-final-unit.log` |
| Unit FE | 84 file / 550 test đạt | `career-fe-seal-unit.log` |
| Lint/typecheck/build | FE đạt; BE lint 0 lỗi (15 warning console cũ), build đạt; production FE riêng build đạt | `career-fe-seal-*`, `career-r03-final-lint.log`, `career-r03-final-build.log`, `career-r03-build.log` |
| Node CI contract | 22/22 đạt; có guard vị trí SHA backend và gate catalog | `career-fe-seal-contract.log` |
| R01 migration | 5/5 đạt: dữ liệu cũ/FK/JSON/rollback an toàn/up lại | `career-migration-regression.log` |
| Tuyển dụng, đăng ký, câu hỏi, catalog, template | 5 suite / 47 SQL E2E đạt, giữ assertions nghiệp vụ cũ | `career-r03-e2e-final.log` |
| Legacy JSON sau bản sửa cuối | 9/9 API/migration case đạt, có note chuỗi lẫn object trong blueprint | `career-adoption-shape-green.log` |
| KPI/lương/chứng nhận với nghề mới | 15/15 SQL E2E đạt; PDF/verify không đổi sau khi sửa nghề | `career-certificate-green.log` |
| Browser ba vai trò | Admin catalog → 10 câu → sinh viên trả lời/nộp/chấm → template/phiên → giảng viên lọc/phân công đúng slot | `career-r03-browser.log`, `phase7-evidence/career-roles/result.json` |

Browser không intercept API. API, SQL, xác thực và kiểm quyền là thật; **LLM/GitHub là fixture được khai báo của harness**. SQL ghi 10 câu trả lời, `passed`, 81.1 và prompt v5. 81.1 là điểm fixture, không phải chất lượng model live. Kiểm 1440/1280/1024/768/390 px: không tràn ngang, không page error. Ảnh cùng thư mục evidence gồm Admin, sinh viên và `instructor-assignment.png`.

## 3. CI theo revision

| Cặp code | Kết quả và nguồn |
|---|---|
| FE `6b11d07` / BE `3989138` | [M00](ci-recovery-20261023.md) đã đạt quality + 14/14 SQL 2019; không chứng minh M01 |
| FE `6e6e9c9` / BE `ecc1cb8` | [Full-stack 39945967240](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39945967240) đạt 14 bước cũ + catalog, hoàn tất 11:42:27 UTC; quality đạt |
| FE `291f870` / BE `ecc1cb8` | [Full-stack 39949202903](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39949202903) và [quality](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39949202880) đạt; script đã kiểm đủ 10 câu/nộp/chấm |
| FE `890c4b6` / BE `1bd3c70` | [Full-stack 39960526289](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39960526289) đạt toàn bộ 14 bước + catalog, hoàn tất 13:29:26 UTC; [quality 39960526305](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39960526305) đạt. BE [release gate](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39958039276) và [acceptance](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39958039279) đều đạt |

Các commit BE chỉ cập nhật tài liệu sau mốc code không thay đổi cặp runtime đã ghim. Metadata job phải cùng `head_sha`, có conclusion success từng bước; không chỉ dựa badge PR.

## 4. Tương thích và giới hạn

- Migration R01 giữ 5 mã, backfill profile/câu hỏi/buổi phỏng vấn lạ ở archived, giữ số lượt/trạng thái/rubric. FK không cascade; rollback chỉ xóa catalog khi đúng baseline nguyên vẹn, giữ khóa trong transaction.
- Migration nhận role từ template/slot giữ `devops` từng được hỗ trợ và mã cũ, không tự mở tuyển. Bỏ qua note chuỗi khi trích mã; JSON gốc không đổi. Không ghi đè metadata/revision Admin đã sửa. Mã >32 ký tự dừng để lập mapping; không cắt chuỗi.
- `down` của bước nhận dữ liệu giữ metadata đã nhận; chạy up lại không nhân đôi. Gỡ cả M01 cần kế hoạch giữ/xuất metadata vì guard R01 sẽ dừng khi catalog có nội dung mới.
- Test R01 kiểm đúng cửa sổ migration đến R01, không chạy nhầm các migration mới hơn khi thử rollback. Bộ template là integration của AppModule hiện hành, đã chuyển sang danh sách migration đầy đủ; không giảm assertion/skip.
- Các lượt fail trước được giữ log: sai locator radio ẩn, API local chưa ready, fixture đề xuất nghề đã archive, JWT 20 giây dùng nhầm cho BE Jest, JSON legacy đọc như object và chứng nhận hiển thị code thay tên. Đã sửa nguyên nhân, không tăng timeout/hạ audit/bỏ test. BE Jest dùng mặc định BE 15 phút; harness FE vẫn giữ 20 giây để kiểm refresh/expiry.
- Không reset DB chính, không dùng tài khoản trắng để chạy phỏng vấn/bài tập. Sau cập nhật, chỉ đăng nhập để kiểm tài khoản và đọc catalog; không tăng lượt phỏng vấn.
- Một số widget dùng code làm nhãn dự phòng khi response thiếu tên; đây là chuẩn hóa UX tiếp theo, không phải enum chặn nghề. Luồng CV xếp role/lịch tự động và Agent runtime chưa được xây từ M01; chọn nghề thủ công vẫn được giữ cho luồng hiện hành.

## 5. Kích hoạt local và bảo toàn dữ liệu

SQL instance `VANHOI12` nghe cổng 1435, được đối chiếu với tiến trình `sqlservr.exe`. MDF/LDF của cả hai DB nằm dưới `workspace/.runtime/sql/`; đã kiểm đường dẫn thực, không suy từ cấu hình. Mỗi DB chỉ có hai migration M01 còn thiếu trước cập nhật; sau cập nhật không còn migration chờ.

| DB | Users | Hồ sơ | Buổi PV | Câu trả lời | Câu hỏi | Phân công | Mẫu | Chứng nhận | Tổng lượt PV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VIntern_M2_BROWSER | 9 | 4 | 4 | 34 | 185 | 2 | 6 | 0 | 4 |
| VIntern_Test_Learning_20261014 | 16 | 10 | 10 | 59 | 70 | 5 | 7 | 2 | 11 |

Các số trên bằng nhau trước/sau migration. Mỗi DB có 6 nghề: 5 nghề mở tuyển và metadata nghề cũ đóng tuyển. Không tạo hồ sơ/tài khoản hoặc chạy seed/reset. Đã build lại FE/BE và khởi động đúng tiến trình project-owned; bản FE trước cập nhật được giữ trong project.

Readiness lúc **15:08:34 UTC (22:08:34 giờ Việt Nam)**: API 8080/8081 báo database ok; FE 3001 trả 200 cho login, catalog Admin, onboarding và phiên giảng viên. Bảy tài khoản trong ba nhóm original/demo/defense đăng nhập đúng vai trò, đúng ID đã lưu và đọc đủ 5 nghề mở tuyển. Đây là smoke/read-only cộng sign-in audit, không phải một lượt nhập vai thay cho browser acceptance ở mục 2.

Nguồn local: `native-career-preflight.json`, `native-career-activation.json`, `native-career-readiness.json`, `native-be-build.log`, `native-fe-build.log` trong thư mục evidence ở mục 2. Các file chứa cấu hình/tài khoản riêng không commit. Lượt readiness đầu dùng nhầm URL không tồn tại `/instructor/members` trả 404; đã sửa helper theo route thật `/instructor/sessions`, không sửa routing ứng dụng hay bỏ kiểm HTTP 200.
