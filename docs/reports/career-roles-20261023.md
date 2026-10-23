# M01 — Thư viện nghề nghiệp động

## R01: schema và migration

**Đạt kiểm thử local SQL Server 2019 ngày 23/10/2026.** Đây là nền tảng dữ liệu; chưa chuyển consumer hay nghiệm thu toàn bộ M01. [Đặc tả](../../SPEC-career-roles.md) giải thích phạm vi và các bước tiếp theo.

| Kiểm chứng | Expected / Actual | Bằng chứng |
|---|---|---|
| SQL E2E migration | 5 mã gốc + role lịch sử nhập thêm; không tạo RBAC; đúng entity mapping; chạy migration lặp không thêm dữ liệu | 5/5 test đạt; `test/career-role-migration.sql-spec.ts`; log local `manual-runtime/ci-recovery-20261023/career-role-sql-final.log` |
| Lịch sử | Giữ mã nghề, trạng thái, attempt=2, rubric lịch sử | Đạt trên SQL thật |
| Constraints/FK | Chặn code không tồn tại ở 3 bảng, xóa role đang tham chiếu, JSON lỗi, version=0 và archived nhận hồ sơ | Tất cả bị SQL từ chối như mong đợi |
| Rollback | Chặn khi có role lạ, role mới, metadata đổi hoặc revision mới; baseline nguyên vẹn được down/up lại | Đạt, không đụng DB chính |
| Unit BE | Không hồi quy | 78 suite / 625 test đạt; `career-role-unit.log` |
| Lint/build | Không lỗi | Đạt; lint còn 15 warning console cũ trong scripts; `career-role-lint.log`, `career-role-build.log` |

SQL dùng cổng 1437, engine 15.x trong distro VIntern-Grader có VHD thuộc workspace. Mỗi lượt tạo DB `VIntern_Test_CareerRoles_<timestamp>` mới; không drop/reset DB có sẵn. Test SQL này được tách khỏi E2E dùng chung vì cần kiểm migration trước/sau và rollback; workflow BE thêm một database riêng và chạy `npm run test:career-roles:migration`, không bỏ các gate hiện có.

Chưa áp dụng migration vào hai DB demo chính. Revision append-only qua domain API, không phải cơ chế chống DBA sửa SQL trực tiếp. [M00](ci-recovery-20261023.md) là baseline FE cũ.

**CI R01:** BE `8666d9a9f955c107faee1b16294cca4261655611` đạt cả [release gate SQL 2019](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39937179208) và [acceptance](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39937179273). Job `120359469982` xác nhận hai bước tạo DB riêng/kiểm migration nghề nghiệp đều thành công, hoàn tất 10:16:14 UTC ngày 23/10.

## R02: API quản trị có phiên bản

**Đạt local SQL Server 2019.** Có API tạo draft, xem/tìm/lọc/phân trang, xuất bản/đóng tuyển, archive/mở lại, đọc lịch sử snapshot. Endpoint và ví dụ trong [đặc tả](../../SPEC-career-roles.md).

| Kiểm tra | Kết quả | Nguồn |
|---|---|---|
| API nghề nghiệp | 6/6 đạt: auth/RBAC, draft, publish/catalog, hai update đồng thời 200/409, archive/reopen, validation | `test/career-roles.e2e-spec.ts`, local `career-api-green.log` |
| Hồi quy tuyển dụng, question bank, đăng ký + API mới | 4 suite / 33 test đạt | `career-api-regression2.log` |
| Unit BE, lint, build | 625 test đạt, lint 0 lỗi (15 warning cũ), build đạt | `career-api-unit.log`, `career-api-lint.log`, `career-api-build.log` |

Red trước implementation: endpoint chưa tồn tại, trả 404 thay vì mã nghiệp vụ yêu cầu (`career-api-red2.log`). Lượt regression đầu chưa đạt do helper đặt DB `Test` trong khi bộ đăng ký yêu cầu prefix `E2E`; đã đổi **helper local**, giữ nguyên guard test và chạy lại đạt 33/33. Không tính lượt đó là đạt.

Current/revision/audit cùng transaction. Snapshot version 1 giữ nguyên sau sửa version 2/3. Tạo nghề không tạo role RBAC. Catalog chỉ công bố published/đang tuyển và không trả trọng số/actor. Code bất biến; không có endpoint xóa cứng. CI R02 sẽ được đối chiếu theo commit mới.

**Còn R03:** UI Admin, chuyển các danh sách nghề/DTO/consumer khỏi enum cố định và kiểm role thứ sáu qua luồng phỏng vấn. R02 chưa làm CV/Agent (các module sau) hay chứng minh toàn bộ M01 đã xong.

### R03a — Consumer tuyển dụng và ngân hàng câu hỏi

Đã chuyển role selection và nhãn profile sang catalog, DTO/filter câu hỏi nhận mã động, tác vụ tạo câu hỏi kiểm mã tồn tại trước khi ghi. Bắt đầu lượt phỏng vấn mới kiểm lại published/đang tuyển trong transaction. Archive không làm mất quyền đọc buổi đã bắt đầu.

SQL E2E **4 suite / 34 test đạt** (`career-consumer-green2.log`): tạo nghề mới, draft bị chặn, chọn nghề sau publish, pool thiếu trả 503 với mã cũ `INTERVIEW_QUESTION_POOL_INSUFFICIENT` và attempt vẫn 0; soạn 10 câu cho nghề mới, archive chặn bắt đầu, mở lại bắt đầu 10 snapshot/attempt 1, archive sau đó không xóa buổi thi. Hồi quy tuyển dụng/question bank/đăng ký cùng đạt. Giữ 400/`VALIDATION_ERROR` với nghề không tồn tại. Unit BE 625 test, lint/build đạt (`career-consumer-unit.log`, `career-consumer-lint.log`, `career-consumer-build.log`).

R03 vẫn mở: UI Admin/onboarding/filter nghề; schema/prompt gợi ý nghề AI còn dùng baseline và cần chuyển riêng có kiểm chứng, cùng các consumer liên quan. Không tick cả R03 chỉ vì bắt đầu được buổi thi.
