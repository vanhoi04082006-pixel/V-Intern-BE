# Chứng nhận

Cập nhật theo implementation ngày14/10/2026.

Policy V-INTERN-COMPLETE v1 xét tuyển dụng đạt, assignment đã hoàn thành, evaluation và KPI đã finalize đạt ngưỡng cấu hình. Backend trả lý do cụ thể khi chưa đủ điều kiện; AI không cấp chứng nhận.

Issue lưu certificate/code/snapshot; verify dùng code kiểm tra trạng thái phát hành/thu hồi; PDF dùng dữ liệu certificate đã lưu. Sinh viên tải của mình, quyền quản lý kiểm tra ở API.

Migration30 bổ sung completedAt và snapshot tên người/role/dự án/phiên. Chứng nhận mới lấy projectId/sessionId/assignmentId/ngày hoàn thành từ cùng assignment completed gần nhất, không lấy dự án đang hoạt động mới hơn. Điều kiện và snapshot đọc trong transaction cấp. Sửa tên hồ sơ, project hoặc session sau khi cấp không làm đổi verify hoặc byte PDF; thu hồi vẫn giữ record và chặn PDF. Verify issued trả sessionName/completedAt, revoked không công khai các trường này.

Với chứng nhận cũ, migration chỉ chụp tên hiện tại và ngày hoàn thành đã có trên assignment gốc; không khẳng định đây là tên tại thời điểm phát hành, không tự đổi project/session identity hoặc revoke metadata. Không có ngày hoàn thành gốc thì để null, UI nói chưa ghi nhận. Certificate number, verification code và policy không đổi.

SQL E2E gồm cấp cạnh tranh một201/một409, assignment mới không thay context completed cũ, sửa tên không đổi verify/PDF, IDOR, điều kiện chưa đạt và revoke; KPI/salary vẫn kiểm chứng công thức và số tiền chính xác. List KPI dùng score +id làm thứ tự ổn định để không mất/lặp dòng khi phân trang qua các điểm bằng nhau.

Workspace vẫn trả unassigned khi không còn phân công active; `hasAssignmentHistory` phản ánh EXISTS assignment của principal (active/completed/cancelled), false trước khi pass tuyển dụng. FE mở read-only own evaluations/performance/KPI/salary/certificates khi có lịch sử, cả sau khi kết thúc phân công. Task/sprint/project/Mentor và AI recommendations vẫn cần assignment active. Flag chỉ điều khiển giao diện, backend vẫn kiểm tra identity/permission của từng API; không cấp quyền đọc người khác và không tạo task giả.

Revoke ghi audit, verification phải phản ánh revoked. Không diễn giải chứng nhận nền tảng như chứng chỉ pháp lý/nghề nghiệp của tổ chức khác.

Xem [mục lục](../README.md), controller/DTO tương ứng và tests trước khi thay đổi contract.
