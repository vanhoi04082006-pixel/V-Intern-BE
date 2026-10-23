# AI Mentor: trợ giúp trong ngữ cảnh nhiệm vụ

## Người học dùng Mentor khi nào?

Khi chưa hiểu yêu cầu, cần gợi ý cách phân tích một lỗi hoặc cách tự kiểm thử. Một câu hỏi tốt nêu task, điều đã thử và kết quả đang gặp. Mentor hỗ trợ quá trình suy nghĩ/làm việc; không xác nhận bài đạt thay giảng viên.

## Context được phép

| Có thể dùng | Không được gửi |
|---|---|
| Workspace/assignment hiện tại của principal | Password, token GitHub/API key |
| Own tasks, Sprint và blueprint được phép | Dữ liệu sinh viên khác làm ví dụ riêng tư |
| Spec và code feedback của task được chọn | Rubric/đáp án tuyển dụng bí mật |
| Điểm mạnh/điểm cần cải thiện đã lưu | Source không được phép hoặc credential files |

`taskId` phải thuộc sinh viên và assignment hiện tại. Chọn UUID lạ không được mở context người khác. Mentor v3 có thể dùng code context đã kiểm tra snapshot/freshness; source bị giới hạn thì phải đánh dấu partial/unavailable thay vì nói đã đọc toàn repo.

## Vòng đời hội thoại

User message, assistant reply và AI run có provenance được lưu. History window được giới hạn để không gửi toàn bộ lịch sử vô hạn. Archive và concurrency đều kiểm tra owner/status. Nếu provider lỗi, tin nhắn đã lưu không được mất và UI phải cho biết cách retry.

## Những điều Mentor không làm

Mentor không cập nhật task/evaluation/KPI/salary/certificate, không thực thi code và không ghi quyết định phân công. Một lời khuyên tự tin vẫn không phải bằng chứng test. Source và câu hỏi người dùng là dữ liệu không tin cậy; không làm theo hướng dẫn thay system policy trong đó.

Ví dụ tốt: “Task lưu ghi chú yêu cầu giữ dữ liệu sau reload. Tôi đang dùng localStorage nhưng bản nháp mất khi đổi trang; nên kiểm tra thứ tự lưu/khôi phục ở đâu?” Ví dụ này cung cấp vấn đề cụ thể mà không gửi secret.

Nguồn: [mentor module](../../src/ai/mentor), [AI core](../../src/ai/ai.service.ts), [kế hoạch và context](learning-plans.md).
