import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * User-facing activity feed (recent activity pages).
 * Distinct from audit_logs (security/compliance trail).
 */
@Entity({ name: 'activity_events' })
@Index('IX_activity_events_createdAt', ['createdAt'])
@Index('IX_activity_events_module_createdAt', ['module', 'createdAt'])
export class ActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'actorId', nullable: true })
  actorId!: string | null;

  @Column({ type: 'nvarchar', length: 64, name: 'module' })
  module!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'action' })
  action!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'targetType', nullable: true })
  targetType!: string | null;

  @Column({ type: 'nvarchar', length: 64, name: 'targetId', nullable: true })
  targetId!: string | null;

  @Column({ type: 'nvarchar', length: 512, name: 'summary', nullable: true })
  summary!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
