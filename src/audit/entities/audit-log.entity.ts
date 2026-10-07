import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Security/compliance audit trail — append-only by design.
 * Distinct from activity_events (user-facing feed).
 */
@Entity({ name: 'audit_logs' })
@Index('IX_audit_logs_actor_createdAt', ['actorId', 'createdAt'])
@Index('IX_audit_logs_action_createdAt', ['action', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'actorId', nullable: true })
  actorId!: string | null;

  @Column({ type: 'nvarchar', length: 128, name: 'action' })
  action!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'targetType', nullable: true })
  targetType!: string | null;

  @Column({ type: 'nvarchar', length: 64, name: 'targetId', nullable: true })
  targetId!: string | null;

  @Column({ type: 'nvarchar', length: 'max', name: 'detail', nullable: true })
  detail!: string | null;

  @Column({ type: 'nvarchar', length: 64, name: 'ip', nullable: true })
  ip!: string | null;

  @Column({ type: 'nvarchar', length: 256, name: 'userAgent', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
