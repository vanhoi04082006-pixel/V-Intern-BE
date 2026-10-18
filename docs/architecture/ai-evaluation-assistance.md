# AI hỗ trợ đánh giá

Cập nhật theo implementation ngày14/10/2026.

AI đọc facts của intern/project/session trong scope giảng viên để đề xuất rubric và feedback. Suggestion có provenance/run/version; không finalize evaluation hoặc thay đổi điểm chính thức.

Giảng viên xem xét evidence và nhập/quyết định evaluation. Permission và ownership kiểm tra tại BE, không dựa vào UI ẩn nút. Model output được validate và không nhận trường quyết định từ provider làm authority.

Thiếu provider/facts hoặc lỗi response trả trạng thái có thể thử lại. Code review và evaluation assistance là hai nghiệp vụ: code review dùng immutable GitHub evidence/runner, evaluation assistance tổng hợp kết quả học tập đã lưu.

Xem [mục lục](../README.md), controller/DTO tương ứng và tests trước khi thay đổi contract.
