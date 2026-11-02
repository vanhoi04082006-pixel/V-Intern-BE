import { MigrationInterface, QueryRunner } from 'typeorm';

/** Removes the retired class-management and session-sharing capabilities. */
export class RemoveClassesAndSessionSharing1793232000000 implements MigrationInterface {
  name = 'RemoveClassesAndSessionSharing1793232000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DELETE rp FROM role_permissions rp
      JOIN permissions p ON p.id=rp.permissionId
      WHERE p.code IN ('classes.view','classes.manage')`);
    await q.query(`DELETE FROM permissions WHERE code IN ('classes.view','classes.manage')`);
    await q.query(`DELETE FROM audit_logs
      WHERE action LIKE 'class.%'
        OR (targetType='session_access_request' AND action LIKE 'sharing.%')`);
    await q.query(`DELETE FROM activity_events WHERE module IN ('classes','sharing')`);
    await q.query(`DELETE FROM notifications
      WHERE type='session.sharing'
        OR linkUrl IN ('/instructor/classes','/admin/classes','/instructor/sharing')`);

    await q.query(`IF OBJECT_ID(N'dbo.class_attendance', N'U') IS NOT NULL DROP TABLE dbo.class_attendance`);
    await q.query(`IF OBJECT_ID(N'dbo.class_announcements', N'U') IS NOT NULL DROP TABLE dbo.class_announcements`);
    await q.query(`IF OBJECT_ID(N'dbo.class_lessons', N'U') IS NOT NULL DROP TABLE dbo.class_lessons`);
    await q.query(`IF OBJECT_ID(N'dbo.class_members', N'U') IS NOT NULL DROP TABLE dbo.class_members`);
    await q.query(`IF OBJECT_ID(N'dbo.classes', N'U') IS NOT NULL DROP TABLE dbo.classes`);
    await q.query(`IF OBJECT_ID(N'dbo.session_access_requests', N'U') IS NOT NULL DROP TABLE dbo.session_access_requests`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE classes (
      id uniqueidentifier NOT NULL CONSTRAINT DF_classes_id DEFAULT NEWID() CONSTRAINT PK_classes PRIMARY KEY,
      code nvarchar(64) NOT NULL,
      name nvarchar(256) NOT NULL,
      description nvarchar(max) NULL,
      leadInstructorId uniqueidentifier NULL,
      sessionId uniqueidentifier NULL,
      status nvarchar(16) NOT NULL CONSTRAINT DF_classes_status DEFAULT ('upcoming')
        CONSTRAINT CK_classes_status CHECK (status IN ('upcoming','active','paused','completed','cancelled')),
      startDate datetime2 NULL,
      endDate datetime2 NULL,
      createdAt datetime2 NOT NULL CONSTRAINT DF_classes_createdAt DEFAULT SYSUTCDATETIME(),
      updatedAt datetime2 NOT NULL CONSTRAINT DF_classes_updatedAt DEFAULT SYSUTCDATETIME(),
      meetingSchedule nvarchar(128) NULL,
      meetingLocation nvarchar(128) NULL,
      progress int NOT NULL CONSTRAINT DF_classes_progress DEFAULT 0
        CONSTRAINT CK_classes_progress CHECK (progress BETWEEN 0 AND 100),
      CONSTRAINT FK_classes_leadInstructor FOREIGN KEY (leadInstructorId) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT FK_classes_session FOREIGN KEY (sessionId) REFERENCES internship_sessions(id) ON DELETE CASCADE
    )`);
    await q.query('CREATE UNIQUE INDEX UX_classes_code ON classes(code)');
    await q.query('CREATE INDEX IX_classes_status ON classes(status)');
    await q.query('CREATE INDEX IX_classes_leadInstructorId ON classes(leadInstructorId)');
    await q.query('CREATE INDEX IX_classes_sessionId ON classes(sessionId)');
    await q.query(`CREATE TABLE class_members (
      classId uniqueidentifier NOT NULL,
      userId uniqueidentifier NOT NULL,
      joinedAt datetime2 NOT NULL CONSTRAINT DF_class_members_joinedAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_class_members PRIMARY KEY (classId,userId),
      CONSTRAINT FK_class_members_class FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE CASCADE,
      CONSTRAINT FK_class_members_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`);
    await q.query('CREATE INDEX IX_class_members_userId ON class_members(userId)');

    await q.query(`CREATE TABLE class_lessons (
      id uniqueidentifier NOT NULL CONSTRAINT DF_class_lessons_id DEFAULT NEWID() CONSTRAINT PK_class_lessons PRIMARY KEY,
      classId uniqueidentifier NOT NULL CONSTRAINT FK_class_lessons_class REFERENCES classes(id),
      title nvarchar(256) NOT NULL,
      startsAt datetime2 NOT NULL,
      endsAt datetime2 NOT NULL,
      mode nvarchar(16) NOT NULL CONSTRAINT CK_class_lessons_mode CHECK (mode IN ('online','on_site')),
      location nvarchar(256) NOT NULL,
      status nvarchar(16) NOT NULL CONSTRAINT DF_class_lessons_status DEFAULT 'scheduled'
        CONSTRAINT CK_class_lessons_status CHECK (status IN ('scheduled','completed','cancelled')),
      version int NOT NULL CONSTRAINT DF_class_lessons_version DEFAULT 1,
      createdById uniqueidentifier NOT NULL CONSTRAINT FK_class_lessons_actor REFERENCES users(id),
      createdAt datetime2 NOT NULL CONSTRAINT DF_class_lessons_createdAt DEFAULT SYSUTCDATETIME(),
      updatedAt datetime2 NOT NULL CONSTRAINT DF_class_lessons_updatedAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_class_lessons_interval CHECK (endsAt > startsAt),
      CONSTRAINT UQ_class_lessons_start UNIQUE (classId,startsAt)
    )`);
    await q.query(`CREATE TABLE class_attendance (
      lessonId uniqueidentifier NOT NULL CONSTRAINT FK_class_attendance_lesson REFERENCES class_lessons(id),
      userId uniqueidentifier NOT NULL CONSTRAINT FK_class_attendance_user REFERENCES users(id),
      status nvarchar(16) NOT NULL CONSTRAINT CK_class_attendance_status CHECK (status IN ('present','late','absent','excused')),
      note nvarchar(512) NULL,
      markedById uniqueidentifier NOT NULL CONSTRAINT FK_class_attendance_actor REFERENCES users(id),
      updatedAt datetime2 NOT NULL CONSTRAINT DF_class_attendance_updatedAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_class_attendance PRIMARY KEY (lessonId,userId)
    )`);
    await q.query(`CREATE TABLE class_announcements (
      id uniqueidentifier NOT NULL CONSTRAINT DF_class_announcements_id DEFAULT NEWID() CONSTRAINT PK_class_announcements PRIMARY KEY,
      classId uniqueidentifier NOT NULL CONSTRAINT FK_class_announcements_class REFERENCES classes(id),
      title nvarchar(256) NOT NULL,
      body nvarchar(2000) NOT NULL,
      createdById uniqueidentifier NOT NULL CONSTRAINT FK_class_announcements_actor REFERENCES users(id),
      createdAt datetime2 NOT NULL CONSTRAINT DF_class_announcements_createdAt DEFAULT SYSUTCDATETIME()
    )`);
    await q.query('CREATE INDEX IX_class_lessons_start ON class_lessons(startsAt,classId)');
    await q.query('CREATE INDEX IX_class_announcements_class ON class_announcements(classId,createdAt)');
    await q.query(`CREATE TABLE session_access_requests (
      id uniqueidentifier NOT NULL PRIMARY KEY,
      requesterId uniqueidentifier NOT NULL REFERENCES users(id),
      ownerId uniqueidentifier NOT NULL REFERENCES users(id),
      sessionId uniqueidentifier NULL REFERENCES internship_sessions(id),
      reason nvarchar(2000) NOT NULL,
      status nvarchar(16) NOT NULL CONSTRAINT DF_session_access_status DEFAULT 'pending',
      expiresAt datetime2 NULL,
      createdAt datetime2 NOT NULL CONSTRAINT DF_session_access_created DEFAULT SYSUTCDATETIME(),
      decidedAt datetime2 NULL,
      CONSTRAINT CK_session_access_status CHECK (status IN ('pending','approved','denied','revoked')),
      CONSTRAINT CK_session_access_distinct CHECK (requesterId<>ownerId),
      CONSTRAINT CK_session_access_grant CHECK (status<>'approved' OR (sessionId IS NOT NULL AND expiresAt IS NOT NULL))
    )`);
    await q.query(`CREATE UNIQUE INDEX UX_session_access_pending
      ON session_access_requests(requesterId,ownerId) WHERE status='pending'`);
    await q.query('CREATE INDEX IX_session_access_owner ON session_access_requests(ownerId,createdAt DESC)');
    await q.query(`INSERT INTO permissions(code,name,description)
      SELECT v.code,v.name,v.description FROM (VALUES
        ('classes.view',N'Xem lớp học',N'Danh sách và chi tiết lớp'),
        ('classes.manage',N'Quản trị lớp học',N'Tạo/sửa lớp, thêm/xoá thành viên lớp')
      ) v(code,name,description)
      WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.code=v.code)`);
    await q.query(`INSERT INTO role_permissions(roleId,permissionId)
      SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
      WHERE r.code IN ('admin','instructor') AND p.code IN ('classes.view','classes.manage')
        AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.roleId=r.id AND rp.permissionId=p.id)`);
  }
}
