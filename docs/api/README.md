# Đọc và gọi API V-Intern

## Địa chỉ và phiên bản

API local chính thường là `http://localhost:8080/api/v1`. Swagger của process đang chạy ở `/api/docs`. Địa chỉ `8081` là một môi trường khác nếu được cấu hình; không trộn token, ID và số liệu giữa hai DB.

Đọc [ROUTES](ROUTES.md) để tìm endpoint và [SCHEMAS](SCHEMAS.md) để tra field DTO. Hai phụ lục được lấy từ OpenAPI của bản local và không chứa dữ liệu tài khoản thật. Phần dưới giải thích cách sử dụng chúng.

Kho tri thức K02 có [hướng dẫn riêng](../KNOWLEDGE-LIBRARY.md): cách soạn draft, nhiều đáp án đúng/rubric, publish, archive, restore và kiểm lô import. Mỗi thao tác Admin kiểm vai trò hiệu lực cùng permission tương ứng; chưa có endpoint public trả đáp án cho sinh viên.

## Một request thành công cần gì?

| Thành phần | Ví dụ | Lưu ý |
|---|---|---|
| Method | GET đọc, POST tạo/xử lý, PATCH/PUT sửa, DELETE theo contract | Không đoán tác dụng chỉ từ tên nút |
| Path | `/tasks/{id}` | Thay ID thật và đúng scope |
| Query | `page=1&pageSize=10` | DTO giới hạn các giá trị được phép |
| Body | JSON theo schema | Unknown fields bị từ chối |
| Auth | `Authorization: Bearer <accessToken>` | Token có danh tính nhưng không tự có quyền mọi resource |

Các endpoint public như health/login/register/verify/webhook có hợp đồng riêng. Webhook có xác minh chữ ký, không phải vì public mà tin mọi payload.

## Đăng nhập và thử một API đọc

Dùng tài khoản local có sẵn, không chép mật khẩu thật vào tài liệu hoặc commit. Trong Swagger, gọi login bằng thông tin của bạn, nhận access token rồi dùng Authorize. Refresh cookie được xử lý qua HTTP theo cấu hình; không dán refresh token vào body API nghiệp vụ.

Ví dụ PowerShell cho một request đọc sau khi đã có access token trong biến tại máy:

```powershell
$headers = @{ Authorization = "Bearer $accessToken" }
Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/recruitment/me' -Headers $headers
```

Không lưu `$accessToken` vào script được commit và không `Write-Output` nó để chụp bằng chứng.

## Pagination và response

Nhiều endpoint collection có data/meta hoặc shape pagination riêng đã được adapter xử lý. Xem schema/response của endpoint cụ thể trước khi unwrap. Không viết một client cứ thấy field `data` là bỏ một lớp cho mọi API.

Sort/filter được server áp trước pagination cho các read model quan trọng. Để tìm một sinh viên ngoài trang đầu, gửi query đến server thay vì chỉ lọc mười dòng đã tải. Dữ liệu thiếu có thể là null/list trống; giữ nguyên nghĩa đó trong giao diện.

## Lỗi là một phần của contract

```json
{
  "statusCode": 409,
  "code": "TASK_DEPENDENCIES_PENDING",
  "message": "Thông điệp mô tả điều kiện chưa đạt",
  "traceId": "tham-chieu-de-tra-log",
  "details": { "blockedBy": [] }
}
```

Đây là cấu trúc minh họa, không phải một response lấy từ DB. Client dùng code/details để giải thích tình huống và vẫn hiển thị thông điệp hữu ích. Không gom mọi lỗi về “thao tác thất bại”, cũng không dùng HTTP 200 cho một thao tác thực sự chưa hoàn tất.

## Version, idempotency và trạng thái

`requestId` gắn một ý định ổn định: bấm lại sau mất mạng không tạo thêm bản ghi. Khi người dùng thay phạm vi/đề nghị khác, tạo requestId mới theo luồng. `expectedVersion` chặn ghi đè một bản đã đổi; nhận conflict thì tải lại và so sánh.

Một action nhiều bước có thể tạo draft hoặc job đang chạy. Response đang xử lý chưa phải task/điểm cuối. UI phải theo status và đọc lại kết quả đúng resource, không tự giả thành công theo timer.

## Những endpoint đáng đọc theo hành trình

| Hành trình | Nhóm endpoint |
|---|---|
| Tuyển dụng | recruitment/me, role, interviews, conversation, answers, submit/retry, result |
| Lập phiên | templates, sessions, assignments, ai-generations |
| Làm bài | intern own workspace/tasks, task spec, submissions |
| Chấm | code-review, submission review, evaluation |
| Theo dõi | performance, reports, notifications |
| Kết quả | KPI, virtual salary, certificates |
| Cộng tác/tích hợp | GitHub OAuth/repositories/webhook và session-sharing |

Nguồn authority là controller/DTO/service của code được chạy. Nếu OpenAPI chưa mô tả đủ một response, đọc service/tests và sửa tài liệu cùng contract; không suy diễn thêm trường tùy tiện.
