import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Certificate (Phase 5, spec 44/45) — issued/revoked only; a revoked
 * certificate is PRESERVED with its revoke metadata, never deleted.
 * certificateNumber comes from the certificate_number_seq SEQUENCE
 * (concurrency-safe, spec 46); verificationCode is an unguessable random
 * token distinct from the DB id (spec 47).
 */
@Entity({ name: 'certificates' })
@Index('UX_certificates_number', ['certificateNumber'], { unique: true })
@Index('UX_certificates_verificationCode', ['verificationCode'], { unique: true })
@Index('UX_certificates_user_policy', ['userId', 'policyCode', 'policyVersion'], { unique: true })
@Index('IX_certificates_userId_status', ['userId', 'status'])
export class Certificate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 32, name: 'certificateNumber' })
  certificateNumber!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'verificationCode' })
  verificationCode!: string;

  @Column('uuid', { name: 'userId' })
  userId!: string;

  /** Denormalized display context (plain columns — no FK cascade paths). */
  @Column('uuid', { name: 'projectId', nullable: true })
  projectId!: string | null;

  @Column('uuid', { name: 'sessionId', nullable: true })
  sessionId!: string | null;

  @Column('uuid', { name: 'assignmentId', nullable: true })
  assignmentId!: string | null;

  @Column('uuid', { name: 'evaluationId', nullable: true })
  evaluationId!: string | null;

  @Column('uuid', { name: 'kpiResultId', nullable: true })
  kpiResultId!: string | null;

  @Column({ type: 'nvarchar', length: 64, name: 'policyCode' })
  policyCode!: string;

  @Column({ type: 'int', name: 'policyVersion' })
  policyVersion!: number;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'issued' })
  status!: 'issued' | 'revoked';

  @Column({ type: 'datetime2', name: 'issuedAt' })
  issuedAt!: Date;

  @Column('uuid', { name: 'issuedById', nullable: true })
  issuedById!: string | null;

  @Column({ type: 'datetime2', name: 'revokedAt', nullable: true })
  revokedAt!: Date | null;

  @Column('uuid', { name: 'revokedById', nullable: true })
  revokedById!: string | null;

  @Column({ type: 'nvarchar', length: 512, name: 'revokeReason', nullable: true })
  revokeReason!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
