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

## Hợp đồng dự kiến R02/R03

Admin quản trị qua `/api/v1/admin/career-roles`; current version phải đi kèm mỗi update, conflict trả 409. Catalog tuyển dụng chỉ công bố role published/đang tuyển, không công bố rubric. Code bất biến; archive giữ lịch sử. Role chưa đủ câu hỏi/rubric phải trả lỗi sẵn sàng, không dùng bộ câu hỏi nghề khác. Mỗi consumer được chuyển và kiểm riêng; CV/Agent sẽ dùng catalog sau các module phụ thuộc, không coi schema là nghiệm thu toàn hành trình.
