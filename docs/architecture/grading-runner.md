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

Worker mới ký thêm executionTimeMs (gồm thực thi và cleanup), score=round(passed/total×100,2) và checks[{name,passed,log}] từ tester riêng. Tên lấy từ suite tin cậy, log là kết luận kiểm chứng có giới hạn, không đưa stdout/secret/source tùy ý vào phản hồi. Adapter kiểm tra thời gian0–120000ms, tổng1–50, số dòng/số pass và score phải khớp; không chỉ tin vì chữ ký đúng. Evidence lưu toàn bộ chi tiết, UI hiển thị cùng AI review. Kết quả cũ có requestHash hợp lệ vẫn đọc được khi cả nhóm chi tiết chưa có; không bịa thời gian/score cho lịch sử cũ.

## Yêu cầu triển khai

Runner tải archive tối đa20MiB từ codeload GitHub cố định, không redirect/extract trên host. Bài sinh viên và tester ở hai container non-root riêng, root filesystem chỉ đọc, dropped capabilities, no-new-privileges, giới hạn CPU/RAM/PIDs/tmpfs/output/deadline. App dùng network none; tester chỉ chia sẻ namespace loopback của app. Không bridge, host gateway, Internet, published port, secret, Docker socket hoặc host IPC. Tester không mount source, không import test sinh viên; signer ở ngoài cả hai container. Dependency/image pin và review, install hooks không chạy trên host. Dọn tester trước app và kiểm tra không còn container; lỗi cleanup không sinh kết quả đạt.

Suite kiểm tra tiêu chí của đúng task, có negative tests. Thiếu dependency/source/suite/runtime hoặc timeout/report/dọn tài nguyên lỗi trả503, không ký PASS. Suite chạy xong nhưng có check lỗi trả completed với failed>0 và tên check lỗi. Kết quả GitHub Actions của sinh viên chỉ bổ sung bằng chứng. Suite Notes có hợp đồng data-testid rõ trong README; không tự áp cho mọi UI/template hoặc yêu cầu task chưa bao phủ.

Runtime còn có profile node-http với entry đã duyệt trong `/work` và PORT3000, không chạy npm script hoặc cài dependency ngoài. Trusted API flow giữ token/ID trong tester riêng, thay biến từ response, kiểm tra JSON/HTTP và quyền hai tài khoản; tối đa20step/check, body response256KiB,3giây/request, cùng origin/no redirects. Tasks API suite có4nhóm CRUD/validation/ownership/delete. Đây là hợp đồng chức năng, chưa kiểm tra mọi framework, SQL engine hoặc persistence qua restart; chọn/điều chỉnh test theo task thật trước seal. Chi tiết endpoint và giới hạn ở README runner.

Docker thực ngày15/10 đã chạy Tasks API4/4, bài bỏ validation3/4 và bài bỏ ownership3/4; Notes cũ vẫn2/2 và bài lỗi1/2. Image reviewed mới: runtime `sha256:3bbac01aa406e28c545b0390f56ec87461a285d2bf516dcffec4541558c053c9`, tester `sha256:3b13ce66cd235ae41b5d0010ba1566a7ba8ac228a773f8a4e276d3e30a804b6e`. Đổi image làm đổi digest suite, phải seal lại task.

Ngày16/10 đã tải source commit từ PR sinh viên GitHub thật, service Docker đạt2/2 ở bản sửa và phát hiện1/2 ở bản lỗi. Catalog hiện có một foundation task QA đã seal; contract khác cần binding riêng. Lỗi restrictive UMask của systemd đã sửa bằng chmod archive0444 sau ghi;16tests Windows/WSL đạt, giữ thư mục0700 và mount read-only. Raw spec xuất qua `/tasks/:id/spec/source`; không hash `/spec` chứa status phụ thuộc động. [Bằng chứng live](../../../docs/GITHUB-LIVE-ACCEPTANCE.md). Remote CI chưa chạy. Manual teacher review cần lý do rõ ràng, được ghi audit.
