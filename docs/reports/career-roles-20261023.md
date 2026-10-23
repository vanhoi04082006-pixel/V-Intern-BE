# M01 — Thư viện nghề nghiệp động

**Trạng thái mới nhất:** R01/R02 đã đạt; R03 triển khai phần Admin UI, onboarding, question bank và gợi ý nghề AI. Còn filter phân công giảng viên và consumer template. Chưa hoàn tất M01 hay toàn bộ roadmap.

| Nguồn hiện hành | Revision / kết quả |
|---|---|
| BE code | `ecc1cb8`; 629 unit, 34 SQL E2E local, lint/build đạt; [release gate](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39945513221) và [acceptance](https://github.com/vanhoi04082006-pixel/V-Intern-BE/actions/runs/39945513131) đạt |
| FE code sau bản sửa workflow/nhánh không còn nghề thay thế | `6e6e9c9`; 549 unit, lint/typecheck và 21 CI contract local đạt; [quality](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39945967274) đạt |
| Tích hợp cặp app FE/BE mới | [Run 39945967240](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39945967240) **đạt** đủ 14 bước cũ + gate catalog, FE `6e6e9c9a0c16af46ed33f15be0c5f225ce12735a` / BE `ecc1cb8`, hoàn tất 11:42:27 UTC |
| Mở rộng script nộp/chấm | FE `291f870` thêm kiểm browser trả lời đủ 10 câu/chấm/lưu SQL và sửa fixture đề xuất; local đạt, 22/22 Node contract. [CI mới](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39949202903) đang chạy; không dùng run cũ để gọi revision kiểm thử mới đã xanh |

Các số 625/548 ở dưới là bằng chứng của lát cắt trước, không phải tổng hiện hành. Không cộng các lượt chạy hoặc gọi fixture model là nghiệm thu AI live.

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

Tại mốc R02, UI và các consumer chưa chuyển. Các lát cắt tiếp theo bên dưới cập nhật trạng thái; R02 không chứng minh CV/Agent hay toàn bộ M01 đã xong.

### R03a — Consumer tuyển dụng và ngân hàng câu hỏi

Đã chuyển role selection và nhãn profile sang catalog, DTO/filter câu hỏi nhận mã động, tác vụ tạo câu hỏi kiểm mã tồn tại trước khi ghi. Bắt đầu lượt phỏng vấn mới kiểm lại published/đang tuyển trong transaction. Archive không làm mất quyền đọc buổi đã bắt đầu.

SQL E2E **4 suite / 34 test đạt** (`career-consumer-green2.log`): tạo nghề mới, draft bị chặn, chọn nghề sau publish, pool thiếu trả 503 với mã cũ `INTERVIEW_QUESTION_POOL_INSUFFICIENT` và attempt vẫn 0; soạn 10 câu cho nghề mới, archive chặn bắt đầu, mở lại bắt đầu 10 snapshot/attempt 1, archive sau đó không xóa buổi thi. Hồi quy tuyển dụng/question bank/đăng ký cùng đạt. Giữ 400/`VALIDATION_ERROR` với nghề không tồn tại. Unit BE 625 test, lint/build đạt (`career-consumer-unit.log`, `career-consumer-lint.log`, `career-consumer-build.log`).

Tại mốc R03a, UI/filter và schema/prompt AI vẫn dùng baseline. R03b/R03c bên dưới đã chuyển một phần này; không dùng kết quả của riêng R03a để tick cả R03.

### R03b/R03c — UI và gợi ý nghề từ catalog

FE `f46bb8f` đã có UI Admin, editor trọng số, history, archive; onboarding và question bank dùng catalog. Local **84 file / 548 test**, lint/typecheck/production build đạt. Browser thật đạt tạo → publish → history → soạn 10 câu qua UI → sinh viên mới chọn nghề mới → bắt đầu 10 snapshot → archive vẫn đọc buổi thi, 5 chiều rộng không tràn ngang/page error. Hướng dẫn: FE `docs/CAREER-ROLES.md`; evidence `career-browser3.log`, `phase7-evidence/career-roles/result.json` trong thư mục local CI recovery. Quality FE `f46bb8f` đạt; workflow full-stack revision đó không nạp được do SHA bị lệch indent, đã sửa và thêm assertion giữ SHA trong `jobs.sql2019.env`, không gọi run đó là đạt.

Prompt/validator đánh giá đã chuyển sang catalog published/đang tuyển do server truyền; mã nghề ngoài catalog bị từ chối, nhãn nghề mới được dùng trong feedback/notification. Input chấm có code/label/version/kỹ năng của catalog để truy vết; không thêm PII. Prompt tăng **v4 → v5**, kết quả cũ không sửa lại. Khi không còn nghề thay thế, model phải trả null, giữ nguyên điểm và thông báo rõ; không tự tạo/gán nghề.

BE local sau phần AI: **78 suite / 629 test đạt**, 4 suite / **34 SQL E2E đạt**, lint 0 lỗi và build đạt. Nguồn: `career-ai-unit-final2.log`, `career-ai-regression2.log`, `career-ai-lint-final2.log`, `career-ai-build-final.log`. Đây là schema/policy và provider fixture; chưa phải eval chất lượng model live hay LangGraph Agent.

**R03 vẫn mở:** bộ lọc nghề ở `member-selector.tsx` còn cố định; DTO template còn enum 6 nghề kể cả devops, cần xử lý tương thích lịch sử trước khi chuyển. Không tick R03/M01 toàn bộ.

### Đóng vai đầy đủ cho nghề mới

`career-browser-grade3.log` và `phase7-evidence/career-roles/result.json` xác nhận lượt đạt: Admin tạo draft/publish, đọc hai revision, soạn 10 câu qua UI; sinh viên mới chọn nghề động, bắt đầu; Admin archive; sinh viên vẫn trả lời/nộp đủ 10 câu. SQL lưu `passed`, 81.1 và `recruitment-evaluation-v5`. Không page error, không tràn ngang ở 5 chiều rộng. Hai lượt mở rộng trước fail (API chưa sẵn sàng; fixture trả nghề đã archive vào trường đề xuất) không được tính đạt. Giữ nguyên validator ứng dụng; sửa fixture thành `recommendedRole=null` ngoài khoảng 50–70 và thêm regression đỏ/xanh.

Điểm 81.1 là **fixture của harness**, không phải chất lượng model thật. Không sử dụng tài khoản trắng hoặc ghi vào hai database demo chính. Kiểm tra cuối phiên: API 8080/8081 trả health `ok`/database `ok`, FE 3001 trả 200; điều này chỉ xác nhận readiness, không thay nghiệm thu dữ liệu hay tính năng mới trên DB demo.
