# Tìm lỗi theo dấu vết, không đoán

Trước khi đổi dữ liệu hoặc cấu hình, ghi lại:

- Vai trò đang đăng nhập và ID người dùng.
- URL FE, endpoint API, HTTP status, `code`, `traceId`.
- Thời điểm (kèm múi giờ) và ID phiên/task/submission liên quan.
- Commit/branch của API và FE.

Không chép password, token, cookie, raw provider response hoặc PII vào báo cáo lỗi.

## 1. Bảng chẩn đoán nhanh

| Triệu chứng | Kiểm tra đầu tiên | Hướng xử lý |
|---|---|---|
| API không khởi động | Log cấu hình đầu tiên, `JWT_SECRET`, SQL credential, cổng | Sửa đúng biến; không bật secret giả |
| Health 503 | SQL service, TCP port, `DB_NAME`, quyền login | Kiểm tra kết nối trực tiếp; không reset DB |
| Query chậm/timeout | API log, SQL session/wait, pool, kết nối trực tiếp | Tách lỗi dữ liệu khỏi tải máy; không tăng timeout mù |
| 401 liên tiếp | Access token, refresh cookie, origin, rotation | Refresh một lần; thất bại thì đăng nhập lại |
| 403 trên một bản ghi | Permission, scope, owner, consent | Chọn đúng phiên hoặc xin quyền; không nới role |
| 409 khi chuyển task | Version, trạng thái, phụ thuộc | Tải lại, đọc `details`; không sửa DB thủ công |
| 429 | Rate limit | Dừng gọi, chờ đúng hạn; không spam |
| AI lỗi/không trả kết quả | Provider, timeout, schema output, trạng thái job | Giữ bài, retry theo policy; không gán điểm giả |
| Repo/PR không đọc được | Danh tính liên kết, scope, URL/SHA | Liên kết lại đúng luồng; không dùng token quyền rộng |
| Runner không chấm | Suite đúng task, worker, token/HMAC | Chỉ trình bày AI source review đúng phạm vi |
| Số liệu khác nhau | Scope, trang, khoảng ngày, finalized, snapshot | So cùng phạm vi; không trộn hai mốc |
| FE khác BE | API base URL, DB theo launcher, build version | Kiểm đúng process; không reset cả hệ thống |

## 2. Đọc mã lỗi

| HTTP | Nghĩa thường gặp | Cách xử lý đầu tiên |
|---|---|---|
| `400` | Input/DTO không hợp lệ | Đối chiếu tên field, kiểu, ngày, UUID |
| `401` | Không có hoặc hết phiên | Đăng nhập lại; kiểm origin/refresh flow |
| `403` | Thiếu quyền hoặc ngoài phạm vi | Kiểm principal và ownership tại server |
| `404` | Không có dữ liệu, không thuộc quyền hoặc chưa có bản kết quả | Đọc `code` và ngữ cảnh endpoint |
| `409` | Trạng thái/version/phụ thuộc xung đột | Tải lại, đọc điều kiện đang chặn |
| `429` | Quá nhiều lời gọi | Dừng lặp request, chờ đúng hạn |
| `503` | SQL hoặc tích hợp chưa khả dụng | Kiểm dependency; giữ dữ liệu đã nộp |

Không coi mọi `404` là lỗi route. Ví dụ chưa từng tạo khuyến nghị AI có thể chưa có record; UI phải hướng dẫn tạo lần đầu. Ngược lại, không che `500` thành màn hình trống “chưa có dữ liệu”.

## 3. Đăng nhập và phiên

Thứ tự kiểm:

1. Đúng API host/port chưa? 8080 và 8081 là hai môi trường.
2. `CORS_ORIGINS` có đúng origin FE (scheme + port)?
3. Refresh cookie có được trình duyệt gửi không? `SameSite`/`Secure`/domain?
4. Refresh có bị rotate/replay detection chặn không?
5. Tài khoản có bị khóa hoặc mất role không?

Không sửa `JWT_SECRET` để “thử lại”: đổi secret làm invalid toàn bộ phiên hiện có và có thể che lỗi thật.

## 4. Sinh viên không thấy Sprint/task

Kiểm tra theo chuỗi, dùng **ID** chứ không chỉ tên hiển thị:

1. Sinh viên đã **passed** tuyển dụng chưa?
2. Có **assignment active** đúng phiên chưa?
3. Kế hoạch đã được giảng viên **confirm/publish** chưa?
4. Sprint đã **active** chưa? Một project chỉ có tối đa một Sprint active.
5. Task có đúng assignee và chưa bị chặn bởi phụ thuộc?

Kế hoạch draft hoặc Sprint `planned` ở giảng viên **không** chứng minh sinh viên có việc đang chạy.

## 5. Kéo Kanban không được

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Không sang cột kế tiếp | Nhảy bước | Đi theo `todo → doing → review → done` |
| Báo phụ thuộc | Predecessor chưa Done | Đọc `details.blockedBy`, xử lý task chặn |
| Sang Review nhưng chưa nộp | Mở dialog chưa phải đã nộp | Hoàn tất hộp nộp bài |
| Không sang Done | Thiếu quyền/duyệt của giảng viên | Không tự duyệt; chờ đúng quy trình |
| 409 version | Dữ liệu đã đổi từ lần đọc trước | Tải lại, so sánh, cập nhật lại |

## 6. AI chấm không xong

Phân biệt ba trường hợp:

1. **Timeout/provider unavailable** — không phải kết quả rớt.
2. **JSON/schema không hợp lệ** — validator từ chối; có thể repair có audit theo policy.
3. **Job còn chạy** — chưa phải kết thúc chấm.

Xem `ai_runs` theo resource ID và mã lỗi an toàn. Phỏng vấn phải giữ bài đã nộp ở trạng thái có thể retry; lỗi AI **không trừ thêm lượt** và không tự ghi `failed`.

Mức điểm 50–70 cần role khác, lý do và reference tới câu đã trả lời. Thiếu bằng chứng thì **không** được tạo đề xuất mặc định.

## 7. Repository chưa sẵn sàng

Kiểm tra:

1. Admin đã chọn tài khoản tạo repo chung chưa?
2. User sở hữu credential còn active không?
3. Kết nối GitHub còn `connected` và đủ scope không?
4. Repository cũ có owner/URL đã lưu không?
5. Thành viên đã liên kết đúng danh tính và chấp nhận invitation chưa?

Không suy ra GitHub username từ email ứng dụng. Nếu callback lỗi, so **tuyệt đối** callback URL với OAuth App, kiểm state còn hạn và cổng/origin.

Nếu token hết hạn, service thử refresh theo version/lease; bị từ chối thì liên kết lại bằng chính luồng OAuth, **không dán token vào DB**.

## 8. Nộp được nhưng không duyệt được

Kiểm tra:

- Repository/session/author có đúng không?
- Base/head SHA có khớp submission không?
- PR có commit mới sau khi nộp không? (`409 SUBMISSION_SHA_CHANGED`)
- Review đang `running`, `inconclusive` hay `failed`?
- Có suite đúng task/spec không?

`inconclusive` nghĩa là **bằng chứng chưa đủ**, không phải bài đạt. Thiếu suite cần cấu hình hoặc chấm thủ công theo policy; không lấy test của sinh viên làm bộ test tin cậy.

## 9. Chỉ số, KPI, báo cáo khác nhau

So các yếu tố sau trước khi kết luận sai:

| Yếu tố | Câu hỏi |
|---|---|
| Scope | Cùng project/session/người dùng chưa? |
| Trang | Đang xem trang 1 hay toàn bộ? |
| Khoảng ngày | Cùng múi giờ và mốc chưa? |
| Trạng thái | Evaluation/KPI đã `finalized` chưa? |
| Snapshot | Report được tạo lúc nào? |
| Nguồn | Số liệu live hay số liệu đã lưu? |

- KPI thiếu thành phần được chuẩn hóa trọng số, **không** tự đổi thành 0.
- Báo cáo cũ không tự tính lại.
- CSV “trang hiện tại” không phải toàn bộ sinh viên của hệ thống.
- Lương ảo chỉ là mô phỏng học tập, không phải tiền thanh toán.

## 10. Database và migration

Chỉ sửa DB sau khi đã có **nguyên nhân** và **phương án** cụ thể. Dùng migration hoặc thao tác nghiệp vụ có audit khi phù hợp.

| Không làm | Làm thay thế |
|---|---|
| Reset DB để “thử lại” | Tạo DB E2E riêng |
| Sửa migration đã chạy | Thêm migration mới |
| Ép trạng thái bằng SQL | Dùng service/API đúng luồng |
| Chạy `seed:dev` trên DB bàn giao | Giữ nguyên dữ liệu và ba tài khoản trắng |

Xem [MIGRATION_POLICY](database/MIGRATION_POLICY.md) và [SQL Server setup](database/SQLSERVER2019_SETUP.md).

## 11. Sự cố đã biết

- **SQL timeout từng gặp trong kiểm chứng local**: restart API phục hồi nhưng **chưa xác định nguyên nhân gốc**. Đây là giới hạn cần giữ trong bàn giao, không mô tả thành lỗi đã sửa dứt điểm.
- **Rate limiter theo process**: chạy nhiều instance có thể vượt giới hạn dự kiến.
- **Runner/WSL**: không có process giữ phiên, WSL có thể dừng dù service báo active.
- **Webhook live**: chưa nghiệm thu delivery live cho repo QA; hợp đồng webhook kiểm bằng E2E.

## 12. Khi nào cần leo thang

Leo thang khi:

- `401/403` lặp lại sau khi đã kiểm token/scope.
- `409/500` lặp lại với cùng payload.
- Dữ liệu khác giữa hai vai trò nhưng không giải thích được bằng lifecycle/scope.
- Nghi ngờ lộ secret/PII.
- Gate CI đỏ nhưng local xanh.

Gửi kèm: endpoint, vai trò, thời điểm, commit, request/response đã lọc PII, `traceId`, bước tái hiện. **Không gửi token, cookie, mật khẩu hoặc dữ liệu cá nhân.**
