# Kế hoạch học tập có thể chỉnh sửa

Planner v2 nhận snapshot blueprint, thời gian phiên, roster và kết quả phỏng vấn từng thành viên: điểm chuyên môn/tiếng Anh, kỹ năng, điểm mạnh và điểm cần cải thiện. Dữ liệu thiếu giữ null hoặc danh sách rỗng. Kế hoạch cần có tiến trình từ nhiệm vụ vừa sức đến luyện kỹ năng còn yếu.

Mỗi task có key ổn định, mô tả, người nhận, ưu tiên, deadline, acceptanceCriteria, expectedOutput, estimatedHours, complexity và skillTags. dependsOn tham chiếu key task tiền nhiệm; parentKey biểu diễn task con. Milestone có key, tên, hạn và taskKeys xác định đầu ra nghiệm thu.

Validator từ chối key trùng, tham chiếu ngoài bản nháp, tự phụ thuộc, vòng lặp, phụ thuộc đặt sau task và milestone vượt cửa sổ kế hoạch. Publish tiếp tục kiểm tra quyền giảng viên, roster, phiên, template version, deadline và idempotency trong transaction. UUID task được cấp trước để ánh xạ tham chiếu; task_specs lưu ID thật, đầu ra, kỹ năng và milestone cùng rubric.

Giảng viên sửa sprint/task, người nhận, ưu tiên, ngày, tiêu chí, giờ dự kiến, kỹ năng, phụ thuộc và chuyển task giữa sprint trước publish. Chuyển task giữ key và metadata; server xác nhận lại toàn bộ quan hệ. Sinh viên chỉ nhận công việc sau publish, với thông báo tới /intern/work; cùng request ID không gửi thông báo lần hai.

Milestone được ghi vào timeline session trong cùng transaction publish. Nếu provider trả JSON hoặc quan hệ ngày sai, planner/Mentor có một lần sinh lại qua helper dùng chung, giữ nguyên input và validator; mỗi lần có ai_runs riêng. Hết lượt vẫn lỗi thì giữ trạng thái lỗi và cho thử lại có kiểm soát, không thêm công việc hoặc lời đáp giả. Mentor dùng response schema answer/summary/followUps ngay tại provider.

Bắt đầu công việc hoặc nộp bài yêu cầu mọi task tiền nhiệm cùng project đã ở Done do giảng viên duyệt. Thiếu task hoặc chưa hoàn thành trả TASK_DEPENDENCIES_PENDING. Task detail hiển thị đầu ra và phụ thuộc. Đặc tả tham gia hash gửi runner; thay tiêu chí không tái sử dụng được suite đã niêm phong cho đặc tả cũ.

Mentor v3 nhận điểm yếu phỏng vấn cùng yêu cầu task và code feedback. Với bài nộp GitHub, collector kiểm tra snapshot/freshness, loại file secret, cung cấp tối đa 6 file/18.000 ký tự. Thiếu quyền/kết nối/source trả unavailable; cắt source đánh dấu partial. AI không tuyên bố đọc cả repo hoặc viết toàn bộ bài thay sinh viên.
