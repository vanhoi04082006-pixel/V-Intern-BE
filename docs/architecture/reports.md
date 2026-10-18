# Báo cáo học tập và tiến độ

Giảng viên chọn project/session, tùy chọn sprint, student và khoảng ngày. `POST /reports` cần requestId ổn định, title và kind (progress/performance/evaluation/review/risk). Backend xác thực assignment thuộc quyền quản lý; sprint phải thuộc project/session đã chọn. Không có thành viên hợp lệ thì từ chối. RequestId lặp trả bản chụp cũ; đổi bộ lọc trên UI tạo key mới.

Bản chụp schemaVersion2 có metrics từng thành viên, task/sprint progress, overdue, blocked do predecessor chưa Done, workload/người phụ trách, latest submission, điểm AI và giảng viên, cùng tối đa 100 chuyển trạng thái mới nhất. Task tối đa500; scope lớn hơn trả `REPORT_SCOPE_TOO_LARGE` để người dùng lọc lại. Dữ liệu review chưa có giữ null, không tạo điểm 0. Điểm evaluation đã chốt thuộc ngữ cảnh project/session; điểm review task là hai cột AI/instructor riêng.

Ngày trên UI gồm cả ngày kết thúc, adapter đổi thành UTC `[from,to)` với to là đầu ngày kế tiếp. Task progress chọn theo task.createdAt; submission counters chọn theo submittedAt. Hai định nghĩa được giữ riêng, không giả rằng mỗi task tương ứng một lần nộp. Sprint summary chỉ tính task thuộc bộ lọc (khi chọn một sinh viên thì đây là phần việc của sinh viên đó).

Cảnh báo tiến độ là quy tắc minh bạch: high nếu có task trễ hoặc sprint hết hạn còn task; medium nếu chờ phụ thuộc/chưa phân công; low nếu chưa có dấu hiệu đó. Hiển thị các lý do. Đây không phải dự báo ngày hoàn thành hoặc nhận xét AI. Bản chụp đã lưu không bị tính lại khi task thay đổi; quyền đọc hiện tại được kiểm tra lại trước khi trả hoặc xuất file. Report của người khác không truy cập được. Nếu mất quyền task/session trong bản chụp thì từ chối đọc thay vì dựa vào việc vẫn nhìn thấy cùng sinh viên trong một phiên khác.

Quy tắc "report của mình" áp dụng cho giảng viên. Effective admin được quản trị/list/read/export mọi snapshot, kể cả khi assignment cũ đã dừng; quyền này kiểm tra từ DB và không cấp cho instructor chỉ do sửa URL sang route admin.

PDF gồm thành viên, summary, sprint, task/review và timeline. XLSX có các sheet Thông tin, Hiệu suất, Task và review, Sprint, Lịch sử. CSV trình duyệt cũng có task/timeline và escape formula input. UI phân trang task trong bản chụp 15 dòng; tải file chứa toàn bộ phạm vi đã lưu. Bản cũ schemaVersion1 vẫn đọc và xuất metrics như trước.

Kiểm chứng real SQL trong start-session E2E: publish→performance→report→idempotent replay→filter riêng sinh viên/sprint→chặn sprint lạ→đổi deadline và xác nhận cảnh báo có căn cứ, snapshot cũ bất biến→PDF/XLSX. Provider kế hoạch được script riêng trong automated test; browser QA dùng API/SQL thật và kế hoạch từ lần gọi provider thật đã lưu, không mock response báo cáo.
