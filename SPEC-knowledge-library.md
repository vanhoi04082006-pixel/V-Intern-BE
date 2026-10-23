# M02 — Kho tri thức có phiên bản cho toàn bộ Agent

> Phạm vi đã duyệt trong [kế hoạch](tasks/plan.md). K01 xây nền lưu trữ và quyền; K02 thêm API/duyệt nội dung; K03 thêm UI; K04 mới kết nối retrieval. Không coi lưu được bản nháp là Agent đã sử dụng được tri thức.

## 1. Mục đích

Một hướng dẫn có thể phục vụ Mentor, Planner hoặc Reviewer; câu trả lời mẫu và rubric cần phạm vi hẹp hơn. Kho này giữ nội dung được biên soạn cùng nguồn và phiên bản. Nó không huấn luyện lại trọng số model, không tự nhập CV/bài nộp hoặc trace vào tài liệu đã duyệt, và không thay ngân hàng phỏng vấn hiện tại trong K01.

## 2. Hợp đồng K01

- Mã tài liệu ổn định, 2–80 ký tự thường/số/gạch dưới/gạch ngang; bắt đầu bằng chữ. Mã không đổi qua các revision.
- Loại: `qa`, `guide`, `exercise`, `solution`, `rubric`, `plan_template`, `communication`.
- Metadata: tiêu đề, mô tả ngắn, ngôn ngữ vi/en, độ khó tùy chọn, nghề liên quan (rỗng = dùng chung), tags, mục đích và nguồn.
- Mục đích: `interview`, `interview_evaluation`, `planning`, `code_review`, `mentoring`, `evaluation_assistance`, `recommendation`, `cv_screening`, `communication`. Đây là mục đích tri thức, không phải quyền được gọi tool hoặc danh sách Agent đã triển khai.
- Nội dung draft là object JSON hữu hạn, tối đa 80.000 ký tự sau chuẩn hóa; không chứa giá trị ngoài JSON, khóa gây prototype pollution hay cấu trúc sâu hơn 12 tầng. K02 kiểm schema Q&A/điều kiện publish riêng; lưu draft không chứng minh chất lượng nội dung.
- Nguồn có tên và URL HTTPS hoặc tham chiếu tài liệu. Hệ thống chỉ lưu trích dẫn; không tự tải URL. Không nhận URL chứa user/password. Draft cho phép chưa có nguồn để biên soạn tiếp; publish sẽ yêu cầu nguồn có ý nghĩa.

### Phân loại truy cập

| Audience | Ý nghĩa | Ví dụ |
|---|---|---|
| `student_safe` | Nội dung có thể đưa vào hỗ trợ sinh viên khi đúng scope | Hướng dẫn Git, cách đọc đề |
| `staff_only` | Tài liệu vận hành/quy trình nội bộ | Hướng dẫn lập kế hoạch |
| `grading_only` | Đáp án, lời giải, rubric dùng trong công việc chấm được cấp quyền | Q&A đầy đủ, đáp án mẫu, hidden rubric |

`qa`, `solution`, `rubric` bắt buộc `grading_only`. Mentor không có quyền đọc chúng. Nếu cần giải thích khái niệm cho sinh viên, biên soạn một `guide` riêng đã duyệt. Bản ghi thông tin nhạy cảm của một sinh viên không thuộc kho chung này.

K01 chỉ cho Admin hiệu lực đọc/ghi/lịch sử qua dịch vụ nội bộ; giảng viên và sinh viên bị từ chối trước khi tra tài liệu. Chưa có endpoint public hoặc tool retrieval. K02 thêm permission guard ở HTTP; K04 cấp scope ở server, lọc quyền/trạng thái trước ranking, không tin audience/actor do model hoặc trình duyệt tự khai.

## 3. Dữ liệu và trạng thái

```mermaid
erDiagram
  knowledge_entries ||--|{ knowledge_revisions : "giữ lịch sử"
  users ||--o{ knowledge_revisions : "biên soạn"
  knowledge_entries {
    uuid id PK
    string code UK
    int version
    string status
  }
  knowledge_revisions {
    uuid entryId PK
    int version PK
    string snapshotJson
    string sha256
    uuid createdBy FK
  }
```

Mỗi lần sửa tạo revision mới, gồm schema version, mã, version, status và toàn bộ metadata/nội dung. Current + revision + audit cùng một transaction; hai sửa cùng version chỉ một thành công, một nhận conflict. Audit tổng quát chỉ lưu mã/version/hash, không chép đáp án hoặc rubric.

Revision không có API sửa/xóa; SQL trigger chặn UPDATE/DELETE trực tiếp. SHA-256 xác minh snapshot nhất quán, không thay chữ ký bảo mật hoặc kiểm định chất lượng. Nghề trong draft được kiểm tồn tại ở catalog trong cùng transaction; archive nghề không xóa metadata cũ.

K02 áp dụng chu trình `draft → published → archived`; mọi lần sửa nội dung đưa current về draft và phải publish lại. Bản cũ vẫn giữ để các run đã chụp tham chiếu đọc đúng snapshot, nhưng không được dùng cho lượt retrieval mới chỉ vì từng published. Không xóa vật lý tài liệu đã dùng. Rollback nội dung sẽ tạo revision mới từ bản cũ, không quay lùi số version.

Migration chỉ tạo bảng/constraint/trigger/index, không seed hay sửa dữ liệu cũ. Down chỉ được phép khi kho còn rỗng; nếu có tài liệu thì dừng để bảo toàn. Không áp migration K01 lên DB chính trước khi kiểm thử xong và có kế hoạch kích hoạt.

## 4. Nghiệm thu theo lớp

| Lớp | Cần chứng minh | Trạng thái khi bắt đầu |
|---|---|---|
| K01 policy/unit | JSON/metadata hợp lệ; phân loại tài liệu chấm không bị hạ quyền; hash ổn định | Chưa kiểm |
| K01 SQL | Bảo toàn dữ liệu cũ; lưu/sửa/lịch sử; conflict; rollback transaction; quyền Admin; revision bất biến | Chưa kiểm |
| K02 API | Validation, quyền HTTP, nhiều đáp án đúng/rubric, publish/archive/restore/import dry-run | Chưa triển khai |
| K03 UI | CRUD, preview, trạng thái Agent được dùng, tìm/lọc/history/keyboard | Chưa triển khai |
| K04 retrieval | Chỉ nội dung đã duyệt, scope trước ranking, citation/version, chống lộ rubric và prompt injection | Chưa triển khai |

Các kết quả phải ghi lệnh, commit, giờ kiểm và nguồn log. Không dùng số test M01 để tick K01.
