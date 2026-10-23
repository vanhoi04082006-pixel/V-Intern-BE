# M00 — Khôi phục CI FE, ngày 23/10/2026

**Đạt cổng G0.** Quality và đủ 14 bước full-stack SQL Server 2019 thành công trên cùng FE `6b11d07c42a013289960fa70854e309ee180f8fc`, ghim BE `3989138d2e8b479b00b4a39f275ad8ee858b7911`. Các commit BE kế tiếp trước mốc này chỉ cập nhật tài liệu. Kết quả không chứng minh M01–M15 đã hoàn thành.

## Kết quả có nguồn

| Kiểm tra | Kết quả | Nguồn và thời điểm UTC |
|---|---|---|
| FE quality | Lint, typecheck, test, audit production high/critical và build đều đạt | [Run 39922089336](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39922089336), job `120309489591`, 08:04:34–08:07:46 |
| Full-stack | 14/14 bước đạt trên SQL Server 2019; migrations, khởi động và cleanup đạt | [Run 39922089463](https://github.com/vanhoi04082006-pixel/V-Intern-FE/actions/runs/39922089463), job `120309490065`, 08:04:35–08:14:54 |
| Unit FE local sau bản sửa Admin | 83 file / 544 test đạt | `manual-runtime/ci-recovery-20261023/unit-settings.log`; số liệu local, không suy diễn từ metadata GitHub |
| Kiểm tra local bổ sung | Lint, typecheck và build đạt | Cùng thư mục: `lint-settings.log`, `typecheck-settings-final.log`, `build-settings.log` |

Kiểm lại bằng `gh api repos/vanhoi04082006-pixel/V-Intern-FE/actions/jobs/120309490065` và job `120309489591`. Đối chiếu `head_sha`, `conclusion` và từng `steps[].conclusion`; không chỉ nhìn badge PR.

## Phạm vi 14 bước đã đạt

1. Tạo fixture ứng dụng dùng riêng.
2. Tuyển dụng, phỏng vấn và xác thực.
3. Sinh viên làm việc, nộp bài, 409/refetch/retry và persistence.
4. Tạo fixture kết quả.
5. Kết quả sinh viên và chứng nhận.
6. Thư viện dự án, nhóm, bản nháp AI và xuất bản.
7. Giảng viên đánh giá, duyệt bài và báo cáo.
8. Luồng quản trị.
9. Điều hướng theo vai trò.
10. Nghiệm thu xác thực.
11. UI, bàn phím và responsive.
12. Kiểm tra âm về phân quyền và cách ly dữ liệu.
13. Tạo fixture KPI/lương ảo.
14. KPI, lương ảo và ranh giới thời gian UTC.

## Nguyên nhân và bản sửa

| Vấn đề | Bản sửa | Cách bảo vệ hành vi |
|---|---|---|
| Locator task dùng dấu chấm giữa, khác accessible name | `e38f1bf` | Vẫn mở task qua UI |
| Hai cảnh báo xung đột giống nhau | `68551f1` | Regression một alert, giữ draft, refetch version và retry |
| History không tải lại sau chuyển trạng thái/nộp bài | `5fdf329` | Regression đổi server version và kiểm history mới; không remount bản nháp |
| Assertion kết quả/phiên dùng cấu trúc hoặc nhãn cũ | `989b20c`, `7da8831`, `ca0dea9` | Đúng hội thoại Mentor đã lưu, số chứng nhận, email, assignment POST 201 và nhãn tiếng Việt; giữ ownership/PDF/KPI |
| Admin nhúng làm mất nút tạo cấu hình | `6b11d07` | Action trong Panel; hai regression nhúng/độc lập, tạo/lưu qua UI, không nhân đôi H1 |

Không thêm skip, continue-on-error, hạ audit hay tăng timeout để vượt cổng.

## Môi trường và giới hạn

- Giữ database chính và tài khoản trắng. Fixture trong database riêng; không reset dữ liệu demo.
- Local ban đầu dùng SQL Windows, sau đó SQL Server 2019 container `vintern-ci-sql2019-20261023`, cổng 1437. Dữ liệu container trong VHD distro VIntern-Grader tại `E:/Projects/V-INTERN/local-private-preservation/VIntern-Grader`; không đồng nhất đường dẫn MDF/LDF của hai môi trường.
- API/FE riêng: 8082/3006. Lượt local timeout screenshot và thiếu redirect do bản sao Next config được ghi lỗi môi trường, không tính đạt. Bằng chứng GitHub đầy đủ chốt cổng.
- AI/GitHub trong harness là fixture rõ ràng. Đây **không phải** nghiệm thu model, GitHub hoặc SMTP live.
- Khi M01 đổi backend, phải chạy lại cổng cho revision mới trước bàn giao/merge; không dùng báo cáo này thay nghiệm thu tính năng mới.
