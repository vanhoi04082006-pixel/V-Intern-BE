# Chia sẻ dữ liệu giảng viên

POST /session-sharing gửi ownerEmail + reason. Cả hai là instructor active, không self-request. Pending dùng app lock và unique constraint; notification/audit cùng transaction.

Chủ sở hữu quyết định approve/deny; approve chỉ phiên có leadInstructorId đúng người chủ và thời hạn1–30ngày. Revoke thu hồi. Grant không sửa owner, không thêm co-instructor và không mở các manage APIs.

GET /session-sharing/:id/snapshot chỉ requester approved, chưa hết hạn, chưa revoked và lead vẫn là chủ cũ. Short transaction/HOLDLOCK bảo vệ check/read; snapshot session/projects/members/tasks phân trang theo đúng sprint.sessionId. Không trả draft evaluation riêng tư hoặc mở write route.

List/request/decision/snapshot đều kiểm tra principal ở server. UI status không đủ làm authority; revoke/expiry/ownership change được kiểm tra lại mỗi lần đọc. Đổi lead không ngầm chuyển consent sang chủ mới.
