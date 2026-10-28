# Tìm lỗi theo dấu vết, không đoán

Trước khi đổi dữ liệu hoặc cấu hình, ghi lại: vai trò đang đăng nhập, URL FE, endpoint lỗi, HTTP status, `code`, `traceId`, thời điểm và ID phiên/task liên quan. Không chép password/token/raw provider response vào báo cáo lỗi.

## Đọc mã lỗi

| HTTP | Ý nghĩa thường gặp | Cách xử lý đầu tiên |
|---|---|---|
| 400 | Input/DTO không hợp lệ | Đối chiếu tên field, kiểu, ngày và UUID |
| 401 | Không có hoặc hết phiên đăng nhập | Đăng nhập lại, kiểm tra origin/refresh flow |
| 403 | Thiếu quyền hoặc ngoài phạm vi | Kiểm tra principal và ownership tại server |
| 404 | Không có dữ liệu, không thuộc quyền hoặc chưa có bản kết quả | Đọc error code và ngữ cảnh endpoint |
| 409 | Trạng thái/version/phụ thuộc đang xung đột | Tải lại dữ liệu, đọc điều kiện đang chặn |
| 429 | Quá nhiều lời gọi trong khoảng thời gian | Dừng lặp request, chờ đúng hạn |
| 503 | SQL hoặc tích hợp chưa khả dụng | Kiểm tra dependency, giữ dữ liệu đã nộp |

Không coi mọi 404 là lỗi route. Ví dụ chưa từng refresh khuyến nghị AI có thể chưa có record; giao diện phải cho biết cách tạo lần đầu. Ngược lại, không che 500 thành một màn hình trống “chưa có dữ liệu”.

## Sinh viên không thấy Sprint

Kiểm tra theo thứ tự: sinh viên đã đậu chưa → có assignment active đúng phiên chưa → kế hoạch đã confirm chưa → Sprint đã active chưa → task có đúng assignee chưa. So sánh ID, không chỉ so tên hiển thị. Một kế hoạch draft hoặc Sprint planned ở giảng viên không chứng minh sinh viên có Sprint đang chạy.

## Kéo Kanban không được

- Nhảy bước: chuyển theo `todo → doing → review → done` và quyền của vai trò.
- Task phụ thuộc: đọc `details.blockedBy`, mở nhiệm vụ đang chặn.
- Chuyển Review: hoàn tất hộp nộp bài; mở hộp chưa phải đã nộp.
- Done: cần giảng viên duyệt đúng submission.
- Xung đột version: tải bản mới trước khi cập nhật, không ghi đè mù.

## AI chấm không xong

Phân biệt timeout/provider unavailable với JSON/schema không hợp lệ. Xem `ai_runs` theo resource ID và mã lỗi an toàn. Phỏng vấn phải giữ bài đã nộp ở trạng thái có thể retry; lỗi AI không trừ thêm lượt và không tự ghi failed. Mức điểm 50–70 cần role khác, lý do và references tới câu đã trả lời; thiếu bằng chứng thì không được tạo một đề xuất mặc định.

## Repository chưa sẵn sàng

Kiểm tra tài khoản chung do Admin chọn, trạng thái active của user sở hữu credential, kết nối GitHub và scope. Repository cũ vẫn dùng owner đã lưu. Thành viên phải liên kết đúng danh tính và chấp nhận invitation. Không suy ra GitHub username từ email Gmail.

Nếu callback lỗi, so callback URL tuyệt đối với OAuth App, kiểm tra state còn hạn và cổng/origin. Nếu token hết hạn, service thử refresh theo version/lease; bị từ chối thì liên kết lại bằng chính luồng OAuth, không dán token vào DB.

## Nộp được nhưng không duyệt được

Kiểm tra repository/session/author, base/head SHA, thay đổi PR sau khi nộp và tình trạng review. `inconclusive` nghĩa là bằng chứng chưa đủ, không phải bài đạt. Thiếu suite đúng task/spec cần cấu hình/chấm thủ công theo policy, không lấy test của sinh viên làm bộ test tin cậy.

## Chỉ số hoặc báo cáo khác nhau

So phạm vi project/session, trang, khoảng ngày, trạng thái finalized và thời điểm snapshot. KPI thiếu thành phần được chuẩn hóa trọng số, không tự đổi thành 0. Báo cáo cũ không tự tính lại. CSV “trang hiện tại” không phải toàn bộ sinh viên của hệ thống.

## Khi nào mới sửa database?

Sau khi đã có nguyên nhân và phương án cụ thể. Dùng migration hoặc thao tác nghiệp vụ có audit khi phù hợp. Reset không phải cách khôi phục mặc định. Luôn giữ database chính và tài khoản gốc; test dùng DB E2E được xác định riêng.
