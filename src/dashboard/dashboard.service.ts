import { Injectable, NotFoundException } from '@nestjs/common';
import { burndown } from './burndown';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../rbac/permissions.service';

/** Counts use complete SQL sets, never the first paginated page. Every scope is actor-bound. */
@Injectable()
export class DashboardService {
  constructor(private readonly db: DataSource, private readonly permissions: PermissionsService) {}

  async userRoles(ids:string[]) {
    if(!ids.length)return {items:[]};
    return {items:await this.db.query(`SELECT DISTINCT x.userId,r.name,r.code FROM (
      SELECT userId,roleId FROM user_roles UNION SELECT gm.userId,gr.roleId FROM group_members gm JOIN group_roles gr ON gr.groupId=gm.groupId
    ) x JOIN roles r ON r.id=x.roleId WHERE x.userId IN (${ids.map((_,i)=>`@${i}`).join(',')})`,ids)};
  }

  async access() {
    const [roles,grants,groups,activity]=await Promise.all([
      this.db.query(`SELECT r.id,r.code,r.name,(SELECT COUNT(*) FROM role_permissions rp WHERE rp.roleId=r.id) permissionCount,
        (SELECT COUNT(*) FROM (SELECT userId,roleId FROM user_roles UNION SELECT gm.userId,gr.roleId FROM group_members gm JOIN group_roles gr ON gr.groupId=gm.groupId) ur JOIN users u ON u.id=ur.userId WHERE ur.roleId=r.id AND u.status<>'deleted') userCount FROM roles r ORDER BY r.code`),
      this.db.query('SELECT rp.roleId,p.code,p.name FROM role_permissions rp JOIN permissions p ON p.id=rp.permissionId ORDER BY p.code'),
      this.db.query(`SELECT g.id,g.name,g.code,(SELECT STRING_AGG(CAST(gr.roleId AS varchar(36)), ',') FROM group_roles gr WHERE gr.groupId=g.id) roleIds,(SELECT COUNT(*) FROM group_members m WHERE m.groupId=g.id) memberCount,
        (SELECT COUNT(*) FROM group_roles r WHERE r.groupId=g.id) roleCount FROM user_groups g`),
      this.db.query(`SELECT TOP(6) a.id,a.summary,a.action,a.createdAt,u.displayName FROM activity_events a LEFT JOIN users u ON u.id=a.actorId WHERE a.module IN ('groups','users','rbac') ORDER BY a.createdAt DESC`),
    ]);
    return {roles,grants,groups,activity};
  }

  async burndown(id:string) {
    const sprint=await this.db.query('SELECT startDate,endDate FROM sprints WHERE id=@0',[id]);
    if(!sprint.length) throw new NotFoundException('Sprint not found.');
    const [tasks,events]=await Promise.all([
      this.db.query('SELECT id,createdAt FROM tasks WHERE sprintId=@0 AND deletedAt IS NULL',[id]),
      this.db.query('SELECT h.taskId,h.toStatus,h.createdAt FROM task_status_histories h JOIN tasks t ON t.id=h.taskId WHERE t.sprintId=@0 AND t.deletedAt IS NULL ORDER BY h.createdAt,h.id',[id]),
    ]);
    return {scope:'Current sprint tasks; UTC daily status history',points:burndown(sprint[0].startDate,sprint[0].endDate,tasks,events)};
  }

  async academic(kind: 'classes'|'sessions'|'projects', ids: string[]) {
    if (!ids.length) return {items:[]};
    const placeholders = ids.map((_,i) => `@${i}`).join(',');
    // Table and relation expressions are fixed internally; only UUID values are supplied by clients.
    const queries = {
      classes: `SELECT c.id,u.displayName responsibleName,s.name sessionName,
        (SELECT COUNT(*) FROM class_members m WHERE m.classId=c.id) memberCount,
        CAST(NULL AS int) taskCount, CAST(NULL AS int) doneCount
        FROM classes c LEFT JOIN users u ON u.id=c.leadInstructorId LEFT JOIN internship_sessions s ON s.id=c.sessionId WHERE c.id IN (${placeholders})`,
      sessions: `SELECT s.id,u.displayName responsibleName,CAST(NULL AS nvarchar(256)) sessionName,
        (SELECT COUNT(*) FROM session_members m WHERE m.sessionId=s.id) memberCount,
        (SELECT COUNT(*) FROM tasks t JOIN sprints sp ON sp.id=t.sprintId WHERE sp.sessionId=s.id AND t.deletedAt IS NULL) taskCount,
        (SELECT COUNT(*) FROM tasks t JOIN sprints sp ON sp.id=t.sprintId WHERE sp.sessionId=s.id AND t.deletedAt IS NULL AND t.status='done') doneCount
        FROM internship_sessions s LEFT JOIN users u ON u.id=s.leadInstructorId WHERE s.id IN (${placeholders})`,
      projects: `SELECT p.id,u.displayName responsibleName,CAST(NULL AS nvarchar(256)) sessionName,
        (SELECT COUNT(*) FROM project_members m WHERE m.projectId=p.id) memberCount,
        (SELECT COUNT(*) FROM tasks t WHERE t.projectId=p.id AND t.deletedAt IS NULL) taskCount,
        (SELECT COUNT(*) FROM tasks t WHERE t.projectId=p.id AND t.deletedAt IS NULL AND t.status='done') doneCount
        FROM projects p LEFT JOIN users u ON u.id=p.mentorId WHERE p.id IN (${placeholders})`,
    };
    return {items: await this.db.query(queries[kind], ids)};
  }

  async catalogs() {
    const types = await this.db.query(`SELECT t.id,t.code,t.name,COUNT(i.id) itemCount,
      SUM(CASE WHEN i.isActive=1 THEN 1 ELSE 0 END) activeCount
      FROM catalog_types t LEFT JOIN catalog_items i ON i.typeId=t.id
      GROUP BY t.id,t.code,t.name ORDER BY t.code`);
    return { types, generatedAt: new Date() };
  }

  async academicOverview(kind: 'classes'|'sessions'|'projects') {
    const schema = {
      classes: { table:'classes', members:'class_members', column:'classId' },
      sessions: { table:'internship_sessions', members:'session_members', column:'sessionId' },
      projects: { table:'projects', members:'project_members', column:'projectId' },
    }[kind];
    const [statuses,members,upcoming,technologies] = await Promise.all([
      this.db.query(`SELECT status,COUNT(*) count FROM ${schema.table} GROUP BY status`),
      this.db.query(`SELECT COUNT(DISTINCT m.userId) count FROM ${schema.members} m JOIN ${schema.table} a ON a.id=m.${schema.column}`),
      this.db.query(`SELECT TOP(5) id,code,name,startDate,endDate,status FROM ${schema.table} WHERE status IN ('upcoming','active','ending','draft') ORDER BY CASE WHEN endDate>=SYSUTCDATETIME() THEN 0 ELSE 1 END,endDate,code`),
      kind==='projects' ? this.db.query('SELECT TOP(5) technology,COUNT(DISTINCT projectId) count FROM project_technologies GROUP BY technology ORDER BY count DESC,technology') : Promise.resolve([]),
    ]);
    return {statuses,memberCount:members[0].count,upcoming,technologies,generatedAt:new Date()};
  }

  async admin() {
    const [metrics, users, roles, activity, statuses] = await Promise.all([
      this.db.query(`SELECT (SELECT COUNT(*) FROM users WHERE status<>'deleted') userCount,
        (SELECT COUNT(DISTINCT ur.userId) FROM user_roles ur JOIN roles r ON r.id=ur.roleId JOIN users u ON u.id=ur.userId WHERE r.code='instructor' AND u.status<>'deleted') instructorCount,
        (SELECT COUNT(DISTINCT ur.userId) FROM user_roles ur JOIN roles r ON r.id=ur.roleId JOIN users u ON u.id=ur.userId WHERE r.code='intern' AND u.status<>'deleted') internCount,
        (SELECT COUNT(*) FROM internship_sessions WHERE status='active') activeSessions,
        (SELECT COUNT(*) FROM ai_runs WHERE createdAt>=CONVERT(date,SYSUTCDATETIME())) aiRunsToday`),
      this.db.query(`SELECT TOP(5) id,displayName,email,status,lastLoginAt FROM users WHERE status<>'deleted' ORDER BY createdAt DESC,id`),
      this.db.query(`SELECT r.id,r.code,r.name,(SELECT COUNT(*) FROM role_permissions rp WHERE rp.roleId=r.id) permissionCount FROM roles r ORDER BY r.code`),
      this.db.query(`SELECT TOP(6) ev.id,ev.summary,ev.action,ev.createdAt,u.displayName FROM activity_events ev LEFT JOIN users u ON u.id=ev.actorId ORDER BY ev.createdAt DESC`),
      this.db.query(`SELECT status,COUNT(*) count FROM users WHERE status<>'deleted' GROUP BY status`),
    ]);
    return { metrics: metrics[0], users, roles, activity, statuses, generatedAt: new Date() };
  }

  async instructor(actorId: string) {
    const admin = await this.permissions.hasRole(actorId, 'admin');
    const args = [actorId, admin ? 1 : 0];
    const projectsScope = `SELECT p.id FROM projects p WHERE p.archivedAt IS NULL AND
      (@1 = 1 OR p.mentorId = @0 OR EXISTS (SELECT 1 FROM assignments a JOIN internship_sessions s ON s.id=a.sessionId
        WHERE a.projectId=p.id AND (s.leadInstructorId=@0 OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=s.id AND si.instructorId=@0))))`;
    const sessionScope = `SELECT s.id FROM internship_sessions s WHERE
      (@1=1 OR s.leadInstructorId=@0 OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=s.id AND si.instructorId=@0))`;
    const [metrics, sessions, students, activity, sprints, reviews] = await Promise.all([
      this.db.query(`SELECT
        (SELECT COUNT(*) FROM internship_sessions WHERE id IN (${sessionScope})) sessionCount,
        (SELECT COUNT(*) FROM internship_sessions WHERE id IN (${sessionScope}) AND status='active') activeSessions,
        (SELECT COUNT(DISTINCT internId) FROM assignments WHERE projectId IN (${projectsScope}) AND status='active') internCount,
        (SELECT COUNT(*) FROM tasks WHERE projectId IN (${projectsScope}) AND deletedAt IS NULL) taskCount,
        (SELECT COUNT(*) FROM tasks WHERE projectId IN (${projectsScope}) AND deletedAt IS NULL AND status='todo') todoCount,
        (SELECT COUNT(*) FROM tasks WHERE projectId IN (${projectsScope}) AND deletedAt IS NULL AND status='doing') doingCount,
        (SELECT COUNT(*) FROM tasks WHERE projectId IN (${projectsScope}) AND deletedAt IS NULL AND status='done') doneCount,
        (SELECT COUNT(*) FROM tasks WHERE projectId IN (${projectsScope}) AND deletedAt IS NULL AND status='review') reviewCount,
        (SELECT COUNT(*) FROM tasks WHERE projectId IN (${projectsScope}) AND deletedAt IS NULL AND status<>'done' AND dueDate<SYSUTCDATETIME()) overdueCount,
        (SELECT AVG(CAST(overallScore AS float)) FROM evaluations WHERE status='finalized' AND (@1=1 OR evaluatorId=@0)) averageScore`, args),
      this.db.query(`SELECT TOP(4) s.id,s.code,s.name,s.status,s.startDate,s.endDate,(SELECT STRING_AGG(CAST(p.name AS nvarchar(max)), N', ') FROM projects p WHERE p.archivedAt IS NULL AND (EXISTS(SELECT 1 FROM sprints sp WHERE sp.sessionId=s.id AND sp.projectId=p.id) OR EXISTS(SELECT 1 FROM assignments a WHERE a.sessionId=s.id AND a.projectId=p.id AND a.status='active'))) projectName,
        (SELECT COUNT(*) FROM session_members m WHERE m.sessionId=s.id) memberCount,
        (SELECT COUNT(*) FROM tasks t JOIN sprints sp ON sp.id=t.sprintId WHERE sp.sessionId=s.id AND t.deletedAt IS NULL) taskCount,
        (SELECT COUNT(*) FROM tasks t JOIN sprints sp ON sp.id=t.sprintId WHERE sp.sessionId=s.id AND t.deletedAt IS NULL AND t.status='done') doneCount
        FROM internship_sessions s WHERE s.id IN (${sessionScope}) ORDER BY s.startDate DESC`, args),
      this.db.query(`SELECT TOP(5) u.id,u.displayName,u.email,p.name projectName,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigneeId=u.id AND t.projectId=a.projectId AND t.deletedAt IS NULL) taskCount,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigneeId=u.id AND t.projectId=a.projectId AND t.deletedAt IS NULL AND t.status='done') doneCount,
        (SELECT AVG(CAST(e.overallScore AS float)) FROM evaluations e WHERE e.internId=u.id AND e.status='finalized' AND (@1=1 OR e.evaluatorId=@0)) averageScore
        FROM assignments a JOIN users u ON u.id=a.internId JOIN projects p ON p.id=a.projectId
        WHERE a.status='active' AND a.projectId IN (${projectsScope}) ORDER BY doneCount DESC,u.displayName`, args),
      this.db.query(`SELECT TOP(8) ev.id,ev.summary,ev.action,ev.createdAt,u.displayName
        FROM activity_events ev LEFT JOIN users u ON u.id=ev.actorId WHERE @1=1 OR ev.actorId=@0
        OR EXISTS(SELECT 1 FROM assignments a WHERE a.internId=ev.actorId AND a.projectId IN (${projectsScope})) ORDER BY ev.createdAt DESC`, args),
      this.db.query(`SELECT TOP(5) sp.id,sp.name,sp.status,sp.startDate,sp.endDate,p.name projectName
        FROM sprints sp JOIN projects p ON p.id=sp.projectId WHERE sp.projectId IN (${projectsScope})
        ORDER BY CASE WHEN sp.status='active' THEN 0 ELSE 1 END,sp.startDate DESC`, args),
      this.db.query(`SELECT TOP(5) sub.id,sub.taskId,sub.internId,sub.prUrl,sub.status,sub.score,sub.submittedAt,
        t.code taskCode,t.title taskTitle,t.projectId,u.displayName
        FROM task_submissions sub JOIN tasks t ON t.id=sub.taskId JOIN users u ON u.id=sub.internId
        WHERE t.deletedAt IS NULL AND t.projectId IN (${projectsScope})
        ORDER BY sub.submittedAt DESC,sub.id DESC`, args),
    ]);
    return { metrics: metrics[0], sessions, students, activity, sprints, reviews, generatedAt: new Date() };
  }
}
