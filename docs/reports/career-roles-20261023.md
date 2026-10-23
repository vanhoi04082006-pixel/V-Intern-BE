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

Chưa áp dụng migration vào hai DB demo chính. Chưa có API/UI quản trị (R02/R03); 5 role trong luồng cũ vẫn giữ nguyên behavior. Revision là append-only qua domain API sẽ được xây ở R02, không phải cơ chế chống DBA sửa SQL trực tiếp. CI của commit mới phải được đối chiếu riêng; [M00](ci-recovery-20261023.md) chỉ là baseline cũ.
