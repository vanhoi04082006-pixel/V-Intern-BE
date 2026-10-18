# AI mentor có ngữ cảnh

Cập nhật theo implementation ngày14/10/2026.

Mentor chỉ phục vụ principal intern và hội thoại của chính họ. Context gồm workspace/assignment, own tasks, sprint/project facts và dữ liệu được phép. taskId tùy chọn phải là task của sinh viên trong assignment hiện tại; thêm spec và code feedback gần nhất của task này.

Prompt version ai-mentor-v2 tách source facts khỏi message không tin cậy. Mentor giải thích, gợi ý bước làm/cách tự kiểm tra, không ghi task/evaluation/KPI/salary/certificate hay thực thi code.

Lưu user/assistant turns và run provenance; history được giới hạn theo cấu hình. Archive conversation và request concurrency có kiểm tra ownership/status. Lỗi AI không bịa câu trả lời hoặc làm mất tin nhắn đã lưu; UI cho retry và hiển thị lỗi.

Không gửi password, OAuth token, email của người khác hoặc rubric tuyển dụng. Không xem lời mentor là điểm chính thức hoặc bằng chứng test thực thi.

Xem [mục lục](../README.md), controller/DTO tương ứng và tests trước khi thay đổi contract.
