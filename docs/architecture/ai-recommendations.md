# Khuyến nghị phát triển cho sinh viên

## Khuyến nghị trả lời câu hỏi gì?

“Tôi nên luyện điều gì tiếp theo dựa trên kết quả đang có?” Khuyến nghị tổng hợp task đã được xác nhận, điểm chính thức và các chỉ số hiệu suất. Đây là tư vấn học tập, không cập nhật điểm hay KPI.

## Lần đầu và lần cập nhật

Chưa có bản khuyến nghị thì API có thể trả 404 cho record chưa được tạo; UI hiển thị trạng thái trống và nút cập nhật. Refresh thực hiện lời gọi AI, lưu provenance và tạo nội dung mới. Nếu provider lỗi, giữ bản cũ và hiển thị lỗi thay vì giả là đã cập nhật.

| Nội dung | Cách đọc |
|---|---|
| Summary | Tổng hợp trong phạm vi dữ liệu đã dùng |
| Priority | Việc AI cho là nên chú ý trước |
| Actions | Những bước người học có thể thực hiện |
| Evidence metric codes | Các chỉ số làm căn cứ; cần đối chiếu với API domain |

Không lấy dữ liệu người khác để lấp chỗ trống. Thiếu mẫu đo phải giữ là thiếu. Sinh viên cần assignment active cho luồng này; lịch sử certificate/performance không tự mở quyền sinh khuyến nghị cho một assignment đã kết thúc.

## Giới hạn

Prompt `performance-recommendation-v2` có enum, bounds và dữ liệu nguồn rõ ràng. Payload sai schema được repair tối đa một lần qua helper chung; timeout không bị nhân retry. Validator vẫn từ chối metric bịa hoặc giá trị ngoài contract, không lưu snapshot sai.

Frontend giữ quyền **đọc snapshot đã có** khi sinh viên có lịch sử phân công, kể cả sau khi phiên kết thúc. Điều này không mở khóa task/Mentor hoặc bỏ điều kiện của endpoint sinh khuyến nghị mới. Nút ở trang hiệu suất sau kết thúc dẫn tới đánh giá thay vì công việc đã khóa.

AI không biết một thay đổi ngoài hệ thống nếu chưa có bằng chứng trong dữ liệu được cấp. Số task tăng không tự chứng minh kỹ năng tăng. Người học nên trao đổi với giảng viên nếu khuyến nghị không khớp mục tiêu hoặc trở ngại thực tế.

Nguồn: [recommendations](../../src/ai/recommendations), [performance](student-performance.md), [Mentor](ai-mentor.md).
