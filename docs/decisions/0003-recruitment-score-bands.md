# ADR 0003 — Ba mức điểm và đề xuất vai trò từ câu trả lời

## Trạng thái

Chấp nhận theo yêu cầu ngày 21/10/2026. Thay chính sách phỏng vấn mới trước đây dùng `>=70` để đậu. Các quyết định khác trong ADR 0001/0002 tiếp tục áp dụng.

## Bối cảnh

Người học ở mức trung gian cần một hướng phù hợp để tiếp tục, thay vì chỉ nhận thông báo rớt. Người dùng xác nhận tối đa 3 lượt tổng cộng. Cần giữ dữ liệu cũ, quyền phân công và hợp đồng API hiện hữu.

## Quyết định

- Điểm tổng hợp vẫn làm tròn một chữ số từ 70% chuyên môn + 30% kỹ năng mềm.
- `<50`: chưa đạt. `50..70`: đề xuất role khác. `>70`: đậu.
- BE quyết định eligibility. Trạng thái persisted vẫn `passed|failed`; nhóm được đề xuất role chưa được coi là tuyển dụng đạt.
- Prompt v4 yêu cầu AI chọn một role khác có trong danh sách, nêu lý do và vị trí câu trả lời làm căn cứ. Validator từ chối role trùng/thiếu, lý do rỗng, câu hỏi không tồn tại hoặc chưa trả lời.
- Lý do và references được lưu cùng feedback hiện có; không thêm bảng/cột và không viết lại kết quả cũ.
- Người học xác nhận role cho lần tiếp theo. Đổi role không tăng lại ngân sách; bắt đầu phiên mới mới tiêu thụ lượt. Config không thể nâng giới hạn trên 3; cooldown hiện hữu vẫn áp dụng.

## Lựa chọn đã cân nhắc

Tạo thêm trạng thái profile `role_recommended` sẽ làm thay nhiều guard, query eligibility và client trong khi chưa có quyền mới. Chọn một role fallback cố định dễ triển khai nhưng không đáp ứng yêu cầu phân tích câu trả lời. Tự động đổi role sẽ làm mất quyền lựa chọn của người học. Vì vậy giữ trạng thái eligibility, bổ sung hướng dẫn có bằng chứng và yêu cầu xác nhận.

## Hệ quả và kiểm chứng

Mốc đúng 70 không đậu ở bài mới. Kết quả cũ vẫn theo decision đã lưu. Bằng chứng question-position chỉ xác nhận nguồn được viện dẫn có tồn tại; không chứng minh AI hiểu hoàn hảo nội dung. Unit, FE integration và SQL E2E kiểm tra công thức, nhánh kết quả, quyền chọn role, giới hạn lượt, retry và việc không cấp assignment khi chưa đậu. Không diễn giải đề xuất là chứng nhận năng lực hoặc phân công tự động.

Nguồn: [scoring](../../src/recruitment/scoring.ts), [recommendation policy](../../src/recruitment/recommendation-policy.ts), [evaluation service](../../src/recruitment/recruitment-evaluation.service.ts), [attempt policy](../../src/recruitment/attempt-policy.ts).
