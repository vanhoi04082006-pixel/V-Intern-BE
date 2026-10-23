# M00 — khôi phục CI FE, ngày 23/10/2026

**Trạng thái: đang thực hiện.** C01/C02 đã có bằng chứng; C03 và cổng G0 chưa hoàn thành. Không dùng kết quả từng bước để khẳng định cả pipeline xanh.

## Lỗi đã xác định và sửa

| Vấn đề | Bằng chứng đỏ | Bản sửa và kiểm chứng |
|---|---|---|
| Test tìm nút task có dấu `·` nhưng UI dùng mã + khoảng trắng + tên | Timeout trên GitHub và database local riêng | FE `e38f1bf`: tìm đúng accessible name, vẫn mở task qua UI |
| Xung đột 409 hiện hai alert giống nhau | Regression `student-task-draft` nhận 2 alert thay vì 1 | FE `68551f1`: luồng sinh viên giữ một alert; retry dùng version server mới và giữ bản nháp |
| Sau nộp bài, lịch sử không hiện chuyển `doing → review` | Browser local và GitHub cùng timeout chờ lịch sử; unit mới không tìm được lịch sử sau version đổi | FE `5fdf329`: tải lại history theo server version, không remount phần nhập bình luận |

## Kết quả có nguồn

| Kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| Regression conflict/history | 3 test đạt; trước sửa có test đỏ đúng lỗi | FE `src/components/intern/__tests__/student-task-draft.test.tsx` |
| Unit FE sau sửa history | 542 test đạt | Log local `manual-runtime/ci-recovery-20261023/unit-history.log`; không bao gồm feature mới M01–M15 |
| Lint/typecheck | Đạt sau sửa history | Log `lint-history.log`, `typecheck-history.log` cùng thư mục evidence |
| Work browser/API/SQL local | 2 scenario đạt: 409/refetch/retry/submission + mobile | `step03-green9.log`; SQL local dùng riêng, không thay SQL Server 2019 |
| FE GitHub quality | Thành công | [Run 39911945064](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39911945064), commit `5fdf329` |
| FE SQL Server 2019 | Bước 01–04 thành công, bước 05 thất bại | [Run 39911945067](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39911945067), BE ghim `3989138d2e8b479b00b4a39f275ad8ee858b7911` |

Bước 05 đang đối chiếu các assertion sau redesign: số chứng nhận hiện ở definition thay vì heading; kiểm Mentor phải mở lại đúng conversation và xác nhận message history; email profile hiển thị ở nhiều vị trí nên cần kiểm field tài khoản chính xác. Không bỏ kiểm PDF, ownership, thu hồi chứng nhận, SQL KPI/ledger hoặc notification persistence.

## Môi trường và giới hạn

- Local: database mới `VIntern_Phase715_CI_Recovery_20261023`, API 8082, FE 3006. MDF/LDF đã đối chiếu nằm dưới project `.runtime/sql`.
- Không reset DB chính, không dùng tài khoản trắng để nghiệm thu. Các fixture mới nằm trong DB dùng riêng.
- Local có lượt timeout kết nối SQL và lỗi cấu hình bản frontend dùng riêng; các lượt này được ghi FAIL, không cộng vào kết quả đạt. Lượt browser đạt cuối cùng dùng bản production frontend riêng.
- AI/GitHub provider của full-stack harness là fixture rõ ràng. Kết quả CI này không được gọi là nghiệm thu model/GitHub/SMTP live.
- M00 chỉ hoàn tất khi cả quality và đủ 14 bước SQL Server 2019 xanh trên cùng FE SHA. Các bước 06–14 chưa được chứng minh bởi run này.
