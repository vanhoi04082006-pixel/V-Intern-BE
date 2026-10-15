# Kiểm chứng thay đổi

Ngày 15/10/2026: BE 58 suite/486 test đạt, thêm test migration metadata riêng đạt; FE 59 file/432 test, typecheck/lint/build đạt. SQL đầy đủ chạy 19 suite/175 test: 18 suite đạt ngay, hai assertion version Mentor cũ đã sửa và suite Mentor 25 test chạy lại đạt. Suite planner chạy lại đạt 3 test, gồm lưu metadata/phụ thuộc bằng ID thật, chặn task khi tiền nhiệm chưa Done, mở khóa sau giảng viên duyệt và thông báo publish không trùng. Browser Chrome thật kiểm tra waiting/active, notification, chặn Mentor khi chưa phân công, Kanban/spec và mobile/drawer, không có page error. Nguồn API là DB nghiệm thu riêng qua HTTP thật; không mock response.

Migrations 25–26 đã áp dụng lên cả hai DB local, không reset dữ liệu: follow-up bền vững và bổ sung metadata thiếu mà giữ rubric đã chỉnh. Ngân hàng tăng từ 68 lên 185 câu bằng insert-only seed; 37 câu cho mỗi vai trò, gồm Fullstack.

## Bằng chứng ngày 14/10 và worker ngày 15/10

- Unit cập nhật15/10:53suites/464tests đạt.
- Build đạt; lint0errors,15warning no-console có sẵn.
- SQL E2E:19suites/174tests đạt trong một run trên database dùng một lần, migrate24 và không còn pending. SQL local engine17compat150; native2019 cần CI riêng.
- Provider thật đã qua chat10câu (negative43.5/positive93.3), plan/publish4tasks, mentor theo task và report PDF/XLSX; dữ liệu chỉ trong DB nghiệm thu riêng.
- Consent/expiry/revoke và OAuth state/PKCE/encryption/user-active query qua SQL thật. Transport GitHub được mock trong test; không coi là live GitHub provisioning.

14tests runner policy/HTTP/auth/replay/cleanup đạt. Đã cài Ubuntu24.04.5/WSL2, Docker29.9.0, Node22.23.3 trong `VIntern-Grader`; Docker thật đạt fixture đúng2/2 và phát hiện bài bỏ validation1/2. BE adapter đã biên dịch gọi HTTP/HMAC tới hai container thật và nhận đúng cùng kết quả, chạy dưới service user. Archive ở phép thử là fixture sở hữu nội bộ, không phải repo sinh viên. Service local hoạt động trên8090, catalog thật vẫn trống; OAuth App/linked accounts/repo/PR và suite cho các task/template còn lại chưa được nghiệm thu. Không có student code chạy trên host BE. Audit hai lockfile image:0vulnerabilities. Script OAuth giữ nguyên key/biến cũ và thay secret không tạo dòng trùng qua fixture kiểm thử.

Harness đầy đủ phải đặt DB_NAME=E2E_DB_NAME cùng một database explicit dùng một lần, tắt external provider và dùng test-only providers. FreshDB trước toàn run tránh fixture static-name collision. Không chạy reset trên runtime. Secret/credentials không nằm trong repository.

Chứng cứ/hướng dẫn workspace: docs/VERIFICATION.md ở thư mục cha của hai repository. Khi phát hành, cập nhật FE compatibility pin bằng BEcommit đã review và chạy lại CI nativeSQL2019/OAuth/runner thật.
