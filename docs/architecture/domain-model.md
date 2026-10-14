# Domain model

Cập nhật theo implementation ngày14/10/2026.

Danh tính/RBAC: users, roles, permissions, user_roles, role_permissions, user_groups/group_members/group_roles. Refresh tokens lưu hash và rotate theo family; permission resolve từ DB theo principal.

Academic: project_templates → template_runs (snapshot/version) → projects + internship_sessions; session_members, session_instructors, project_members và assignments mô tả đội hình/phạm vi. Sprints gắn cả projectId/sessionId; tasks, task_specs, comments/history là đầu việc và bằng chứng.

Recruitment: recruitment_profiles, interview_questions, interview_sessions, interview_session_questions, interview_answers, recruitment_results. interview_conversation_turns lưu câu đã hỏi/run/clarification. Rubric snapshot không rời API sinh viên.

Github: github_connections chứa token mã hóa theo user, github_oauth_states dùng một lần, session_repositories gắn session/owner numeric ID, session_repo_members theo dõi invitation. task_submissions có base/head SHA; submission_code_reviews chứa lease/evidence/result/provenance. session_access_requests là consent đọc theo phiên, expiry/revoke.

Outcomes: evaluations, KPI periods/results, virtual_salary_ledger, certificates/policy và report snapshots. Chỉ số chưa có trả null/empty, không giả0. Mọi UUID và FK quan trọng được kiểm tra; so sánh GUID raw SQL chuẩn hóa case.

Xem [mục lục](../README.md), controller/DTO tương ứng và tests trước khi thay đổi contract.
