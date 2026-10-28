# G2/P01 — revision mẫu và tài liệu chấm riêng · 24/10/2026

**P01 đã đạt local/CI và đã kích hoạt local.** Code `fdd23054d3222ea793c924b18da3f3b34436f238` trên nhánh `codex/g2-template-foundation`. P02–P04 và việc chuyển các AI ở G2 vẫn mở; không dùng kết quả này để nói toàn bộ G2 đã xong.

Người tiếp nhận đọc [hướng dẫn public/private, API và version](../SMALL-PROJECT-LIBRARY.md). [Đặc tả P01](../../SPEC-small-project-library.md) mô tả điều kiện nghiệm thu. Blueprint 14 ngày, API cũ và snapshot phiên cũ được giữ; phần mới là learningPackage tùy chọn và assessment ghi riêng.

[Manifest công khai](small-project-foundation-20261024-evidence.json) có source hash, CI, số liệu và readiness đã bỏ credential/đường dẫn máy/thông tin cá nhân. Các mốc code và nội dung tài liệu được ghi riêng, không biến kết quả cũ thành lượt kiểm mới.

## Ma trận yêu cầu và bằng chứng

| Yêu cầu | Hoàn thành bằng gì? | Kiểm chứng |
|---|---|---|
| Mẫu nhỏ có cấu trúc | Package v1 có prerequisites/setup/run/starter/sample; 1–2 Sprint, 3–6 task keyed, 3–7 ngày | 16 unit case: legacy, quy mô, paths, prefix/case collision, byte budgets, unknown fields, rubric/task mapping |
| Tách private | Solution/hidden/rubric/mapping ở bảng assessment riêng | HTTP create/detail/revision/start/context không có marker PRIVATE; DB definition/run snapshot không chứa private |
| Revision bất biến | Public/private version + SHA-256, transaction và trigger chặn overwrite/delete | SQL 11 test, gồm concurrent editor 200/409 và lịch sử không bị sửa |
| Ghim private theo run | Run dùng templateId/version gốc; sửa/clear assessment tạo version mới | Version hiện tại thay đổi nhưng project cũ vẫn đọc đúng lời giải v1 |
| Quyền thực phía server | Permission riêng, vai trò staff đang hoạt động và project/session scope | Intern bị chặn ngay cả khi có forged grants; revoke/locked/foreign project bị từ chối; Admin đọc đúng quyền |
| Legacy/migration | Backfill đúng bản hiện tại, giữ nguyên định nghĩa/version/run cũ | 4 migration test riêng: empty round-trip, preserving backfill, grants, immutable/FK và rollback guard |
| Seed giữ dữ liệu | Append revision khi insert/upgrade hợp lệ; không sửa custom/archived/later versions | Unit seed + CI seed hai lượt; không sửa template_runs |
| Regression | Tạo phiên/roster/readiness/AI plan cũ còn nguyên | 30 SQL test local của 3 suite; CI Backend giữ đủ gate cũ |

## Số liệu và nguồn

Thư mục bằng chứng local: **workspace/manual-runtime/small-project-library-20261024/**. Timestamp JSON dùng UTC; ngày báo cáo theo UTC+7. Credential và đường dẫn máy không được đưa vào repository.

| Lượt kiểm | Kết quả | Nguồn |
|---|---|---|
| Unit BE local | **87 suite / 725 test** | `p01-unit-final.log` |
| Build/lint | Đạt; 15 console warning cũ, không lỗi lint | `p01-build-final.log`, `p01-lint-final.log` |
| SQL regression local | **3 suite / 30 test** | `p01-sql-final.log`; 11 material + 11 library + 8 start-session |
| Migration local riêng | **1 suite / 4 test** | `p01-migration-final.log`; schema cũ và DB disposable khác |
| CI code | **Success** đúng SHA fdd2305 | [Actions 40061277022](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/40061277022) |
| CI SQL/HTTP chung | **32 suite / 304 test** | Step E2E của run trên |
| CI retrieval | **8 test** riêng | Step retrieval scope trên database riêng |
| CI material migration | **4 test** riêng | Step template-material migration trên database riêng |
| CI career migration | **5 test** riêng | Gate nghề nghiệp hiện hữu, không gộp vào material migration |
| Native runtime | Hai API health, 5 route đọc mới, FE 3001; **7 identity login/scope** đạt | `p01-native-readiness.json`, 04:21:25 UTC |

16 unit case đã nằm trong 725; 11 SQL material nằm trong 30 local và 304 CI. Không cộng chồng các nhóm hoặc mô tả những lượt/database riêng như một lần full-suite chung.

## Các lỗi tìm được khi kiểm

- Kiểm prefix collision bằng hai tên kề nhau sau sort bỏ sót `src`, `src-app.js`, `src/app.js`. Test đỏ tái hiện; validator kiểm tất cả đường dẫn cha bằng tập tên, giữ nguyên ngân sách và path policy. Nguồn: `p01-prefix-red.log`.
- Test start-session dùng danh sách migration lịch sử thiếu career catalog. Khi đứng đầu trên DB mới, nó trả 500 trước các assertion nghiệp vụ. Đã dùng registry hiện hành, giữ nguyên 8 test nghiệp vụ/timeout/provider script. Mốc đỏ `p01-regression.log`, mốc xanh `p01-sql-final.log`.
- Hai lần dựng fixture migration đầu thiếu description/startDate theo schema thật. Đã bổ sung dữ liệu fixture đúng, không bỏ NOT NULL hoặc nới schema. Các log `p01-migration*.log` được giữ.
- Lượt readiness native đầu timeout SQL 15 giây; diagnostic được giữ riêng. Cùng phép kiểm đọc chạy lại đạt, không đổi code ứng dụng hoặc timeout để tạo kết quả xanh. Đây là lượt rerun được ghi rõ, không xóa mốc lỗi.

## Kích hoạt mà không reset

Chỉ áp dụng `CreateTemplateMaterials1763068800000` cho **VIntern_M2_BROWSER** và **VIntern_Test_Learning_20261014**. Mỗi DB có counts nghiệp vụ, digest danh tính/mật khẩu/trạng thái, digest template/version/definition và digest run snapshot khớp trước/sau.

DB chính có **6 public revision**, DB QA có **7**, đúng số template vốn có. Cả hai có **0 assessment** sau activation: không tự seed lời giải, hidden tests hay bài tập giả vào demo. Không còn migration chờ. MDF/LDF được resolve thực và nằm trong workspace `.runtime/sql/`; không suy từ env.

Hai API được restart bằng launcher có kiểm ownership; 7 tài khoản gốc/demo đăng nhập và scope đúng, gồm đủ ba tài khoản trắng ban đầu. Authenticated Admin/instructor đọc được lịch sử và assessment null của các mẫu hiện hành; intern không được vào thư viện quản trị. FE không sửa trong P01; kiểm route là read-only smoke, không gọi đó là nghiệm thu UI P04.

## Giới hạn và bước tiếp

- P01 không chạy nội dung file, không triển khai file upload/extraction hoặc arbitrary shell. Mọi suiteId/digest hiện là authoring metadata; P03 cần trusted binding và bằng chứng thực thi.
- Không dựng lại các revision đã mất trước migration. Snapshot run cũ vẫn giữ nguyên; private chưa có thì trả null, không thay bằng version mới.
- Private material của thư viện được chia sẻ cho staff có quyền; đọc theo project còn cần scope của chính phiên. Nó không phải kho dữ liệu cá nhân sinh viên.
- P02 còn sáu mẫu nhỏ và bộ tri thức được duyệt; P03 còn starter/lời giải/biến thể sai và runner; P04 còn UI. Các Interview/Planner/Reviewer/Mentor Agent và eval riêng vẫn chưa được chuyển từ kết quả này.
