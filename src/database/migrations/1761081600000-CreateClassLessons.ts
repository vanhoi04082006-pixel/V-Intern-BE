import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateClassLessons1761081600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE class_lessons (
      id uniqueidentifier NOT NULL CONSTRAINT DF_class_lessons_id DEFAULT NEWID() CONSTRAINT PK_class_lessons PRIMARY KEY,
      classId uniqueidentifier NOT NULL CONSTRAINT FK_class_lessons_class REFERENCES classes(id),
      title nvarchar(256) NOT NULL, startsAt datetime2 NOT NULL, endsAt datetime2 NOT NULL,
      mode nvarchar(16) NOT NULL CONSTRAINT CK_class_lessons_mode CHECK(mode IN ('online','on_site')),
      location nvarchar(256) NOT NULL, status nvarchar(16) NOT NULL CONSTRAINT DF_class_lessons_status DEFAULT 'scheduled'
        CONSTRAINT CK_class_lessons_status CHECK(status IN ('scheduled','completed','cancelled')),
      version int NOT NULL CONSTRAINT DF_class_lessons_version DEFAULT 1,
      createdById uniqueidentifier NOT NULL CONSTRAINT FK_class_lessons_actor REFERENCES users(id),
      createdAt datetime2 NOT NULL CONSTRAINT DF_class_lessons_createdAt DEFAULT SYSUTCDATETIME(),
      updatedAt datetime2 NOT NULL CONSTRAINT DF_class_lessons_updatedAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT CK_class_lessons_interval CHECK(endsAt > startsAt),
      CONSTRAINT UQ_class_lessons_start UNIQUE(classId,startsAt)
    )`);
    await q.query(`CREATE TABLE class_attendance (
      lessonId uniqueidentifier NOT NULL CONSTRAINT FK_class_attendance_lesson REFERENCES class_lessons(id),
      userId uniqueidentifier NOT NULL CONSTRAINT FK_class_attendance_user REFERENCES users(id),
      status nvarchar(16) NOT NULL CONSTRAINT CK_class_attendance_status CHECK(status IN ('present','late','absent','excused')),
      note nvarchar(512) NULL, markedById uniqueidentifier NOT NULL CONSTRAINT FK_class_attendance_actor REFERENCES users(id),
      updatedAt datetime2 NOT NULL CONSTRAINT DF_class_attendance_updatedAt DEFAULT SYSUTCDATETIME(),
      CONSTRAINT PK_class_attendance PRIMARY KEY(lessonId,userId)
    )`);
    await q.query(`CREATE TABLE class_announcements (
      id uniqueidentifier NOT NULL CONSTRAINT DF_class_announcements_id DEFAULT NEWID() CONSTRAINT PK_class_announcements PRIMARY KEY,
      classId uniqueidentifier NOT NULL CONSTRAINT FK_class_announcements_class REFERENCES classes(id),
      title nvarchar(256) NOT NULL, body nvarchar(2000) NOT NULL,
      createdById uniqueidentifier NOT NULL CONSTRAINT FK_class_announcements_actor REFERENCES users(id),
      createdAt datetime2 NOT NULL CONSTRAINT DF_class_announcements_createdAt DEFAULT SYSUTCDATETIME()
    )`);
    await q.query('CREATE INDEX IX_class_lessons_start ON class_lessons(startsAt,classId)');
    await q.query('CREATE INDEX IX_class_announcements_class ON class_announcements(classId,createdAt)');
  }
  async down(q: QueryRunner): Promise<void> {
    if ((await q.query('SELECT TOP(1) id FROM class_lessons UNION ALL SELECT TOP(1) id FROM class_announcements')).length) throw new Error('Preserve class lesson history before reverting.');
    await q.query('DROP TABLE class_attendance'); await q.query('DROP TABLE class_announcements'); await q.query('DROP TABLE class_lessons');
  }
}
