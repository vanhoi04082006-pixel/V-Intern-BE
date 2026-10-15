import { MigrationInterface, QueryRunner } from 'typeorm';
export class SnapshotCertificateCompletion1762377600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE certificates ADD completedAt datetime2 NULL,
      holderNameSnapshot nvarchar(256) NULL,roleLabelSnapshot nvarchar(128) NULL,
      projectNameSnapshot nvarchar(256) NULL,sessionNameSnapshot nvarchar(256) NULL`);
    // Legacy display data is captured at migration time, not reconstructed as issuance-time history.
    // Preserve old certificate identities and all revocation metadata.
    await q.query(`UPDATE c SET completedAt=a.completedAt,holderNameSnapshot=u.displayName,
      projectNameSnapshot=p.name,sessionNameSnapshot=s.name,
      roleLabelSnapshot=CASE rp.selectedRole WHEN 'frontend' THEN N'Frontend Developer' WHEN 'backend' THEN N'Backend Developer'
        WHEN 'fullstack' THEN N'Fullstack Developer' WHEN 'qa' THEN N'QA Tester' WHEN 'business_analyst' THEN N'Business Analyst' ELSE rp.selectedRole END
      FROM certificates c LEFT JOIN assignments a ON a.id=c.assignmentId AND a.status='completed'
      LEFT JOIN users u ON u.id=c.userId LEFT JOIN recruitment_profiles rp ON rp.userId=c.userId
      LEFT JOIN projects p ON p.id=c.projectId LEFT JOIN internship_sessions s ON s.id=c.sessionId`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE certificates DROP COLUMN completedAt,holderNameSnapshot,roleLabelSnapshot,projectNameSnapshot,sessionNameSnapshot');
  }
}
