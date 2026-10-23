# M01 — Thư viện nghề nghiệp động

## Mục đích và phạm vi từng lát cắt

`frontend` là nghề nghiệp; `intern` là quyền tài khoản. Thêm nghề mới không tạo thêm quyền. M01 gồm R01 (schema/migration), R02 (API và chính sách), R03 (Admin và chuyển từng consumer). Chỉ R01 chưa làm role thứ sáu sử dụng được xuyên hệ thống.

## R01: lưu dữ liệu an toàn

- `career_roles`: mã bất biến tối đa 32 ký tự (tương thích cột hiện tại), tên, mô tả, cấp độ, ngôn ngữ, kỹ năng bắt buộc/tùy chọn, trọng số năng lực, trạng thái `draft/published/archived`, cờ nhận hồ sơ, version và thời điểm cập nhật.
- `career_role_revisions`: snapshot JSON từng version; khóa `(roleCode, version)`. API R02 phải ghi current + revision trong cùng transaction, khóa cạnh tranh và audit người sửa. Không ghi đè revision cũ.
- Migration tự tạo 5 mã gốc với nhãn hiện tại, published/đang tuyển để không khóa luồng cũ. Kỹ năng/trọng số ban đầu rỗng: không tự bịa bộ năng lực đã duyệt.
- Mã khác đã tồn tại trong profile/câu hỏi/buổi phỏng vấn được nhập ở trạng thái archived, không nhận hồ sơ; giữ nguyên cả mã và dữ liệu lịch sử. Không bỏ dữ liệu để thêm FK.
- FK không cascade từ catalog sang profile/câu hỏi/buổi phỏng vấn. Archive không xóa hay thay đổi kết quả, số lượt và snapshot câu hỏi.
- `acceptingApplications=1` chỉ hợp lệ khi published. JSON phải hợp lệ và version dương. Validation hình dạng/nội dung chi tiết nằm ở R02.
- Không mở API xóa cứng role; các revision không được sửa/xóa bởi API. Rollback migration chỉ cho phép khi dữ liệu catalog vẫn nguyên baseline 5 role, không có role nhập thêm hay revision mới; nếu đã chỉnh sửa phải dừng với thông báo bảo toàn dữ liệu.

## Tiêu chí kiểm chứng R01

Database SQL Server dùng riêng; áp dụng toàn bộ migration cũ, chèn lịch sử role chưa biết rồi chạy migration mới. Kiểm đủ 5 mã gốc, backfill role lạ, history/attempt/snapshot không đổi, không tạo RBAC, FK chặn role không tồn tại và xóa role có tham chiếu, constraint trạng thái/JSON, version snapshot. Chạy down an toàn, chặn down khi có dữ liệu mới, rồi up lại. Không reset DB chính. Chỉ tick R01 sau khi SQL E2E thật đạt.

## Hợp đồng R02 và bước tiếp theo R03

Admin quản trị qua `/api/v1/admin/career-roles`; current version phải đi kèm mỗi update, conflict trả 409. Catalog tuyển dụng chỉ công bố role published/đang tuyển, không công bố rubric. Code bất biến; archive giữ lịch sử. Role chưa đủ câu hỏi/rubric phải trả lỗi sẵn sàng, không dùng bộ câu hỏi nghề khác. Mỗi consumer được chuyển và kiểm riêng; CV/Agent sẽ dùng catalog sau các module phụ thuộc, không coi schema là nghiệm thu toàn hành trình.

| Endpoint | Quyền | Hành vi |
|---|---|---|
| `GET /api/v1/career-roles` | Đăng nhập | `{items}` các role published/đang tuyển; chỉ code, label, mô tả, cấp độ, ngôn ngữ, kỹ năng và version; không có trọng số/actor |
| `GET /api/v1/admin/career-roles` | `recruitment.manage` + effective admin | Tìm theo mã/tên, status, page/pageSize; trả `{items,total,page,pageSize}` |
| `POST /api/v1/admin/career-roles` | Như trên | Luôn tạo draft/version 1/đóng nhận hồ sơ; trùng mã trả 409 |
| `GET /api/v1/admin/career-roles/:code` | Như trên | Current metadata, không tự sửa mã |
| `PUT /api/v1/admin/career-roles/:code` | Như trên | Toàn bộ nội dung + version/status/acceptingApplications; 409 nếu version cũ |
| `POST /api/v1/admin/career-roles/:code/archive` | Như trên | Body `{version}`, đóng tuyển và tăng version; không xóa. Trả 201 theo POST action hiện tại |
| `GET /api/v1/admin/career-roles/:code/revisions` | Như trên | Snapshot, actor, thời điểm; phân trang, version giảm dần |

### Nội dung để tạo nghề mới

```json
{
  "code": "data_analyst",
  "name": "Data Analyst",
  "description": "Phân tích bộ dữ liệu nhỏ và giải thích kết quả bằng bằng chứng.",
  "level": "intern",
  "language": "vi",
  "requiredSkills": ["SQL", "Statistics"],
  "optionalSkills": ["Python"],
  "competencyWeights": {"SQL": 60, "Statistics": 40}
}
```

Mã gồm 2–32 ký tự thường/số/gạch dưới và bắt đầu bằng chữ. Kỹ năng tối đa 30 mỗi nhóm; không trùng trong hoặc giữa hai nhóm sau trim/so sánh không phân biệt hoa thường. Trọng số nếu có phải bao phủ đúng kỹ năng bắt buộc, là số nguyên 1–100 và tổng 100. Draft cho phép danh sách/trọng số rỗng. Publish bắt buộc mô tả ít nhất 20 ký tự, kỹ năng bắt buộc và trọng số đầy đủ. `acceptingApplications=true` chỉ khi published. Có thể mở lại role archived qua PUT với version mới và nội dung hợp lệ.

Current, snapshot revision và audit cùng một transaction. Khóa UPDLOCK/HOLDLOCK bảo vệ cả tạo trùng và sửa cạnh tranh; bản sửa thua nhận 409. Snapshot cũ không thay đổi khi sửa current. Audit chỉ ghi version/trạng thái/cờ nhận hồ sơ; nội dung đầy đủ nằm trong thư viện riêng. R03 mới thay danh sách tuyển dụng cố định và màn hình; việc role có trong catalog R02 chưa chứng minh sẵn sàng phỏng vấn.

## R03: các consumer hiện hành

- Onboarding và ngân hàng câu hỏi đọc catalog; thêm nghề mới không sửa enum FE/BE. Icon cũ chỉ là gợi ý hình thức, không quyết định nghề được chọn.
- `GET /api/v1/career-roles/reference` yêu cầu `recruitment.view`; chỉ trả code/label cho bộ lọc giảng viên. Có nghề published, archived và nghề hiện là draft nhưng đã có hồ sơ tham chiếu. Draft mới chưa dùng không lộ qua danh sách này. Sinh viên không có quyền endpoint tham chiếu; danh sách ứng tuyển của sinh viên vẫn chỉ published/đang tuyển.
- Template/task nhận mã động, kiểm tồn tại trong catalog và task thuộc tập role của template. Giới hạn 6 là số nghề tối đa trong **một mẫu dự án**, không phải giới hạn toàn catalog. Template update/start giữ version và snapshot cũ; slot phân công sao chép đúng mã nghề.
- Migration `AdoptTemplateCareerRoles1762723200000` giữ cả `devops` từng được template hỗ trợ và các mã đang có trong slot/JSON blueprint. Các mục nhập thêm archived/đóng tuyển; không ghi đè chỉnh sửa Admin, không sửa JSON gốc. Ghi chú chuỗi cũ trong roleDetails/sprints/tasks được bỏ qua khi trích mã, giữ nguyên dữ liệu.
- Mã lịch sử dài hơn 32 ký tự làm migration dừng để lập mapping rõ ràng; không cắt mã. `down` của migration nhập dữ liệu giữ nguyên metadata đã nhận, không xóa lịch sử; `up` lại không nhân đôi. Vì catalog đã có dữ liệu ngoài 5 baseline, rollback R01 tiếp theo sẽ dừng theo guard bảo toàn dữ liệu, cần kế hoạch xuất/giữ metadata khi gỡ cả module.
- Chứng nhận mới chụp tên nghề từ catalog khi cấp. Sửa tên nghề sau đó không đổi bản xác minh/PDF đã cấp; chứng nhận cũ không được diễn giải lại. Score/attempt/recruitedAt và quyền tài khoản giữ nguyên.
- Prompt đánh giá v5 lấy catalog đang tuyển, gắn version/kỹ năng vào input run. Đề xuất không có trong snapshot catalog bị từ chối. Khi không có lựa chọn thay thế, giữ điểm và trả hướng dẫn rõ ràng, không bịa một nghề.

R03 kiểm trên SQL Server thật và browser ba vai trò: tạo nghề → soạn 10 câu → sinh viên nộp/chấm → template chứa nghề mới → giảng viên lọc/phân công đúng slot. CV/Agent runtime/lịch/mail thuộc các module sau, không suy diễn đã được nghiệm thu từ luồng chọn nghề thủ công hiện tại.
