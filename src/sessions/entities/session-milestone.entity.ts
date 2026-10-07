import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

@Entity({ name: 'session_milestones' })
@Index('IX_session_milestones_session_sort', ['sessionId', 'sortOrder'])
export class SessionMilestone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'sessionId' })
  sessionId!: string;

  @Column({ type: 'nvarchar', length: 256, name: 'title' })
  title!: string;

  @Column({ type: 'nvarchar', name: 'description', nullable: true })
  description!: string | null;

  @Column({ type: 'datetime2', name: 'dueDate', nullable: true })
  dueDate!: Date | null;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'pending' })
  status!: MilestoneStatus;

  @Column({ type: 'int', name: 'sortOrder', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
