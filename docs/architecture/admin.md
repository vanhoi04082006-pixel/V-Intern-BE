# Quản trị: cấu hình và quan sát hệ thống

## Vai trò Admin

Admin quản lý danh tính, quyền, nhóm, catalog, settings và audit. Các API quản trị kiểm tra permission và effective admin ở BE. Đổi URL hoặc ẩn/hiện menu không thay quyền server.

| Khu vực | Công việc chính | Điểm cần kiểm tra |
|---|---|---|
| Users/roles/groups | Cấp đúng vai trò/phạm vi | Không dùng signup để tạo staff |
| Templates | Tạo/sửa/clone/archive/restore | Version và snapshot run cũ |
| Question bank | Quản lý câu hỏi riêng tư | Không lộ rubric cho sinh viên |
| AI configuration | Model, timeout và retry | Không nhận API key/URL tùy ý từ form |
| GitHub settings | Chọn tài khoản repo chung | Owner cũ, numeric ID và active user |
| System status | SQL, counts và hoạt động tích hợp | Configured khác với live connected |
| Audit | Đối chiếu hành động | Không chép answer/token vào log chung |

## Sửa thư viện mẫu

Editor có JSON definition để giữ đầy đủ blueprint và các field metadata để dùng thuận tiện. `expectedVersion` chặn ghi đè bản đã được người khác sửa. Code template giữ nguyên; archive ngăn Start mới nhưng giữ các run lịch sử. Template/version mới không sửa ngầm snapshot của phiên đang chạy.

## Quản lý ngân hàng câu hỏi

List/search/filter/pagination thực hiện ở SQL. Admin xem expected concepts, scoring rubric, hints và tags; API sinh viên không được nhận các phần này. PUT/retire có row lock/version check; stale editor nhận conflict.

DELETE là ngừng dùng, không xóa vật lý. Câu đã retire không được seed tạo lại như mới. Câu đã snapshot vào một interview giữ nguyên. Role của câu đã tạo giữ cố định; muốn đổi role thì tạo câu phù hợp mới.

Đủ số câu không đồng nghĩa đủ chất lượng. Kiểm tra phase/difficulty/language, đặc biệt tối thiểu nguồn cho 2 introduction, 6 technical và 2 English của bài mới.

## Runtime AI policy

Admin có thể chọn model Gemini, timeout 10–180 giây, retry 0–3 trong schema cho phép. Policy có optimistic version và audit. Generic settings không được ghi vòng qua key dành riêng này. API key/provider transport ở server, không đi vào form response.

Policy chỉ áp dụng cho lời gọi mới và không đổi prompt version, quyết định hoặc điểm đã lưu. Một model ID hợp lệ về hình thức vẫn cần quyền tại provider. DB policy hỏng có trạng thái lỗi/fallback rõ để Admin sửa; không khẳng định provider hoạt động chỉ vì đã lưu form.

## Trạng thái hệ thống nói được gì?

SQL connectivity/latency là truy vấn thật. AI runs tổng hợp trạng thái/thời gian theo phạm vi báo cáo. OAuth/webhook/runner có thể chỉ báo cấu hình hiện diện; mở trang không tự chạy AI có phí hoặc thao tác GitHub để chứng minh live.

Danh sách repository có owner/giảng viên/trạng thái webhook và delivery an toàn, không trả token/ciphertext/secret/raw webhook payload. Worker cảnh báo hiển thị lịch quét và lỗi an toàn; xem chương [notifications](notifications.md).

Nguồn: [admin](../../src/admin), [question bank](../../src/recruitment/question-bank.controller.ts), [AI runtime](../../src/ai/ai-runtime.controller.ts), [templates](../../src/templates), [GitHub](github-code-review.md).
