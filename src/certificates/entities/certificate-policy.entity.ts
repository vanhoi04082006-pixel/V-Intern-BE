import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * CertificatePolicy (Phase 5, spec 42/43) — an explicit VERSIONED
 * eligibility policy. Issuance reads the active row and stamps
 * (policyCode, policyVersion) onto every certificate so eligibility is
 * reproducible forever; future threshold changes ship as version 2.
 */
@Entity({ name: 'certificate_policies' })
@Index('UX_certificate_policies_code_version', ['code', 'version'], { unique: true })
export class CertificatePolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'int', name: 'version' })
  version!: number;

  @Column({ type: 'nvarchar', length: 256, name: 'name' })
  name!: string;

  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'minEvaluationScore' })
  minEvaluationScore!: number;

  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'minKpiScore' })
  minKpiScore!: number;

  @Column({ type: 'bit', name: 'requireRecruitmentPassed', default: true })
  requireRecruitmentPassed!: boolean;

  @Column({ type: 'bit', name: 'requireCompletedAssignment', default: true })
  requireCompletedAssignment!: boolean;

  @Column({ type: 'bit', name: 'isActive', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
