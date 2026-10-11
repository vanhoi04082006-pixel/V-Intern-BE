import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassSchedule1760822400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE classes ADD meetingSchedule nvarchar(128) NULL, meetingLocation nvarchar(128) NULL, progress int NOT NULL CONSTRAINT DF_classes_progress DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE classes ADD CONSTRAINT CK_classes_progress CHECK (progress BETWEEN 0 AND 100)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    const used = await queryRunner.query(`SELECT TOP 1 id FROM classes WHERE meetingSchedule IS NOT NULL OR meetingLocation IS NOT NULL OR progress <> 0`);
    if (used.length) throw new Error('Class schedule data exists; preserve it before reverting this migration.');
    await queryRunner.query(`ALTER TABLE classes DROP CONSTRAINT CK_classes_progress, DF_classes_progress`);
    await queryRunner.query(`ALTER TABLE classes DROP COLUMN meetingSchedule, meetingLocation, progress`);
  }
}
