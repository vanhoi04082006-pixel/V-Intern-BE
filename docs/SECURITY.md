# Bảo mật và ranh giới tin cậy

## Một request được phép khi nào?

Nó phải có danh tính hợp lệ, permission phù hợp, nằm trong scope bản ghi và đi qua DTO/domain validation. Chỉ kiểm tra role ở frontend không đáp ứng các điều kiện này.

| Ranh giới | Cơ chế chính |
|---|---|
| Người dùng → API | JWT, refresh rotation, guard, DTO whitelist/forbid unknown |
| API → SQL | Tham số hóa truy vấn, transaction/version, kiểm tra ownership |
| API → AI | Context tối thiểu, untrusted content tách khỏi instruction, structured schema |
| API → GitHub | OAuth state/PKCE, ID bền vững, token mã hóa, URL/host policy |
| API → runner | Token riêng, suite/spec/SHA binding, chữ ký HMAC |
| Sharing | Consent theo phiên, expiry/revoke và kiểm tra mỗi lần đọc |

## Mật khẩu, token và logs

Password dùng bcrypt và giới hạn byte UTF-8 trước hash. Refresh cookie HttpOnly được rotate theo family và phát hiện replay. GitHub access/refresh mã hóa theo user/AAD, giữ version/lease khi gia hạn. Không trả hash/ciphertext/plaintext secret ra FE, prompt, runner hoặc log.

Audit ghi hành động, resource IDs và metadata an toàn. Không log toàn body auth, câu trả lời phỏng vấn hoặc raw provider body chỉ để tiện debug. Khi chia sẻ log, giữ error code/traceId/thời điểm và loại bỏ secret.

## Dữ liệu sinh viên là không tin cậy

Câu trả lời có thể chứa prompt injection. Source/README có thể chứa hướng dẫn yêu cầu gửi token. PR có thể đổi sau khi nộp. Test của sinh viên có thể tự tuyên bố pass. BE phải giữ các trường hợp này ở vai trò dữ liệu, không coi là chỉ thị hoặc bằng chứng độc lập.

Collector giới hạn source/diff và lọc credential files. Runner không chạy trên API host; signer ở ngoài sandbox. Warning/truncated evidence không được biến thành `complete=true`.

## Quyền thay đổi theo thời gian

User bị khóa, consent bị revoke, đổi lead hoặc mất ownership phải được kiểm tra lại lúc thao tác thật. Một tab đã mở hoặc một token còn hạn không tự giữ quyền cũ. Refresh/callback đến muộn không được hồi sinh connection đã disconnect.

## Giới hạn hiện tại cần hiểu đúng

Rate limiter theo process cần được xem lại nếu chạy nhiều instance. Signup chưa có email verification/reset qua email hoặc Google OAuth hoàn chỉnh. Bằng chứng GitHub/runner với fixture cụ thể không phải chứng nhận mọi framework hay triển khai production an toàn.

## Khi phát hiện sự cố

1. Ngừng thao tác gây lan rộng; giữ bằng chứng an toàn.
2. Xác định secret/dữ liệu/phạm vi bị ảnh hưởng.
3. Thu hồi/rotate qua quy trình phù hợp, có kế hoạch với dữ liệu đã mã hóa.
4. Sửa nguyên nhân và thêm regression test chứng minh chặn lại được.
5. Ghi thời điểm/phiên bản và kết quả kiểm chứng, không viết “đã an toàn” chỉ vì unit xanh.

Đọc tiếp: [dependencies](DEPENDENCIES.md), [GitHub](architecture/github-code-review.md), [runner](architecture/grading-runner.md), [kiểm thử](TESTING.md).
