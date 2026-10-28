# Bảng tra các nhánh xử lý quan trọng

Chương này giúp trả lời “khi điều kiện khác đi thì hệ thống làm gì?”. Đọc cùng chương nghiệp vụ được liên kết; endpoint/DTO cụ thể ở [API](api/README.md). Một nhánh lỗi có chủ đích không nên được sửa bằng cách bỏ guard.

## Danh tính và tuyển dụng

| Tình huống | Hệ thống xử lý | Người dùng nên làm |
|---|---|---|
| Đăng ký hợp lệ, email mới | Tạo user intern/profile trong transaction | Đăng nhập rồi tuyển dụng |
| Email trùng, terms/input sai, đăng ký đóng | Trả conflict/validation/closed, không thành công giả | Đọc thông báo hoặc dùng tài khoản đã có |
| Access token hết hạn | Theo refresh flow/rotation, vẫn kiểm tra trạng thái user | Đăng nhập lại nếu không thể phục hồi |
| Permission có nhưng bản ghi ngoài scope | Từ chối theo ownership | Chọn đúng phiên hoặc xin quyền chia sẻ |
| Còn lượt, hết cooldown | Start session và tiêu thụ một lượt | Trả lời theo thứ tự |
| Hết 3 lượt | Chặn start mới | Liên hệ giảng viên/Admin; đổi role không tạo lượt |
| Session hết hạn | BE chặn ghi/nộp theo thời điểm server | Đọc trạng thái và khả năng bắt đầu lại |
| AI timeout/schema sai | Giữ bài, cho retry đánh giá cùng bằng chứng | Không làm lại toàn bài chỉ vì lỗi chấm |
| Điểm mới dưới 50 | Chưa đạt | Đọc phản hồi, chuẩn bị lại nếu còn lượt |
| Điểm mới 50–70 | Role khác + lý do + references câu đã trả lời | Tự xác nhận hướng tiếp theo |
| Điểm mới trên 70 | Passed | Vào workspace chờ phân công |
| Kết quả cũ đã lưu | Giữ decision/model/version lịch sử | Không suy lại từ ngưỡng mới |

Đọc sâu: [tài khoản](architecture/registration.md), [phỏng vấn](architecture/recruitment-chat.md), [bảo mật](SECURITY.md).

## Chuẩn bị và thực hiện dự án

| Tình huống | Hệ thống xử lý | Điều không được suy diễn |
|---|---|---|
| Template active, yêu cầu tạo hợp lệ | Tạo run/project/session snapshot | Template thay đổi không sửa run cũ |
| RequestId lặp | Trả bản đã tạo theo contract | Không cần tạo thêm phiên để “thử lại” |
| Template archived hoặc editor stale | Chặn Start/conflict version | Không ghi đè mù |
| Sinh viên chưa passed/đang assigned/slot đầy | Chặn assignment | Không tự đổi role hoặc bỏ capacity |
| AI plan nháp | Chờ giảng viên đọc/sửa/confirm | Chưa có task thật cho sinh viên |
| Confirm sai graph/roster/ngày/version | Từ chối, không publish một phần | Không xóa validation để publish |
| Một Sprint khác đã active | Chặn active Sprint thứ hai | Planned không phải active |
| Task có predecessor chưa Done | Trả blocker | Không cho nhảy dependency |
| Kéo Doing sang Review | Mở/nộp bài theo contract | Mở dialog chưa đổi trạng thái |
| Chuyển Review sang Done | Yêu cầu quyền/quyết định giảng viên | AI tốt không tự Done |

Đọc sâu: [blueprint](architecture/project-blueprints.md), [phiên](architecture/academic-core.md), [plan](architecture/learning-plans.md), [task](architecture/sprint-task-core.md).

## GitHub và chấm code

| Tình huống | Hệ thống xử lý |
|---|---|
| Chưa chọn tài khoản chung | Repo chưa được tạo, có trạng thái cần cấu hình |
| User owner bị khóa/token không dùng được | Chặn dùng credential, không đổi owner giả |
| Thành viên chưa liên kết/chưa nhận invitation | Hiển thị cần kết nối/chấp nhận; chưa khẳng định đã push được |
| OAuth state cũ hoặc identity/version đổi | Từ chối callback/refresh đến muộn theo guard |
| PR sai repo/author hoặc SHA đã đổi | Từ chối hoặc yêu cầu bằng chứng mới theo policy |
| Source bị cắt hoặc thiếu quyền | Đánh dấu partial/unavailable |
| Thiếu suite đúng task/spec | Không có trusted PASS |
| Kết quả runner sai HMAC/request/SHA/counts | Từ chối evidence |
| Test chạy xong có check lỗi | Lưu failed checks; giảng viên đọc kết quả |
| AI review còn running | Chưa được coi là kết thúc chấm |
| Thiếu bằng chứng, cần manual review | Áp policy và yêu cầu lý do/audit tương ứng |

Đọc sâu: [GitHub](architecture/github-code-review.md), [runner](architecture/grading-runner.md).

## Kết quả và cộng tác

| Tình huống | Hệ thống xử lý |
|---|---|
| Chưa có chỉ số | Null/empty/insufficient_data; không giả điểm 0 |
| Thiếu một thành phần KPI | Chuẩn hóa trọng số phần còn đo được |
| Evaluation/KPI đã finalized | Không sửa/tính lại âm thầm |
| Sinh lương ảo cùng kỳ/người/rule | Idempotency chặn ghi trùng ledger |
| Chưa đủ điều kiện chứng nhận | Trả các lý do cụ thể |
| Tên người/phiên đổi sau cấp | Certificate snapshot giữ nội dung đã ghi |
| Chứng nhận revoked | Verify phản ánh thu hồi; không phát PDF như issued |
| Report cũ và dữ liệu hiện tại khác | Giữ snapshot; tạo bản mới nếu cần đối chiếu |
| Mất quyền scope của report | Kiểm tra lại, có thể từ chối đọc/export |
| Sharing hết hạn/revoked/đổi owner | Chặn đọc snapshot, không cấp write |
| Notification muted hoặc đã có dispatch | Không gửi trùng; không sửa task/điểm |

Đọc sâu: [KPI](architecture/evaluation-performance-kpi.md), [ledger](architecture/virtual-salary.md), [certificate](architecture/certificates.md), [report](architecture/reports.md), [sharing](architecture/session-sharing.md), [notification](architecture/notifications.md).
