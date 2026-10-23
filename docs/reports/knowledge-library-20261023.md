# M02 — Tiến độ kho tri thức · 23/10/2026

**K01/K02 đã đạt local + CI và kích hoạt trên hai database demo.** Có metadata/phân loại, draft/published/archive, restore thành revision mới, hash, transaction, quyền đọc/soạn/publish, Q&A nhiều đáp án đúng và dry-run import không mutation. UI K03 và retrieval K04 chưa triển khai; chưa gọi đây là Agent đã được nuôi tri thức. Kho local đang để rỗng, không seed hoặc dùng tài khoản trắng để tạo nội dung thử.

Đặc tả: [SPEC-knowledge-library](../../SPEC-knowledge-library.md). Checklist: [K01–K04](../../tasks/todo.md).

| Mốc code | Phạm vi |
|---|---|
| `99f5fae` | Hợp đồng, policy, snapshot, entity, migration/index/constraint/trigger |
| `1faba2b` | Dịch vụ nội bộ Admin, lưu draft/history và kiểm thử SQL |
| `113367e` | Gate publish Q&A/rubric, vòng đời và restore không sửa revision cũ |
| `1eb20fe` | Migration permission riêng, giữ nguyên quyền các vai trò còn lại |
| `7cb3a46` | API Admin, list/filter, dry-run và kiểm HTTP/SQL đầy đủ |
| `b3a1ef7` | Schema OpenAPI có field/nested DTO; kiểm SQL/HTTP tăng lên 22, cùng logic API ở trên |

## Kiểm chứng local có nguồn

Log nằm trong `workspace/manual-runtime/ci-recovery-20261023/`; các lượt chạy dưới đây tách biệt, không cộng thành một tổng E2E duy nhất.

| Kiểm tra | Kết quả | Nguồn |
|---|---|---|
| Unit BE toàn bộ | 80 suite / 669 test đạt; gồm 25 policy draft + 15 publication | `knowledge-k02-seal-unit.log` |
| Lint/build | 0 lỗi lint, 15 warning console cũ; Nest build đạt | `knowledge-k02-seal-lint.log`, `knowledge-k02-seal-build.log` |
| SQL K01/K02 và HTTP | 22/22 đạt trên SQL Server 2019, DB disposable; 13 storage/lifecycle + 9 API | `knowledge-k02-seal-http.log` |
| Hồi quy M01 sau API/module mới | 5 suite / 47 test đạt: catalog, tuyển dụng, đăng ký, câu hỏi, template | `knowledge-k02-career-regression.log` |

SQL xác nhận: schema không seed nội dung; down/up khi rỗng giữ số tài khoản/nghề/buổi phỏng vấn; non-admin không đọc/ghi/history; sửa và tạo trùng có một kết quả thành công + một conflict; audit không chứa nội dung; audit lỗi thì cả current/revision rollback; trigger chặn sửa/xóa revision; down từ chối mất dữ liệu; thu hồi role có hiệu lực ở lời gọi kế tiếp. Chu trình publish → draft → archive → restore → publish giữ snapshot/hash cũ. Khôi phục ghi bản nguồn trong audit.

HTTP thật chạy Nest/validation/guards với JWT và SQL thật: 401/403 toàn bộ endpoint; giảng viên được cấp permission vẫn không vượt kiểm Admin; thu hồi permission đọc/publish có hiệu lực với token đang dùng; DTO chặn field authority giả; list chỉ trả metadata và search literal; import kiểm từng hàng, báo trùng và phân biệt draft/publishable, không thêm entry/revision. Q&A có hai đáp án/rubric/nguồn đi qua tạo/publish/read; sinh viên bị chặn. Không gọi LLM, không fixture điểm, chưa có browser K03.

Unit kiểm metadata, JSON không hợp lệ/cyclic/quá sâu/quá lớn, nguồn HTTPS không có user/password, phân loại tài liệu chấm và hash ổn định; publish yêu cầu nhiều cách trả lời đúng, nguồn, lỗi phổ biến, câu hỏi sâu và rubric tổng 100. Log đỏ policy/schema/HTTP được giữ để đối chiếu; helper local được sửa đúng thư mục đăng ký ts-node, không đổi cấu hình sản phẩm. Lượt HTTP đỏ đạt 13 storage nhưng sai ở route chưa được nối (404 thay vì 401); sau nối module/controller và guard, cả 22 case đạt.

## CI theo revision

| Revision | Kết quả |
|---|---|
| `e55137a` — nền K01 trước lifecycle/API | [Backend SQL 2019](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39979932519) và [acceptance](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39979932458) đạt; không dùng để chứng minh API K02 |
| `7cb3a46` — API K02 | [Backend SQL 2019](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39983252309) và [acceptance](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39983252320) đạt |
| `b3a1ef7` — API và OpenAPI cuối | [Backend SQL 2019](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39984751380) đạt, hoàn tất 16:16:58 UTC; [acceptance](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39984751342) đạt. FE vẫn ghim cặp M01; không dùng run FE M01 làm bằng chứng cho UI K03 |

## Kích hoạt local lúc 16:19 UTC

Đã dừng đúng hai tiến trình project-owned 8080/8081, áp riêng `CreateKnowledgeLibrary1762809600000` và `AddKnowledgePermissions1762896000000` trên `VIntern_M2_BROWSER` và `VIntern_Test_Learning_20261014`, rồi khởi động lại API từ bản build tương ứng. SQL instance local dùng cổng 1435; MDF/LDF cả hai DB được kiểm đường dẫn thực dưới workspace. Không chạy reset/seed, không đổi cấu hình provider hoặc worker.

Trước/sau migration, tất cả số liệu nghiệp vụ bằng nhau:

| DB | Users | Hồ sơ | Buổi PV | Câu trả lời | Câu hỏi | Phân công | Mẫu | Chứng nhận | Tổng lượt PV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VIntern_M2_BROWSER | 9 | 4 | 4 | 34 | 185 | 2 | 6 | 0 | 4 |
| VIntern_Test_Learning_20261014 | 16 | 10 | 10 | 59 | 70 | 5 | 7 | 2 | 11 |

Kho entry/revision đều bằng 0 trên hai DB. Ba permission mới chỉ được grant cho Admin; nghề vẫn có 6 metadata, 5 nghề mở tuyển. Không có migration chờ sau kích hoạt.

Readiness **16:19:49 UTC (23:19:49 giờ Việt Nam)**: cả API/database ok, OpenAPI có 9 thao tác tri thức và DTO có field; thiếu auth trả 401. Bảy tài khoản thuộc nhóm original/demo/defense đăng nhập đúng danh tính/vai trò và đọc catalog; đọc kho bằng Admin trả danh sách rỗng, bằng giảng viên/sinh viên trả 403. Chỉ sign-in và request đọc, không tăng attempt. FE 3001 trả 200 ở login, catalog Admin, onboarding và trang phiên giảng viên; chưa có UI K03.

Đã sinh lại [ROUTES](../api/ROUTES.md)/[SCHEMAS](../api/SCHEMAS.md) từ chính Swagger đang chạy lúc 16:19:36 UTC: **261 operations, 43 nhóm, 85 schema**. Đây là số endpoint/schema, không phải số luồng nghiệm thu. Hướng dẫn thao tác: [KNOWLEDGE-LIBRARY](../KNOWLEDGE-LIBRARY.md).

Nguồn local: `native-knowledge-preflight.json`, `native-knowledge-activation.json`, `native-knowledge-readiness.json`, `native-openapi-docs.json`, `native-openapi.json` trong thư mục evidence ở trên. Các file cấu hình/tài khoản riêng không commit.

## Những phần chưa được nghiệm thu

- K03: UI tìm/lọc, preview, editor và lịch sử.
- K04: lọc quyền trước ranking, citation ID/version/source, bảo vệ Mentor khỏi rubric, stale-index và injection tests.
- Chưa nhập/publish bộ 144 Q&A hoặc các tình huống theo Agent; không tự sinh hàng loạt nội dung để đủ số.
- Kiểm UI K03 và cặp FE/BE tích hợp M02 phải ghi source/CI riêng; chưa suy từ backend API hoặc run FE M01.
