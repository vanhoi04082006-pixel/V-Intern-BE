# Thông báo và cảnh báo học tập

Thông báo sự kiện (kết quả phỏng vấn, phân công, publish sprint/task, cập nhật task, submission, AI/human review, chia sẻ và chứng nhận) được ghi cùng transaction nghiệp vụ qua `notifyInTransaction`, theo category preference. API list/unread/read/read-all chỉ thao tác bản ghi của principal; đọc thông báo không đổi trạng thái ứng tuyển hoặc task. FE kiểm tra route theo role và lifecycle trước khi điều hướng.

## Quét cảnh báo

`LearningAlertsService` chạy ngay khi bootstrap và mỗi60giây; `LEARNING_ALERTS_ENABLED=false` tắt, `LEARNING_ALERTS_INTERVAL_SECONDS` giới hạn30–3600giây. NODE_ENV=test luôn tắt timer. Mỗi lượt lấy tối đa100 cặp sự kiện/người nhận, xử lý tuần tự để giới hạn tải. Nhiều instance có thể cùng chạy: khóa range SQL trên ledger và unique PK quyết định một lần gửi; tiến trình không chạy chồng lượt của chính nó.

- Task quá hạn chưa Done: chỉ project active, session active/ending hoặc task legacy không có session. Mentor project, lead và co-instructor hiện tại nhận; union loại trùng cùng người. Student và instructor ngoài scope không nhận.
- Lần lập kế hoạch gần nhất failed: lead hiện tại nhận. Kế hoạch ready/generating mới hơn thay thế lỗi cũ, phiên hoàn tất không cảnh báo.
- Repository/webhook failed: lead hiện tại và owner repository phải khớp. Mỗi provisioning/webhook lease là một lần lỗi; retry lease mới có thể tạo cảnh báo mới. Không chép raw provider error hoặc secret vào thông báo.

Ngay trước khi gửi, truy vấn lại điều kiện/scope trong transaction. Category task/session bị tắt vẫn ghi quyết định muted vào ledger để không làm nghẽn100 sự kiện đầu. Bật lại preference không gửi bù quyết định đã muted. Deadline đổi hoặc lease retry mới tạo event mới; đọc/xóa notification không gây gửi lại. Ledger lưu notificationId nullable (ON DELETE SET NULL), không phụ thuộc retention thông báo. Job không sửa task, điểm hoặc lifecycle.

Migration29 `CreateLearningAlertDispatches1762291200000` thêm ledger/index, không sửa dữ liệu cũ. Deep link là task/session thật dưới `/instructor` hoặc `/admin` theo effective role hiện tại. Status admin trả enabled/interval/running/lần quét/kết quả gần nhất và mã lỗi an toàn; đây là trạng thái của instance nhận request, ledger là authority chung giữa các instance.

Kiểm thử SQL `learning-alerts.e2e-spec.ts`: competing workers, muted preference, task state bất biến, deadline mới, Done/completed suppression, kế hoạch thay thế, repo owner cũ và webhook lease. Unit kiểm tra timer disable, interval bounds, overlap và phục hồi sau lỗi.
