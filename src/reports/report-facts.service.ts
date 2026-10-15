import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateReportDto } from './report.dto';

export interface ReportTask {
  id: string; code: string; title: string; status: string; assigneeId: string | null; assigneeName: string | null;
  sprintId: string | null; sprintName: string | null; dueDate: Date | null; blocked: boolean;
  submissionStatus: string | null; aiStatus: string | null; aiScore: number | null; instructorScore: number | null;
}
export interface ReportDetails {
  tasks: ReportTask[];
  sprints: Array<{ id: string; name: string; status: string; startDate: Date; endDate: Date; total: number; completed: number; overdue: number; blocked: number }>;
  timeline: Array<{ taskId: string; taskCode: string; toStatus: string; createdAt: Date }>;
  summary: { total: number; completed: number; overdue: number; blocked: number; unassigned: number; risk: 'low' | 'medium' | 'high'; reasons: string[] };
}
@Injectable()
export class ReportFactsService {
  constructor(private readonly db: DataSource) {}
  async capture(input: CreateReportDto, principal: { userId: string; isAdmin: boolean }, memberIds: string[]): Promise<ReportDetails> {
    const params = [input.projectId, input.sessionId ?? null, input.sprintId ?? null, input.studentId ?? null,
      input.from ? new Date(input.from) : null, input.to ? new Date(input.to) : null, principal.userId, principal.isAdmin ? 1 : 0, JSON.stringify(memberIds)];
    const scope = `WITH scopedTasks AS (
      SELECT t.*,sp.name sprintName FROM tasks t JOIN projects p ON p.id=t.projectId LEFT JOIN sprints sp ON sp.id=t.sprintId AND sp.projectId=t.projectId
      LEFT JOIN internship_sessions se ON se.id=sp.sessionId
      WHERE t.projectId=@0 AND t.deletedAt IS NULL AND (@1 IS NULL OR sp.sessionId=@1) AND (@2 IS NULL OR t.sprintId=@2) AND (@3 IS NULL OR t.assigneeId=@3)
      AND (@4 IS NULL OR t.createdAt>=@4) AND (@5 IS NULL OR t.createdAt<@5)
      AND (t.assigneeId IS NULL OR EXISTS(SELECT 1 FROM OPENJSON(@8) members WHERE TRY_CONVERT(uniqueidentifier,members.value)=t.assigneeId))
      AND (@7=1 OR p.mentorId=@6 OR se.leadInstructorId=@6 OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=sp.sessionId AND si.instructorId=@6))
    )`;
    if (input.sprintId) {
      const valid = await this.db.query('SELECT id FROM sprints WHERE id=@2 AND projectId=@0 AND (@1 IS NULL OR sessionId=@1)', params);
      if (!valid.length) throw new BadRequestException('Sprint does not belong to the selected project/session.');
    }
    const rows: Array<Omit<ReportTask, 'blocked'> & { blocked: number }> = await this.db.query(`${scope} SELECT TOP(501) t.id,t.code,t.title,t.status,t.assigneeId,u.displayName assigneeName,t.sprintId,t.sprintName,t.dueDate,
      CASE WHEN EXISTS(SELECT 1 FROM task_specs spec CROSS APPLY OPENJSON(spec.specJson,'$.dependencies') WITH(taskId uniqueidentifier '$.taskId') dependency
        LEFT JOIN tasks prior ON prior.id=dependency.taskId AND prior.projectId=t.projectId AND prior.deletedAt IS NULL
        WHERE spec.taskId=t.id AND (prior.id IS NULL OR prior.status<>'done')) THEN 1 ELSE 0 END blocked,
      submission.status submissionStatus,submission.score instructorScore,review.status aiStatus,TRY_CONVERT(float,JSON_VALUE(review.resultJson,'$.score')) aiScore
      FROM scopedTasks t LEFT JOIN users u ON u.id=t.assigneeId
      OUTER APPLY(SELECT TOP(1) id,status,score FROM task_submissions s WHERE s.taskId=t.id ORDER BY s.submittedAt DESC,s.id) submission
      OUTER APPLY(SELECT TOP(1) status,resultJson FROM submission_code_reviews r WHERE r.submissionId=submission.id ORDER BY r.createdAt DESC,r.id) review
      ORDER BY t.createdAt,t.id`, params);
    if (rows.length > 500) throw new BadRequestException({ code: 'REPORT_SCOPE_TOO_LARGE', message: 'Báo cáo tối đa 500 task. Hãy lọc sprint, sinh viên hoặc khoảng ngày.' });
    const tasks = rows.map(row => ({ ...row, blocked: Boolean(row.blocked) && row.status !== 'done' }));
    const sprints: Array<{ id: string; name: string; status: string; startDate: Date; endDate: Date }> = await this.db.query(`SELECT TOP(100) sp.id,sp.name,sp.status,sp.startDate,sp.endDate FROM sprints sp JOIN projects p ON p.id=sp.projectId LEFT JOIN internship_sessions se ON se.id=sp.sessionId
      WHERE sp.projectId=@0 AND (@1 IS NULL OR sp.sessionId=@1) AND (@2 IS NULL OR sp.id=@2)
      AND (@7=1 OR p.mentorId=@6 OR se.leadInstructorId=@6 OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=sp.sessionId AND si.instructorId=@6)) ORDER BY sp.startDate,sp.id`, params);
    const timeline = await this.db.query(`${scope} SELECT TOP(100) h.taskId,t.code taskCode,h.toStatus,h.createdAt FROM task_status_histories h JOIN scopedTasks t ON t.id=h.taskId ORDER BY h.createdAt DESC,h.id`, params);
    const now = Date.now(), overdue = (t: ReportTask) => t.status !== 'done' && t.dueDate !== null && new Date(t.dueDate).getTime() < now;
    const summary: ReportDetails['summary'] = { total: tasks.length, completed: tasks.filter(t => t.status === 'done').length, overdue: tasks.filter(overdue).length, blocked: tasks.filter(t => t.blocked).length, unassigned: tasks.filter(t => !t.assigneeId).length, risk: 'low', reasons: [] };
    const sprintSummaries = sprints.map(s => { const work = tasks.filter(t => t.sprintId?.toLowerCase() === s.id.toLowerCase()); return { ...s, total: work.length, completed: work.filter(t => t.status === 'done').length, overdue: work.filter(overdue).length, blocked: work.filter(t => t.blocked).length }; });
    if (summary.overdue) summary.reasons.push(`${summary.overdue} task đang quá hạn.`);
    if (summary.blocked) summary.reasons.push(`${summary.blocked} task đang chờ phụ thuộc.`);
    if (summary.unassigned) summary.reasons.push(`${summary.unassigned} task chưa có người phụ trách.`);
    if (sprintSummaries.some(s => new Date(s.endDate).getTime() < now && s.completed < s.total)) summary.reasons.push('Có sprint đã hết hạn còn task chưa hoàn thành.');
    summary.risk = summary.overdue || summary.reasons.some(r => r.startsWith('Có sprint')) ? 'high' : summary.blocked || summary.unassigned ? 'medium' : 'low';
    return { tasks, sprints: sprintSummaries, timeline, summary };
  }
  async assertSavedAccess(details: ReportDetails | undefined, projectId: string, principal: { userId: string; isAdmin: boolean }) {
    if (!details?.tasks.length || principal.isAdmin) return;
    const denied = await this.db.query(`SELECT saved.value FROM OPENJSON(@0) saved LEFT JOIN tasks t ON t.id=TRY_CONVERT(uniqueidentifier,saved.value)
      LEFT JOIN projects p ON p.id=t.projectId LEFT JOIN sprints sp ON sp.id=t.sprintId LEFT JOIN internship_sessions se ON se.id=sp.sessionId
      WHERE t.id IS NULL OR t.projectId<>@1 OR NOT EXISTS(SELECT 1 FROM projects currentProject WHERE currentProject.id=t.projectId AND
        (currentProject.mentorId=@2 OR se.leadInstructorId=@2 OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=sp.sessionId AND si.instructorId=@2)))`, [JSON.stringify(details.tasks.map(t => t.id)), projectId, principal.userId]);
    if (denied.length) throw new ForbiddenException('Report task scope is no longer accessible.');
  }
}
