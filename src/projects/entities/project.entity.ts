import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const PROJECT_STATUSES = ['draft', 'active', 'completed', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type ProjectDifficulty = (typeof PROJECT_DIFFICULTIES)[number];

@Entity({ name: 'projects' })
@Index('UX_projects_code', ['code'], { unique: true })
@Index('IX_projects_status', ['status'])
@Index('IX_projects_mentorId', ['mentorId'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 256, name: 'name' })
  name!: string;

  @Column({ type: 'nvarchar', name: 'description' })
  description!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'domainCategory', nullable: true })
  domainCategory!: string | null;

  @Column({ type: 'nvarchar', length: 16, name: 'difficulty', default: 'beginner' })
  difficulty!: ProjectDifficulty;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'draft' })
  status!: ProjectStatus;

  @Column({ type: 'uuid', name: 'mentorId', nullable: true })
  mentorId!: string | null;

  /** Null = unlimited (documented business decision, spec 22). */
  @Column({ type: 'int', name: 'capacity', nullable: true })
  capacity!: number | null;

  @Column({ type: 'datetime2', name: 'startDate', nullable: true })
  startDate!: Date | null;

  @Column({ type: 'datetime2', name: 'endDate', nullable: true })
  endDate!: Date | null;

  @Column({ type: 'datetime2', name: 'archivedAt', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
