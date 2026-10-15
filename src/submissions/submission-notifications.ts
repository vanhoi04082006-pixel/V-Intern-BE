import { EntityManager } from 'typeorm';
import { notifyInTransaction } from '../common/utils/notify';

/** Only the current managing mentor, with the same session scope as review access. */
export async function notifySubmissionReviewer(em: EntityManager, taskId: string, payload: { type: string; title: string; body?: string }): Promise<void> {
  const recipients: Array<{ id: string; basePath: string }> = await em.query(`
    WITH staff AS (
      SELECT ur.userId, r.code FROM user_roles ur JOIN roles r ON r.id=ur.roleId
      UNION SELECT gm.userId,r.code FROM group_members gm JOIN group_roles gr ON gr.groupId=gm.groupId JOIN roles r ON r.id=gr.roleId
    ) SELECT u.id,CASE WHEN EXISTS(SELECT 1 FROM staff WHERE userId=u.id AND code='admin') THEN '/admin' ELSE '/instructor' END basePath
    FROM tasks t JOIN projects p ON p.id=t.projectId JOIN users u ON u.id=p.mentorId
    LEFT JOIN sprints sp ON sp.id=t.sprintId AND sp.projectId=t.projectId
    WHERE t.id=@0 AND t.deletedAt IS NULL AND u.status='active'
      AND EXISTS(SELECT 1 FROM staff WHERE userId=u.id AND code IN ('instructor','admin'))
      AND (EXISTS(SELECT 1 FROM staff WHERE userId=u.id AND code='admin') OR sp.sessionId IS NULL
        OR EXISTS(SELECT 1 FROM internship_sessions s WHERE s.id=sp.sessionId AND (s.leadInstructorId=u.id
          OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=s.id AND si.instructorId=u.id))))`, [taskId]);
  for (const recipient of recipients) await notifyInTransaction(em, [recipient.id], { ...payload, category: 'task', linkUrl: `${recipient.basePath}/tasks/${taskId}` });
}
