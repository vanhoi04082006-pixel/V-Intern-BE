# G2/P02 — sáu starter và tri thức nhiều Agent · 24/10/2026

Code public package `f58e40b`, seed/tri thức `36393f3`, nhánh `codex/g2-template-foundation`, [PR #5](https://github.com/vanhoi04082006-pixel/V-Intern-BE/pull/5). Đã push. Đây là phần nội dung P02; không coi P03/P04 hoặc chuyển toàn bộ AI sang Agent là đã xong.

Người tiếp nhận đọc [hướng dẫn chọn bài, chạy và duyệt tri thức](../MINI-PROJECT-CONTENT.md); tiêu chí nằm trong [đặc tả P02](../../SPEC-mini-project-content.md). [Manifest](mini-project-content-20261024-evidence.json) gắn source hash, CI và thời gian kiểm. Sáu mã MINI mới độc lập sáu mã LEARN 14 ngày. Không đổi API contract, migration, FE hoặc business logic tuyển dụng.

## Đã có gì và đã kiểm gì?

| Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|
| Sáu bài 3–7 ngày | Notes/Tasks/Cart/Roster/Booking/Blog, thực tế 3–5 ngày, 1 Sprint, 4 task và dependency | DTO + blueprint + strict package validator đạt cho cả sáu |
| Starter có thể bắt đầu | CommonJS/Node 22, không dependency; README, JSON giả, demo, module TODO, public tests | Sáu smoke: syntax/demo exit 0; --run exit 2 và test đỏ do TODO đúng dự kiến |
| Tri thức nhiều Agent | 18 mục: 6 exercise public, 6 QA grading-only, 6 guide/template | Publish schema đạt; 9 purpose/10 consumer có tài liệu phù hợp; Mentor/Interviewer không đọc Q&A |
| Seed giữ dữ liệu | CLI mặc định preview; --apply chỉ thêm mã thiếu, không rewrite MINI đã có | SQL hai lượt; custom/archived và LEARN/identity/run giữ nguyên |
| Tạo phiên cũ vẫn hoạt động | Cả sáu tạo phiên riêng bằng HTTP, ghim learningPackage vào snapshot | Sáu HTTP case trong suite P02; context không có solution/hidden/validAnswers |
| Import không tự duyệt | Admin dry-run 18/18 validDrafts/publishable, HTTP 200, 0 mutation | SQL count knowledge_entries trước/sau bằng nhau |

## Nguồn số liệu local

Thư mục evidence local: `workspace/manual-runtime/mini-project-content-20261024/`. Bằng chứng công khai không chứa credential, email đăng nhập hoặc đường dẫn vật lý máy.

| Lượt | Kết quả | Log |
|---|---|---|
| Unit toàn BE | **90 suite / 734 test** | `p02-unit.log` |
| Build | Đạt | `p02-build.log` |
| Lint | 0 lỗi, 15 cảnh báo console cũ | `p02-lint.log` |
| SQL2019 regression | **4 suite / 39 test**, một lượt cùng DB disposable | `p02-sql-final.log` |
| Nội dung mới trong số trên | 9 unit (gồm 6 starter smoke), 9 SQL/HTTP | Không cộng thêm lần nữa vào 734/39 |

SQL gồm 9 mini-project, 11 material, 11 thư viện hiện hữu và 8 start-session. Các lượt P01 migration/retrieval cũ là bằng chứng riêng; không lấy chúng làm số test mới của P02.

## Các lượt đỏ và cách xử lý

- `p02-catalog-red.log` và `p02-knowledge-red.log`: module mới chưa tồn tại, test chưa compile; sau thêm code, 9 unit mới đạt trong `p02-content-green.log`.
- `p02-sql-red.log`: chưa có opt-in seed module; sau triển khai, tạo được mẫu/phiên và giữ dữ liệu.
- `p02-sql-first.log`: 8 case đạt, một case ghi sai expected HTTP 201 cho dry-run. Controller hiện hữu quy định 200, đã sửa assertion cho đúng contract; giữ nguyên code API. Lượt cuối đạt đủ 39 test, không skip/nới validation.

## Trạng thái CI và local

CI code **success** tại [Actions 40064643895](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40064643895), đúng SHA `36393f3215c264fe6e18f7daf4bf44539b4a15ed`. Run được dispatch có chủ đích vì PR dạng stack nhắm nhánh G1, khác trigger PR vào main. Gate hiện hữu không bị sửa.

| Lượt CI | Kết quả | Nguồn |
|---|---|---|
| Unit | **90 suite / 734 test** | Step Unit tests |
| SQL/HTTP chung | **33 suite / 313 test** | Step E2E; gồm 9 case P02 mới |
| Retrieval riêng | **8 test** | DB riêng, không cộng vào 313 |
| Material migration riêng | **4 test** | DB riêng; P02 không thêm migration |
| Career migration riêng | **5 test** | Gate kế thừa giữ nguyên |
| Build/lint/audit/rollback | Đạt | Cùng run code phía trên |

Đã áp seed MINI vào **VIntern_M2_BROWSER** và **VIntern_Test_Learning_20261014** sau khi CI đạt. Mỗi DB thêm **6 template + 6 public revision**, assessment vẫn 0; chạy lại trả inserted 0/preserved 6. Snapshot counts/digest của identity, mẫu cũ, run và các bảng nghiệp vụ được bảo vệ khớp trước/sau. MDF/LDF được resolve thực trong workspace. Nguồn `p02-native-activation.json`; không reset DB hoặc tạo/sửa tài khoản.

Preview đầu gặp timeout SQL 15 giây; giữ `p02-native-error-first.log` và log đỏ. Preview cùng phép kiểm chạy lại đạt, không đổi timeout ứng dụng hoặc dữ liệu để che lỗi. Activation sau đó đạt. Tri thức mới vẫn chỉ là bundle để kiểm/duyệt, không tự publish vào runtime; CLI export đã chạy thật và trả đúng 18 mục JSON.

Readiness **05:14:38 UTC** đạt health hai API 8080/8081, HTTP 200 route FE 3001, và **7 password login/scope** trên API chính, gồm đủ ba tài khoản trắng gốc. Staff đọc đủ sáu mẫu và public revision; intern nhận 403 với thư viện quản trị. DB QA được kiểm seed/digest qua SQL và health API riêng; không mô tả bảy lượt login này như bảy lượt trên cả hai DB. Nguồn `p02-native-readiness.json`.

Lượt readiness đầu timeout HTTP ở bước login; giữ `p02-native-readiness-error-first.log` và log đầu. Cùng phép kiểm với timeout cũ chạy lại đạt, không reset mật khẩu/tài khoản, không sửa code ứng dụng để lấy kết quả xanh. Chưa tái hiện ổn định nguyên nhân timeout, không suy đoán đây là lỗi nghiệp vụ của sáu mẫu.

## Giới hạn cần giữ khi bàn giao

- Starter là bài để sinh viên hoàn thành; không gọi TODO là lời giải. Hai public test mỗi bài chưa chứng minh tất cả business rule đều được phủ.
- Đây là module Node cho nền tảng backend; không phải sáu ứng dụng web full-stack hoặc sáu nghề mới. Hợp đồng ghi rõ giới hạn Booking tuần tự/Blog chưa auth.
- P03 còn lời giải, faulty variants, hidden suite và trusted binding/receipt. P04 còn UI preview/tải/biên soạn gói nhỏ.
- Bundle tri thức có thể đưa vào workflow hiện hữu; published phải có người duyệt/version/audit thật. Nguồn bundled ở GitHub public không phải kho bí mật đề thi.
- Chưa có run thật của tất cả Agent đọc 18 mục; chưa chuyển Interviewer/Planner/Reviewer/Mentor cũ trong lát cắt này. CV/email/kỷ luật/lời mời GitHub mới vẫn theo các gate G3–G6.
