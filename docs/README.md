# Tài liệu Backend hiện hành

Đọc README của repository trước. Các hướng dẫn dưới đây phản ánh schema và luồng hiện tại; tài liệu phase/handoff cũ nằm trong archive.

- [SQL Server](database/SQLSERVER2019_SETUP.md), [migration policy](database/MIGRATION_POLICY.md).
- [Domain model](architecture/domain-model.md), [academic/session](architecture/academic-core.md), [sprint/task](architecture/sprint-task-core.md).
- [Blueprint dự án](architecture/project-blueprints.md), [kế hoạch và Mentor](architecture/learning-plans.md).
- [Recruitment chat](architecture/recruitment-chat.md), [AI mentor](architecture/ai-mentor.md), [AI evaluation assistance](architecture/ai-evaluation-assistance.md), [AI recommendations](architecture/ai-recommendations.md).
- [GitHub/code review](architecture/github-code-review.md), [runner contract](architecture/grading-runner.md), [session sharing](architecture/session-sharing.md).
- [Evaluation/performance/KPI](architecture/evaluation-performance-kpi.md), [virtual salary](architecture/virtual-salary.md), [certificates](architecture/certificates.md).
- [Hiệu suất và chi tiết sinh viên](architecture/student-performance.md), [báo cáo và xuất file](architecture/reports.md).
- [API routes](api/ROUTES.md), [security](SECURITY.md), [testing](TESTING.md), [ADRs](decisions/0001-ai-github-authority.md).
- [Quản trị câu hỏi, AI và giám sát](architecture/admin.md).
- [Thông báo và cảnh báo tự động](architecture/notifications.md).

Source DTO/controller/service là authority nếu tài liệu và code khác nhau; sửa tài liệu cùng thay đổi hành vi, không tự sửa lịch sử migration đã áp dụng.
