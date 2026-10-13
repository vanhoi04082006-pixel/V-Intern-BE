import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../rbac/permissions.service';
import { ActorContext } from '../users/users.service';
import { isUniqueViolation } from '../common/utils/db-errors';
import { ClassAnnouncementDto, CreateClassLessonDto, SaveAttendanceDto, UpdateClassLessonDto } from './dto/class-lesson.dtos';

@Injectable()
export class ClassLessonsService {
  constructor(private readonly db: DataSource, private readonly permissions: PermissionsService, private readonly audit: AuditService) {}
  private async access(classId: string, actorId: string) {
    const rows = await this.db.query('SELECT id,leadInstructorId FROM classes WHERE id=@0', [classId]);
    if (!rows.length) throw new NotFoundException('Class not found.');
    const permissions = await this.permissions.getEffectivePermissionCodes(actorId);
    if (!permissions.has('users.manage') && rows[0].leadInstructorId?.toLowerCase() !== actorId.toLowerCase()) throw new ForbiddenException('Class belongs to another instructor.');
  }
  private interval(input: CreateClassLessonDto) {
    if (!input.title.trim() || !Number.isFinite(Date.parse(input.startsAt)) || !Number.isFinite(Date.parse(input.endsAt)) || Date.parse(input.endsAt) <= Date.parse(input.startsAt)) throw new BadRequestException('Invalid lesson interval or title.');
  }
  async list(classId: string, actorId: string) {
    await this.access(classId, actorId);
    const [lessons, announcements] = await Promise.all([
      this.db.query(`SELECT TOP(100) l.*,COUNT(a.userId) markedCount,
        SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) attendedCount,
        SUM(CASE WHEN a.status='absent' THEN 1 ELSE 0 END) absentCount,
        SUM(CASE WHEN a.status='late' THEN 1 ELSE 0 END) lateCount,
        SUM(CASE WHEN a.status='excused' THEN 1 ELSE 0 END) excusedCount
        FROM class_lessons l LEFT JOIN class_attendance a ON a.lessonId=l.id WHERE l.classId=@0
        GROUP BY l.id,l.classId,l.title,l.startsAt,l.endsAt,l.mode,l.location,l.status,l.version,l.createdById,l.createdAt,l.updatedAt
        ORDER BY l.startsAt DESC`, [classId]),
      this.db.query('SELECT TOP(10) a.*,u.displayName actorName FROM class_announcements a JOIN users u ON u.id=a.createdById WHERE a.classId=@0 ORDER BY a.createdAt DESC', [classId]),
    ]);
    return { lessons, announcements };
  }
  async create(classId: string, input: CreateClassLessonDto, ctx: ActorContext) {
    await this.access(classId, ctx.actorId!); this.interval(input);
    try {
      const [row] = await this.db.query(`INSERT INTO class_lessons(classId,title,startsAt,endsAt,mode,location,createdById) OUTPUT INSERTED.* VALUES(@0,@1,@2,@3,@4,@5,@6)`, [classId,input.title.trim(),new Date(input.startsAt),new Date(input.endsAt),input.mode,input.location.trim(),ctx.actorId]);
      await this.audit.record({ ...ctx, action: 'class.lesson.created', targetType: 'class_lesson', targetId: row.id, detail: { classId } });
      return row;
    } catch (e) { if (isUniqueViolation(e)) throw new ConflictException('A lesson already starts at this time.'); throw e; }
  }
  async update(classId: string, lessonId: string, input: UpdateClassLessonDto, ctx: ActorContext) {
    await this.access(classId, ctx.actorId!); this.interval(input);
    try {
      const rows = await this.db.query(`UPDATE class_lessons SET title=@3,startsAt=@4,endsAt=@5,mode=@6,location=@7,status=@8,version=version+1,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE id=@0 AND classId=@1 AND version=@2`, [lessonId,classId,input.version,input.title.trim(),new Date(input.startsAt),new Date(input.endsAt),input.mode,input.location.trim(),input.status]);
      if (!rows.length) throw new ConflictException('Lesson changed; reload before saving.');
      await this.audit.record({ ...ctx, action: 'class.lesson.updated', targetType: 'class_lesson', targetId: lessonId, detail: { classId, version: input.version } });
      return rows[0];
    } catch (e) { if (isUniqueViolation(e)) throw new ConflictException('A lesson already starts at this time.'); throw e; }
  }
  async attendance(classId: string, lessonId: string, actorId: string) {
    await this.access(classId, actorId);
    const [lesson] = await this.db.query('SELECT * FROM class_lessons WHERE classId=@0 AND id=@1', [classId,lessonId]);
    if (!lesson) throw new NotFoundException('Lesson not found.');
    const members = await this.db.query(`SELECT u.id userId,u.displayName,u.email,a.status,a.note,
      CASE WHEN m.userId IS NULL THEN 0 ELSE 1 END currentMember FROM users u
      LEFT JOIN class_members m ON m.userId=u.id AND m.classId=@0
      LEFT JOIN class_attendance a ON a.userId=u.id AND a.lessonId=@1
      WHERE m.userId IS NOT NULL OR a.userId IS NOT NULL ORDER BY u.displayName`, [classId,lessonId]);
    return { lesson, members };
  }
  async saveAttendance(classId: string, lessonId: string, input: SaveAttendanceDto, ctx: ActorContext) {
    await this.access(classId, ctx.actorId!);
    if (new Set(input.marks.map(m => m.userId.toLowerCase())).size !== input.marks.length) throw new BadRequestException('Duplicate attendance user.');
    const result = await this.db.transaction(async tx => {
      const members = await tx.query('SELECT userId FROM class_members WHERE classId=@0', [classId]);
      const ids = new Set(members.map((m: { userId: string }) => m.userId.toLowerCase()));
      if (input.marks.some(m => !ids.has(m.userId.toLowerCase()))) throw new BadRequestException('Attendance user is not a current class member.');
      const rows = await tx.query(`UPDATE class_lessons SET version=version+1,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id,INSERTED.version WHERE id=@0 AND classId=@1 AND version=@2 AND status<>'cancelled'`, [lessonId,classId,input.version]);
      if (!rows.length) throw new ConflictException('Lesson changed or cancelled; reload before saving.');
      // Historical marks for former members remain intact; replace only the current roster snapshot.
      await tx.query('DELETE a FROM class_attendance a JOIN class_members m ON m.userId=a.userId AND m.classId=@0 WHERE a.lessonId=@1', [classId,lessonId]);
      for (const mark of input.marks) await tx.query('INSERT INTO class_attendance(lessonId,userId,status,note,markedById) VALUES(@0,@1,@2,@3,@4)', [lessonId,mark.userId,mark.status,mark.note?.trim() || null,ctx.actorId]);
      return rows[0];
    });
    await this.audit.record({ ...ctx, action: 'class.attendance.saved', targetType: 'class_lesson', targetId: lessonId, detail: { classId, count: input.marks.length, version: result.version } });
    return result;
  }
  async announce(classId: string, input: ClassAnnouncementDto, ctx: ActorContext) {
    await this.access(classId, ctx.actorId!);
    if (!input.title.trim() || !input.body.trim()) throw new BadRequestException('Announcement cannot be blank.');
    const result = await this.db.transaction(async tx => {
      const [row] = await tx.query('INSERT INTO class_announcements(classId,title,body,createdById) OUTPUT INSERTED.* VALUES(@0,@1,@2,@3)', [classId,input.title.trim(),input.body.trim(),ctx.actorId]);
      const recipients = await tx.query(`SELECT m.userId FROM class_members m JOIN users u ON u.id=m.userId WHERE m.classId=@0 AND u.status='active' AND NOT EXISTS(SELECT 1 FROM notification_preferences p WHERE p.userId=m.userId AND p.category='announcement' AND p.enabled=0)`, [classId]);
      for (const r of recipients) await tx.query(`INSERT INTO notifications(userId,type,title,body,linkUrl) VALUES(@0,'announcement',@1,@2,'/intern/notifications')`, [r.userId,input.title.trim(),input.body.trim()]);
      return { ...row, sentCount: recipients.length };
    });
    await this.audit.record({ ...ctx, action: 'class.announcement.created', targetType: 'class', targetId: classId, detail: { announcementId: result.id, sentCount: result.sentCount } });
    return result;
  }
}
