# Hợp đồng runner tin cậy

Mã thực thi service, Docker images, bộ test Notes, công cụ tạo catalog và Docker smoke CI đã có trong [grading-runner](../../grading-runner/README.md). Backend gọi service riêng; không cài dependency hoặc chạy code sinh viên trên host API. Bộ test do giảng viên/đơn vị vận hành quản lý, không lấy lệnh/test/counts từ PR sinh viên làm authority.

## Cấu hình

GRADING_RUNNER_URL là HTTPS `/grade`; localhost HTTP chỉ development. GRADING_RUNNER_TOKEN là bearer riêng; GRADING_RUNNER_SIGNING_KEY là khóa HMAC khác token. GRADING_SUITES_JSON map **templateCode:taskId → {id,digest}**. Không dùng suite chung theo template để chấm mọi task. Digest bao gồm repository chính xác, task/spec hash, image bất biến, lệnh chạy và toàn bộ checks. Dùng prepare-catalog.mjs để sinh từ đặc tả thật đã duyệt; không điền digest giả.

Ví dụ cấu trúc (thay suite thật):

~~~json
{"LEARN-NOTES-V1:REAL-TASK-UUID":{"id":"notes-foundation-reviewed-v1","digest":"<sha256-of-reviewed-suite>"}}
~~~

POST body: repository, headSha, baseSha, templateCode, taskId, taskSpecHash, suiteId, suiteDigest, nonce, requestHash. taskSpecHash=SHA256(JSON.stringify(specification)). requestHash=SHA256(JSON.stringify toàn bộ request trước requestHash), theo đúng thứ tự adapter gửi. Không nhận ref mutable/repo/task/spec khác catalog. Sửa yêu cầu phải duyệt lại suite. Timeout adapter120s.

Response: {payload,signature}. Payload gồm status:'completed', requestHash, headSha, suiteId, suiteDigest, passed, failed, summary. Counts là integer không âm, summary<=4000chars. signature=HMAC-SHA256(signingKey,JSON.stringify(payload)) hex64. Ký đúng bytes object payload gửi lại. Adapter so sánh constant-time, verify toàn request/suite/SHA; replay của bài khác không hợp lệ.

## Yêu cầu triển khai

Runner tải archive tối đa20MiB từ codeload GitHub cố định, không redirect/extract trên host. Bài sinh viên và tester ở hai container non-root riêng, root filesystem chỉ đọc, dropped capabilities, no-new-privileges, giới hạn CPU/RAM/PIDs/tmpfs/output/deadline. App dùng network none; tester chỉ chia sẻ namespace loopback của app. Không bridge, host gateway, Internet, published port, secret, Docker socket hoặc host IPC. Tester không mount source, không import test sinh viên; signer ở ngoài cả hai container. Dependency/image pin và review, install hooks không chạy trên host. Dọn tester trước app và kiểm tra không còn container; lỗi cleanup không sinh kết quả đạt.

Suite kiểm tra tiêu chí của đúng task, có negative tests. Thiếu dependency/source/suite/runtime hoặc timeout/report/dọn tài nguyên lỗi trả503, không ký PASS. Suite chạy xong nhưng có check lỗi trả completed với failed>0 và tên check lỗi. Kết quả GitHub Actions của sinh viên chỉ bổ sung bằng chứng. Suite Notes có hợp đồng data-testid rõ trong README; không tự áp cho mọi UI/template hoặc yêu cầu task chưa bao phủ.

Ngày 15/10/2026 đã triển khai worker trong WSL riêng với Docker Linux và kiểm tra hai container thật: fixture đúng 2/2, fixture bỏ validation 1/2 và bị phát hiện. BE adapter đã gọi HTTP/HMAC tới worker dưới service user và nhận cùng kết quả. Archive là fixture sở hữu nội bộ; catalog bài nộp thật còn trống, chưa nghiệm thu OAuth/repo/PR thật hoặc remote CI. Xem README runner để build, niêm phong catalog và giữ WSL hoạt động. Manual teacher review cần lý do rõ ràng, được ghi audit.
