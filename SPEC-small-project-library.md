# G2/P01 — mẫu nhỏ có phiên bản và tài liệu chấm riêng

Phạm vi lát cắt: bổ sung nền tảng cho P02–P04, giữ API/blueprint cũ và snapshot phiên đã có. Không seed/reset DB demo. Sáu gói nội dung và chuyển các AI nghiệp vụ được nghiệm thu riêng.

| Năng lực | Hoàn thành khi | Kiểm |
|---|---|---|
| Public package | `learningPackage` v1 có điều kiện đầu vào, hướng dẫn setup/run, starter/sample files; 1–2 Sprint, 3–6 task, tổng 3–7 ngày | Unit: schema/path/case collision/size/dependency/task keys/legacy |
| Assessment riêng | Solution/hidden test/rubric/task→suite mapping ở bảng riêng theo template/version; không nằm trong definition hoặc run snapshot | SQL/HTTP: create/update/get/start/context/history, marker riêng không xuất hiện ở response public |
| Revision | Public/private hash, append-only history; thay public hoặc assessment tạo version mới trong cùng transaction | SQL: concurrency 200/409, immutable history, rollback nếu lỗi |
| Phân quyền | Admin/instructor có permission assessment; intern không được đọc/ghi dù được cấp projects.manage | SQL/HTTP: role + permission hiệu lực, revoke, IDOR và scope run |
| Legacy | Backfill revision hiện tại; giữ nguyên counts/version/definition/run snapshots; seed có lặp không ghi đè chỉnh sửa | Migration SQL riêng và regression thư viện hiện hữu |
| Ghim theo run | Một run dùng đúng phiên bản public/private lúc tạo; sửa/clear private ở version mới không đổi run cũ | SQL/HTTP: current v2 khác pinned v1 |

API mở rộng có tính cộng thêm: POST create nhận `assessment` write-only; PATCH nhận assessment riêng ở top-level (bỏ qua để giữ, null để bỏ ở phiên bản mới). `definition` của PATCH chỉ chứa đề bài public. GET revisions/detail chỉ trả public; GET assessment cần quyền riêng; GET assessment theo project còn yêu cầu quản lý chính project/phiên đó.

Private assessment có schema v1, solutionFiles, hiddenTestFiles, rubric tổng 100 và taskSuites với taskKey/suiteId/digest. Mapping là nội dung authoring, chưa tự trở thành trusted runner binding hoặc bằng chứng đã chạy code. P03 mới triển khai starter/lời giải/biến thể sai và nghiệm thu runner thật.

Threat boundaries: HTTP JSON và file paths không đáng tin; file content chỉ lưu để đọc, server không eval/exec/fetch/extract. Chặn absolute/traversal/Windows special names/duplicate paths và tổng byte quá lớn. Student-safe projections không trả assessment/hash riêng; planner context dùng public snapshot. Phân quyền ở server, không dựa vào UI ẩn tab.

Revision bắt đầu từ baseline migration và các lần ghi mới; không tự dựng lại các phiên bản đã mất. Snapshot run cũ vẫn giữ nguyên và đọc được theo luồng hiện tại. Mọi kiểm thử mutation dùng DB disposable; chỉ kích hoạt migration demo sau khi gate đạt và so counts/digest trước/sau.
