# Tuyển dụng bằng hội thoại

Ngân hàng17câu/role gồm8kỹ thuật,5soft lịch sử và4câu intro/English. Session mới chọn10:2introduction →6technical →2English. Bốn roles: frontend, backend, qa, business_analyst. Snapshot giữ nguyên composition/rubric theo lần phỏng vấn; seed chèn thiếu, không ghi đè.

POST /recruitment/me/interviews tạo session/timer backend; response sinh viên không chứa câu tương lai. GET /conversation phục hồi transcript. POST /conversation/next reserve lease ngắn → AI tạo đúng planned skill/scope → kiểm tra session/current turn lần nữa → lưu delivered prompt/aiRunId. POST /clarify rephrase một lần có cache, không cung cấp đáp án. Không giữ transaction trong provider call.

PUT /answers/:questionId chỉ câu hiện tại đã ready, đúng owner và trước expiry. Câu đã gửi immutable; identical retry idempotent, câu khác/khác nội dung bị conflict. Submit yêu cầu đủ các câu (skip là trả lời rõ đã bỏ qua), chấm đồng bộ theo service và retry evaluation_failed trên cùng evidence. Hết thời gian/retake/cooldown/giới hạn lượt do server kiểm soát.

Evaluation prompt v2 dùng câu đã thực sự hỏi, clarification, câu trả lời và rubric/expected nội bộ. Rubric là tham chiếu để chấp nhận giải pháp tương đương, không bắt sinh viên chép mẫu. Model trả component scores/feedback; Backend tính overall round1(0.7technical+0.3soft), pass từ70. Không đưa mẫu/guide vào feedback/API sinh viên.

AI lỗi/response sai không quyết định fail. ai_runs lưu provider/model/promptVersion/status/error; transcript/answers giữ nguyên. Gemini JSON shape và domain validator đều kiểm tra; thought parts không nhập vào evidence, output chưa hoàn tất không được chấp nhận. Phiên8câu lịch sử có hợp đồng đọc/UI cũ, không đổi snapshot lịch sử.
