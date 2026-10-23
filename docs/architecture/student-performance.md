# Hiệu suất: hiểu từng chỉ số và phạm vi

## Một trang hiệu suất đo điều gì?

Performance tổng hợp facts đã lưu, không gọi AI để tạo số liệu. Nó giúp thấy số nhiệm vụ, tỷ lệ hoàn thành, thời hạn và điểm đã chốt. Không dùng một thời điểm duy nhất để kết luận người học tiến bộ bao nhiêu.

| Chỉ số | Nguồn và cách hiểu |
|---|---|
| Total/completed tasks | Task trong scope, Done là đã xác nhận |
| Task completion rate | Completed / total; không có total thì null |
| Story point completion | Điểm độ lớn Done / cam kết |
| On-time completion | Task đã Done có hạn và hoàn thành đúng hạn / task Done có hạn |
| Overdue open | Task chưa Done và đã quá hạn ở thời điểm đo |
| Average evaluation | Trung bình evaluation finalized, không lấy draft |
| Active Sprint progress | Phần việc trong Sprint active theo định nghĩa calculator |

`null` nghĩa là chưa đo được. `0` nghĩa là đã có dữ liệu và kết quả bằng 0. Hai giá trị phải có cách hiển thị khác nhau trên API, biểu đồ và export.

## Danh sách sinh viên của giảng viên

`GET /performance/interns` tìm theo tên/email, lọc scope/ngày, sort và paginate tại SQL. Mặc định trang 10, tối đa 100. Không tải toàn bộ rồi cắt Top 10 tại FE. Search vẫn tìm được người ngoài trang đầu.

Xếp thứ tự theo tỷ lệ Done giảm dần, điểm evaluation finalized giảm dần, task trễ tăng dần, số task giảm dần và UUID ổn định. Người chưa có task/điểm được xử lý theo null semantics; đây không phải một điểm tổng AI tự suy ra.

## Chi tiết một người

Endpoint detail trả hồ sơ public, kết quả phỏng vấn đã sanitize, phân công trong scope, trang task và latest submission/AI/instructor feedback. Không trả password, rubric bí mật hay token. Mọi truy vấn con vẫn áp scope; biết UUID không tạo quyền.

## Biểu đồ thời gian

Trend sáu tháng UTC dùng task.createdAt và lần chuyển Done đầu tiên trong lịch sử append-only. Mở lại rồi hoàn thành lại không tăng số hoàn thành lịch sử nhiều lần. Bộ lọc task theo khoảng `[from,to)` trên createdAt; biểu đồ phải ghi rõ định nghĩa.

Đồ thị không có sự kiện có thể hiển thị 0 sự kiện. Điểm chưa đánh giá vẫn là null, không phải 0 điểm. CSV “trang hiện tại” chỉ chứa những hàng trên trang đó; báo cáo snapshot dùng read model đầy đủ của scope được cấp.

Nguồn: [calculator](../../src/performance/performance-calculator.ts), [performance service](../../src/performance/performance.service.ts), [báo cáo](reports.md).
