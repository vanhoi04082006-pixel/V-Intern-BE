# Tuyển dụng bằng hội thoại

Ngân hàng có 185 câu, 37 câu cho mỗi vai trò: frontend, backend, fullstack, qa và business_analyst. Mỗi vai trò gồm 20 câu chuyên môn, 6 làm quen, 6 tiếng Anh và 5 soft skill cho phiên lịch sử. Phiên mới chọn 10 câu chính: 2 làm quen → 6 chuyên môn → 2 tiếng Anh. Khi đủ nguồn, phần chuyên môn tăng từ 2 dễ, 3 trung bình đến 1 khó. Seed chèn khóa thiếu; migration metadata chỉ bổ sung thuộc tính chưa có, giữ rubric đã chỉnh và snapshot lịch sử.

Mỗi câu có role, category, difficulty, language, question, expectedConcepts, exampleAnswer, scoringRubric, followUpHints và tags. Tham chiếu nằm trong rubric JSON riêng ở backend, được đóng băng theo phiên; không đưa đáp án hoặc scoring guide vào API sinh viên.

POST /recruitment/me/interviews tạo session/timer backend; response sinh viên không chứa câu tương lai. GET /conversation phục hồi transcript. POST /conversation/next reserve lease ngắn → AI tạo đúng planned skill/scope → kiểm tra session/current turn lần nữa → lưu delivered prompt/aiRunId. POST /clarify rephrase một lần có cache, không cung cấp đáp án. Không giữ transaction trong provider call.

PUT /answers/:questionId chỉ câu hiện tại đã ready, đúng owner và trước expiry. Câu đã gửi immutable; identical retry idempotent, câu khác/khác nội dung bị conflict. Submit yêu cầu đủ các câu (skip là trả lời rõ đã bỏ qua), chấm đồng bộ theo service và retry evaluation_failed trên cùng evidence. Hết thời gian/retake/cooldown/giới hạn lượt do server kiểm soát.

Sau câu trả lời chuyên môn, AI có thể hỏi thêm một câu hẹp để làm rõ chính câu trả lời đó, tối đa hai câu phụ mỗi phiên. Prompt/answer/lease/error được lưu trong interview_conversation_turns. GET conversation phục hồi lượt đang chờ; currentQuestion.kind phân biệt main/follow_up. PUT /follow-ups/:questionId lưu câu phụ bất biến, cho retry giống hệt; không cho nhảy câu chính hoặc submit khi câu phụ còn chờ. Provider không nằm trong transaction; lỗi có thể thử lại.

Evaluation prompt v3 dùng câu thực sự đã hỏi, clarification và câu phụ kèm câu trả lời. Sáu tiêu chí bắt buộc: knowledge, communication, problem_solving, english, confidence và reasoning. Confidence chỉ phản ánh cách diễn đạt điều đã biết/chưa biết, không suy đoán tính cách. Câu phụ bổ sung bằng chứng cho cùng tiêu chí, không nhân đôi trọng số. Backend vẫn tính overall = round1(0.7 × technical + 0.3 × soft), pass từ 70. Điểm tiếng Anh riêng lấy từ english; kết quả lịch sử thiếu tiêu chí này trả null.

GET /recruitment/me/interviews trả lịch sử có phân trang theo principal, chỉ gồm trạng thái và kết quả đã lưu. Dashboard đã đậu nhưng chưa phân công hiển thị điểm/kỹ năng/lịch sử và thông báo; không gọi API task hoặc mentor như workspace đang hoạt động.

AI lỗi/response sai không quyết định fail. ai_runs lưu provider/model/promptVersion/status/error; transcript/answers giữ nguyên. Gemini JSON shape và domain validator đều kiểm tra; thought parts không nhập vào evidence, output chưa hoàn tất không được chấp nhận. Phiên8câu lịch sử có hợp đồng đọc/UI cũ, không đổi snapshot lịch sử.
