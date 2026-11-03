# Đọc và gọi API V-Intern

API là hợp đồng giữa Frontend và Backend. Tài liệu này hướng dẫn cách gọi đúng; danh mục endpoint nằm ở [ROUTES](ROUTES.md), field DTO ở [SCHEMAS](SCHEMAS.md), còn **nguồn sự thật cuối cùng** là controller/DTO/service của bản đang chạy.

## 1. Địa chỉ và phiên bản

| Môi trường | Base URL | Swagger |
|---|---|---|
| Local chính | `http://localhost:8080/api/v1` | `http://localhost:8080/api/docs` |
| Local QA | `http://localhost:8081/api/v1` | `http://localhost:8081/api/docs` |
| CI | Do workflow cấu hình | `/api/docs-json` để kiểm OpenAPI |

- Global prefix `api`, version mặc định `1` → route nghiệp vụ bắt đầu `/api/v1`.
- Base URL phải chứa đầy đủ `/api/v1`; client không tự ghép thêm version.
- Cổng 8080 và 8081 có thể dùng **database khác nhau**. Không trộn token, ID và số liệu giữa hai môi trường.
- OpenAPI JSON: `GET /api/docs-json` — dùng để đối chiếu route/schema tự động.

## 2. Một request thành công cần gì?

| Thành phần | Ví dụ | Lưu ý |
|---|---|---|
| Method | `GET` đọc, `POST` tạo/xử lý, `PATCH`/`PUT` sửa, `DELETE` theo contract | Không đoán tác dụng chỉ từ tên nút |
| Path | `/tasks/{id}` | Thay UUID thật và đúng scope |
| Query | `page=1&pageSize=10` | DTO giới hạn giá trị được phép |
| Body | JSON theo schema | Field lạ bị từ chối |
| Auth | `Authorization: Bearer <accessToken>` | Token có danh tính, **không** tự có quyền mọi resource |
| Cookie | Refresh cookie HttpOnly | Trình duyệt tự gửi khi `credentials: include` |

Các endpoint public như health, login, register, verify chứng nhận và webhook có hợp đồng riêng. Webhook public nhưng **xác minh chữ ký**, không tin mọi payload.

## 3. Đăng nhập và thử một API đọc

Dùng tài khoản local có sẵn; không chép mật khẩu thật vào tài liệu, script hay commit.

1. Mở Swagger của đúng process.
2. Gọi endpoint login bằng thông tin của bạn.
3. Sao chép `accessToken` vào nút **Authorize**.
4. Gọi một endpoint đọc trong scope của tài khoản.

Ví dụ PowerShell sau khi đã có token trong biến tại máy:

```powershell
$headers = @{ Authorization = "Bearer $accessToken" }
Invoke-RestMethod -Uri 'http://localhost:8080/api/v1/recruitment/me' -Headers $headers
```

Không lưu `$accessToken` vào script được commit và không `Write-Output` token để chụp bằng chứng.

### Refresh và đăng xuất

- Access token ngắn hạn; refresh cookie HttpOnly do BE phát hành.
- Refresh có rotation và phát hiện replay.
- Client không đọc refresh token bằng JavaScript và không gửi nó trong body API nghiệp vụ.
- Logout phải thu hồi phía server, không chỉ xóa state trên UI.

## 4. Response và pagination

Nhiều endpoint collection dùng một trong các shape:

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 10 }
```

```json
{ "data": [], "meta": { "page": 1, "pageSize": 10, "total": 0 } }
```

**Đọc schema của endpoint cụ thể trước khi unwrap.** Không viết một client cứ thấy `data` là bỏ một lớp cho mọi API.

- Sort/filter chạy ở server **trước** pagination cho các read model quan trọng.
- Muốn tìm người ngoài trang đầu, gửi query đến server thay vì lọc mười dòng đã tải.
- `null`, mảng rỗng và “chưa đo được” là ba nghĩa khác nhau; giữ nguyên khi trả về UI.

## 5. Lỗi là một phần của contract

```json
{
  "statusCode": 409,
  "code": "TASK_DEPENDENCIES_PENDING",
  "message": "Thông điệp mô tả điều kiện chưa đạt",
  "traceId": "tham-chieu-de-tra-log",
  "details": { "blockedBy": [] }
}
```

Đây là cấu trúc minh họa, không phải response lấy từ DB.

| HTTP | Nghĩa thường gặp | Client nên làm |
|---|---|---|
| `400` | DTO/validation sai | Sửa field theo thông báo; không retry nguyên payload |
| `401` | Thiếu/hết phiên | Refresh một lần; thất bại thì về login |
| `403` | Thiếu quyền hoặc ngoài scope | Giữ ngữ cảnh; không tự nâng quyền |
| `404` | Không có trong scope | Không kết luận dữ liệu toàn hệ thống không tồn tại |
| `409` | Trạng thái/version/phụ thuộc xung đột | Tải lại, đọc `code`/`details`, xử lý xung đột |
| `429` | Vượt rate limit | Dừng gọi, chờ đúng hạn |
| `503` | SQL/provider chưa khả dụng | Retry có kiểm soát; giữ dữ liệu đã nhập |

Không dùng HTTP `200` cho thao tác chưa hoàn tất. Không trả stack trace, SQL, token hoặc PII.

## 6. Version, idempotency và trạng thái

### `requestId`

Gắn một **ý định** ổn định: bấm lại sau mất mạng không tạo thêm bản ghi. Khi người dùng đổi phạm vi hoặc yêu cầu khác, tạo `requestId` mới theo luồng.

### `expectedVersion`

Chặn ghi đè bản đã đổi. Nhận `409` thì tải lại, so sánh và để người dùng quyết định; không ghi đè mù.

### Job/action nhiều bước

Một action có thể tạo draft hoặc job đang chạy. Response “đang xử lý” **chưa phải** task/điểm cuối. Client theo `status` và đọc lại đúng resource; không tự giả thành công theo timer.

## 7. Bản đồ endpoint theo hành trình

| Hành trình | Nhóm endpoint tiêu biểu |
|---|---|
| Tài khoản | `auth`, `users`, `rbac`, `groups` |
| Tuyển dụng | `recruitment/me`, role, interviews, conversation, answers, submit/retry, result |
| CV và lịch | `applications`, `career-roles`, `RecruitmentRounds` |
| Lập phiên | `templates`, `projects`, `sessions`, `assignments`, `ai-generations` |
| Làm bài | `intern` own workspace, task spec, `submissions` |
| Chấm | `code-review`, submission review, `evaluation` |
| Theo dõi | `performance`, `reports`, `notifications` |
| Kết quả | `kpi`, `salary`, `certificates` |
| Tích hợp | `github`, webhook, runner |
| Vận hành | `health`, `admin`, `audit`, `settings` |

Danh mục đầy đủ **302 operation trong 48 nhóm**: [ROUTES](ROUTES.md). Số này là method/path, **không phải** số luồng đã nghiệm thu.

## 8. Quyền: hai lớp, không thay thế nhau

1. **Permission** — ví dụ `tasks.view`, `settings.update`.
2. **Ownership/scope** — bản ghi cụ thể có thuộc project/session/người dùng không.

Có `tasks.view` **không** có nghĩa đọc được mọi task. API `own` lấy principal từ token; client không gửi `internId` để đọc bài người khác.

Chi tiết: [SECURITY](../SECURITY.md).

## 9. Kho tri thức (K02)

[hướng dẫn riêng](../KNOWLEDGE-LIBRARY.md) giải thích draft, nhiều đáp án đúng/rubric, publish, archive, restore và import. Mỗi thao tác Admin kiểm vai trò hiệu lực cùng permission tương ứng. Chưa có endpoint public trả đáp án cho sinh viên.

## 10. Checklist khi thêm/đổi endpoint

- [ ] DTO khai báo kiểu, nullable, enum và giới hạn.
- [ ] Có authentication + permission + kiểm tra ownership.
- [ ] Kiểm tra trạng thái và transaction cho thao tác nhiều bước.
- [ ] Response không lộ secret/PII; lỗi có `code` ổn định.
- [ ] Cập nhật Swagger, [ROUTES](ROUTES.md)/[SCHEMAS](SCHEMAS.md) nếu contract đổi.
- [ ] Thêm test unit + E2E cho nhánh đúng và nhánh bị từ chối.
- [ ] Cập nhật adapter/parser FE trong cùng PR.
