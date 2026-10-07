import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SprintStatus } from '../sprint-status.machine';

@Entity({ name: 'sprints' })
@Index('UX_sprints_code', ['code'], { unique: true })
@Index('IX_sprints_projectId_status', ['projectId', 'status'])
@Index('IX_sprints_sessionId', ['sessionId'])
// Filtered unique index (SQL Server syntax, enforced by the migration):
// at most ONE active sprint per project. Declared here for metadata
// completeness; the migration remains the single source of truth.
@Index('UX_sprints_project_active', ['projectId'], { unique: true, where: "[status] = 'active'" })
export class Sprint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 256, name: 'name' })
  name!: string;

  @Column({ type: 'nvarchar', name: 'description', nullable: true })
  description!: string | null;

  @Column({ type: 'uuid', name: 'projectId' })
  projectId!: string;

  @Column({ type: 'uuid', name: 'sessionId', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'planned' })
  status!: SprintStatus;

  @Column({ type: 'nvarchar', length: 512, name: 'goal', nullable: true })
  goal!: string | null;

  @Column({ type: 'datetime2', name: 'startDate' })
  startDate!: Date;

  @Column({ type: 'datetime2', name: 'endDate' })
  endDate!: Date;

  @Column({ type: 'uuid', name: 'createdById', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
