# Quản trị hệ thống

Admin giữ các chức năng user/role/group/catalog/settings/audit hiện có. Ngân hàng câu hỏi, cấu hình AI và giám sát tích hợp dùng API riêng; tất cả kiểm tra permission và effective admin role tại backend. Không dựa vào việc ẩn menu.

## Template, phiên và báo cáo

`/admin/templates` có tạo/nhân bản, preview đầy đủ, sửa definition, archive/restore. Editor giữ toàn bộ metadata blueprint bằng JSON có validation server; tên/mã/mô tả có trường riêng. Update gửi expectedVersion để chặn editor cũ; metadata summary và definition được cập nhật cùng transaction và tăng version. Code giữ nguyên, session/project code rút prefix để mã template64ký tự vẫn khởi tạo được. Mẫu archived không Start được; run snapshots giữ nguyên.

`/admin/sessions` dùng cùng list/pagination và màn hình sửa academic metadata. Detail, sprint/task, performance và reports có route admin riêng; các link không đẩy admin sang layout chỉ dành cho instructor. Workflow lập/publish kế hoạch và OAuth owner vẫn thuộc màn hình giảng viên. Admin giám sát tất cả báo cáo theo permission/effective role; giảng viên vẫn chỉ thấy report của mình và mất quyền đọc nếu scope task bị thu hồi. Student/Instructor API không kế thừa quyền toàn cục của admin.

## Ngân hàng câu hỏi

`/admin/question-bank` hỗ trợ GET list/detail, POST, PUT theo version và DELETE `?version=` để ngừng sử dụng. Search/role/phase/difficulty/status và pagination ở SQL. Đáp án mẫu, expected concepts, scoring rubric, hints và tags chỉ trả cho admin. Nội dung được validate/bounded; câu English dùng language=en. Role của câu đã tạo giữ nguyên để seed identity không đổi; tạo câu mới khi muốn đổi role. Sort order quản trị cấp từ1000 và serialize transaction để không xung đột seed.

Migration28 thêm version và index. PUT/retire có row lock và version check; audit chỉ ghi version/action, không chép đáp án vào log chung. DELETE không xóa vật lý, nên seed không tạo lại câu đã nghỉ và history/FK giữ nguyên. Các interview_session_questions snapshot vẫn bất biến. Độ phủ active hiển thị theo role/phase; tối thiểu6technical/2introduction/2English cho10câu, không giả là đủ chất lượng chỉ nhờ đủ số lượng.

## Cấu hình AI đang dùng

`GET/PUT /admin/ai-configuration` quản lý model Gemini, timeout10–180giây, retry0–3 và optimistic version. Lưu tại `system_settings.ai.runtime`, audit đầy đủ. Generic settings API từ chối sửa key này để không bỏ qua validation/version. API không nhận/trả API key, endpoint tùy ý hoặc token. Model ID vẫn phải có quyền truy cập ở nhà cung cấp; lưu cấu hình không gọi provider hoặc bật provider chưa có credential.

AiService đọc policy cho lời gọi Gemini mới, giữ transport/secret ở provider và tạo instance theo model/timeout đã chọn. Run provenance lưu đúng model dùng. Policy không sửa kết quả/phỏng vấn đã có, prompt version hoặc scoring policy; test provider override vẫn dùng transport test. Cấu hình DB hỏng được đánh dấu và fallback về env, admin có thể sửa lại. Credential/provider nằm ở môi trường triển khai; health công khai vẫn mô tả cấu hình env, trang admin mô tả policy hiệu lực.

## Giám sát

`GET /admin/system/status`: SQL connectivity/latency thật, counts user/session/question/template/migration/running review; thống kê ai_runs24h theo feature/status/latency. OAuth/webhook/runner chỉ báo cấu hình có mặt, không giả kết nối thành công; suite seal đếm từ config hợp lệ. Không probe network hoặc chạy AI có phí khi mở trang.

`GET /admin/system/repositories`: danh sách repository theo phiên có pagination/search/status, owner login, instructor, trạng thái webhook và delivery cuối. Không trả ciphertext/token/secret/payload webhook. Live provisioning vẫn cần OAuth của chính giảng viên và URL webhook public; số suite0 là trạng thái chưa seal, không phải bộ test đã chạy.

Kiểm chứng: question-bank SQL HTTP5test gồm RBAC, CRUD, conflict, soft retirement, snapshot bất biến, policy/version/secret rejection và status safe. Gemini transport unit chứng minh model mới qua cùng transport. Browser thật ở1440/820/390 kiểm tra tạo/ngừng câu hỏi, lưu AI policy và status, không mock API. Validation DB dùng bank cũ cho fixture AI; runtime hai DB có185câu và6blueprint.
