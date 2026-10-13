import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateReferenceScreens1760649600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE reference_screens (
      screenKey nvarchar(64) NOT NULL PRIMARY KEY,
      title nvarchar(256) NOT NULL,
      role nvarchar(16) NOT NULL,
      sourceFile nvarchar(256) NOT NULL,
      payload nvarchar(max) NOT NULL CHECK (ISJSON(payload)=1),
      updatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
    )`);
  }
  async down(runner: QueryRunner): Promise<void> { await runner.query('DROP TABLE reference_screens'); }
}
