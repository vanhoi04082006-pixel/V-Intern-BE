# Dùng skill audit bảo mật Cloudflare

## Skill đã được cài như thế nào?

Skill chính thức là **`security-audit`**, từ [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill). Bản cấu hình ngày 28/10/2026 khóa ở commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`; không tự tải bản mới mỗi lần dùng.

Nội dung skill lưu trong vùng công cụ của workspace V-INTERN trên ổ E. Thư mục skill người dùng Codex có một liên kết tới nội dung đó. Các project khác của cùng người dùng có thể dùng skill, không cần chép nó vào từng repo. Nếu di chuyển/xóa workspace này, cần cập nhật liên kết.

Theo [tài liệu Codex](https://learn.chatgpt.com/docs/build-skills), skill ở phạm vi người dùng áp dụng cho các repository của người dùng và hỗ trợ thư mục liên kết. Skill được chọn khi yêu cầu khớp mô tả, hoặc khi gọi trực tiếp. Đây không phải một dịch vụ chạy nền hay một CI gate mới.

## Cách gọi

Từ lượt chat tiếp theo trong project cần kiểm tra:

```text
$security-audit
Kiểm tra bảo mật repository hiện tại. Đọc source trước, giữ nguyên source.
Lập phạm vi và ma trận coverage, báo cáo các phát hiện có bằng chứng.
Đặt báo cáo trong thư mục audit riêng bên ngoài repo, thuộc workspace dự án.
```

Nếu skill chưa xuất hiện, mở chat mới hoặc khởi động lại Codex. Cài skill chỉ làm nó khả dụng; không có nghĩa mọi project đã được audit.

## Hai chế độ

| Nhu cầu | Cách skill làm việc |
|---|---|
| Hỏi về bảo mật hoặc xem một lỗi cụ thể | Guidance: chỉ dùng phần liên quan; không tự tạo bộ báo cáo đầy đủ |
| Yêu cầu audit cả codebase hoặc báo cáo đầy đủ | Full audit: khảo sát → hunting theo coverage → xác minh độc lập → JSON → kiểm tra lại → báo cáo |

Skill yêu cầu nguồn, trust boundary và kết quả cụ thể. Thiếu best practice không tự động được coi là lỗ hổng. Giả thuyết còn thiếu chứng cứ phải là `needs_validation`, không được gán severity như lỗi đã xác nhận.

## Với V-INTERN

- Audit BE và FE thành hai target riêng, ghi commit và trạng thái worktree của từng repo.
- Đặt output dưới vùng runtime/audit của workspace, nằm ngoài hai repo; không mặc định ghi vào thư mục người dùng trên ổ C.
- Giữ nguyên DB, tài khoản trắng và source. Không dùng mật khẩu/token thật làm fixture.
- Chỉ chạy target-controlled test hoặc PoC khi sandbox đáp ứng đủ điều kiện của skill: chặn mạng ngoài, environment allowlist, source/toolchain chỉ đọc, scratch riêng và giới hạn tài nguyên.
- Nếu thiếu một điều kiện sandbox, tiếp tục đọc source và ghi rõ phần cần xác minh; không dùng runtime QA đang chia sẻ làm bằng chứng PoC của audit.
- Bằng chứng nghiệm thu nghiệp vụ với dịch vụ thật là một loại báo cáo riêng; không đổi tên chúng thành sandbox security audit.

Sau full audit phải có `REPORT.md`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`, `findings.json`, `coverage-ledger.json`, `architecture.md`, `run-metadata.json`, cùng kết quả hai validator của skill. Chỉ công bố bản đã lược dữ liệu riêng khi được phép; không đưa nguyên log hoặc bí mật vào repo public.
