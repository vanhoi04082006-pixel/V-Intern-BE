// Same query is used to select bounded work AND revalidate it just before delivery.
export const LEARNING_ALERTS_CTE = `WITH events AS (
  SELECT CONCAT('task.overdue:',t.id,':',CONVERT(nvarchar(33),t.dueDate,126)) eventKey,recipient.userId,'task' category,'task.overdue' eventType,
    N'Task quá hạn cần xử lý' title,CONCAT(t.code,N' · ',t.title,N' đã quá hạn và chưa được duyệt Done.') body,
    CONCAT('/tasks/',t.id) route
  FROM tasks t JOIN projects p ON p.id=t.projectId LEFT JOIN sprints sp ON sp.id=t.sprintId AND sp.projectId=t.projectId
  LEFT JOIN internship_sessions s ON s.id=sp.sessionId
  CROSS APPLY(SELECT p.mentorId userId UNION SELECT s.leadInstructorId UNION SELECT si.instructorId FROM session_instructors si WHERE si.sessionId=s.id) recipient
  WHERE t.deletedAt IS NULL AND t.status<>'done' AND t.dueDate<SYSUTCDATETIME() AND p.status='active'
    AND (sp.sessionId IS NULL OR s.status IN ('active','ending')) AND recipient.userId IS NOT NULL
  UNION ALL
  SELECT CONCAT('session.issue:plan:',s.id,':',latestPlan.id),s.leadInstructorId,'session','session.issue',
    N'Kế hoạch AI cần kiểm tra',CONCAT(s.name,N': lần lập kế hoạch gần nhất bị lỗi. Hãy mở phiên để xem và thử lại.'),CONCAT('/sessions/',s.id)
  FROM internship_sessions s CROSS APPLY(SELECT TOP(1) b.id,b.status FROM ai_generation_batches b WHERE b.sessionId=s.id AND (b.draftJson IS NOT NULL OR b.status IN ('generating','failed')) ORDER BY b.createdAt DESC,b.id) latestPlan
  WHERE s.status IN ('active','ending') AND latestPlan.status='failed' AND s.leadInstructorId IS NOT NULL
  UNION ALL
  SELECT CONCAT('session.issue:github:',s.id,':',CASE WHEN r.status='failed' THEN CONVERT(nvarchar(36),r.leaseId) ELSE CONVERT(nvarchar(36),r.webhookLeaseId) END),s.leadInstructorId,'session','session.issue',
    N'Tích hợp GitHub cần kiểm tra',CONCAT(s.name,N': repository hoặc webhook chưa hoàn tất. Hãy kiểm tra kết nối và cấu hình rồi thử lại.'),CONCAT('/sessions/',s.id)
  FROM internship_sessions s JOIN session_repositories r ON r.sessionId=s.id AND r.ownerUserId=s.leadInstructorId
  WHERE s.status IN ('active','ending') AND (r.status='failed' OR r.webhookStatus='failed') AND s.leadInstructorId IS NOT NULL
), staff AS (
  SELECT u.id,CASE WHEN EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.roleId WHERE ur.userId=u.id AND r.code='admin')
    OR EXISTS(SELECT 1 FROM group_members gm JOIN group_roles gr ON gr.groupId=gm.groupId JOIN roles r ON r.id=gr.roleId WHERE gm.userId=u.id AND r.code='admin') THEN '/admin' ELSE '/instructor' END basePath
  FROM users u WHERE u.status='active' AND (EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.roleId WHERE ur.userId=u.id AND r.code IN ('instructor','admin'))
    OR EXISTS(SELECT 1 FROM group_members gm JOIN group_roles gr ON gr.groupId=gm.groupId JOIN roles r ON r.id=gr.roleId WHERE gm.userId=u.id AND r.code IN ('instructor','admin')))
)`;
