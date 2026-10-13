import { MigrationInterface, QueryRunner } from 'typeorm';
export class ExpandAcademicStates1760736000000 implements MigrationInterface {
  async up(q:QueryRunner):Promise<void> {
    await q.query("ALTER TABLE classes DROP CONSTRAINT CK_classes_status");
    await q.query("ALTER TABLE classes ADD CONSTRAINT CK_classes_status CHECK(status IN ('upcoming','active','paused','completed','cancelled'))");
    await q.query("ALTER TABLE projects DROP CONSTRAINT CK_projects_status");
    await q.query("ALTER TABLE projects ADD CONSTRAINT CK_projects_status CHECK(status IN ('draft','recruiting','active','paused','completed','archived'))");
  }
  async down(q:QueryRunner):Promise<void> {
    const rows: {count:number}[]=await q.query("SELECT (SELECT COUNT(*) FROM classes WHERE status='paused')+(SELECT COUNT(*) FROM projects WHERE status IN ('recruiting','paused')) count");
    if(rows[0].count)throw new Error('Cannot revert while the expanded academic states are in use.');
    await q.query("ALTER TABLE projects DROP CONSTRAINT CK_projects_status");
    await q.query("ALTER TABLE projects ADD CONSTRAINT CK_projects_status CHECK(status IN ('draft','active','completed','archived'))");
    await q.query("ALTER TABLE classes DROP CONSTRAINT CK_classes_status");
    await q.query("ALTER TABLE classes ADD CONSTRAINT CK_classes_status CHECK(status IN ('upcoming','active','completed','cancelled'))");
  }
}
