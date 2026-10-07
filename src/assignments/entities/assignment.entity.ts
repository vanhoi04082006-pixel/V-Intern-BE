import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const ASSIGNMENT_STATUSES = ['active', 'completed', 'cancelled'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

@Entity({ name: 'assignments' })
@Index('IX_assignments_internId', ['internId', 'status'])
@Index('IX_assignments_projectId_status', ['projectId', 'status'])
@Index('IX_assignments_sessionId_status', ['sessionId', 'status'])
// Filtered unique index (SQL Server syntax, enforced by the migration):
// at most ONE active assignment per intern. Declared here for metadata
// completeness; the migration remains the single source of truth.
@Index('UX_assignments_intern_active', ['internId'], { unique: true, where: "[status] = 'active'" })
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'internId' })
  internId!: string;

  @Column({ type: 'uuid', name: 'projectId' })
  projectId!: string;

  @Column({ type: 'uuid', name: 'sessionId' })
  sessionId!: string;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'active' })
  status!: AssignmentStatus;

  @Column({ type: 'uuid', name: 'assignedById', nullable: true })
  assignedById!: string | null;

  @Column({ type: 'datetime2', name: 'assignedAt' })
  assignedAt!: Date;

  @Column({ type: 'datetime2', name: 'completedAt', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
