# Hợp đồng runner tin cậy

Adapter GradingRunnerService gọi service riêng; BE không npm install/chạy code sinh viên trên host của ứng dụng. Để nghiệm thu thực thi cần runner đã triển khai và test suite do giảng viên/đơn vị vận hành quản lý, không lấy lệnh/bộ test chấm từ PR sinh viên làm authority.

## Cấu hình

GRADING_RUNNER_URL là HTTPS; localhost HTTP chỉ development. GRADING_RUNNER_TOKEN là bearer riêng cho service; GRADING_RUNNER_SIGNING_KEY là khóa HMAC riêng. GRADING_SUITES_JSON map templateCode → {id,digest}, digest là SHA25664hex của suite đã review. Không đặt template/digest giả để bật PASS.

Ví dụ cấu trúc (thay suite thật):

~~~json
{"LEARN-NOTES-V1":{"id":"notes-contract-v1","digest":"<sha256-of-reviewed-suite>"}}
~~~

POST body: repository, headSha, baseSha, templateCode, suiteId, suiteDigest, nonce, requestHash. requestHash=SHA256(JSON.stringify của toàn bộ request trước khi thêm requestHash), theo đúng thứ tự mà adapter gửi. Không chấp nhận ref mutable hoặc repo ngoài allowlist. Timeout tối đa120s.

Response: {payload,signature}. Payload gồm status:'completed', requestHash, headSha, suiteId, suiteDigest, passed, failed, summary. Counts là integer không âm, summary<=4000chars. signature=HMAC-SHA256(signingKey,JSON.stringify(payload)) hex64. Ký đúng bytes object payload gửi lại. Adapter so sánh constant-time, verify toàn request/suite/SHA; replay của bài khác không hợp lệ.

## Yêu cầu triển khai

Runner fetch đúng immutable commit; code và archive là untrusted. Thực thi trong worker/container dùng một lần, non-root, không network/secret/docker socket, readonly suite, giới hạn CPU/RAM/PIDs/disk/output và deadline. Dependency/test image pin và review; không cho install hook/untrusted command chạy ngoài worker. Service signer/keys ở bên ngoài sandbox, không nhận counts do sinh viên tự công bố làm kết quả test.

Suite phải kiểm tra tiêu chí của template/task, có negative tests và test pass có ý nghĩa. Thiếu dependency, source, suite, runtime hoặc timeout thì trả failed/inconclusive, không completed/passed. Kết quả GitHub Actions của sinh viên không thay suite này.

Máy local hiện không có Docker/runner cấu hình; unit tests chỉ chứng minh adapter reject chữ ký sai, request/suite/SHA mismatch và counts sai. Đây chưa phải bằng chứng execution sandbox đã vận hành. Manual teacher review vẫn cần explicit reason; không đánh dấu feature execution nghiệm thu xong khi chưa có runner thật.
