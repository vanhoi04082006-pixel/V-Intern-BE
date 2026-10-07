import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { TaskPriority, TaskStatus } from '../task-status.machine';

@Entity({ name: 'tasks' })
@Index('UX_tasks_code', ['code'], { unique: true })
@Index('IX_tasks_projectId_status', ['projectId', 'status'])
@Index('IX_tasks_sprintId_status', ['sprintId', 'status'])
@Index('IX_tasks_assigneeId_status', ['assigneeId', 'status'])
@Index('IX_tasks_dueDate', ['dueDate'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Human code (e.g. VIN-103) generated from a SQL Server SEQUENCE — never count()+1. */
  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 256, name: 'title' })
  title!: string;

  @Column({ type: 'nvarchar', name: 'description', nullable: true })
  description!: string | null;

  @Column({ type: 'uuid', name: 'projectId' })
  projectId!: string;

  @Column({ type: 'uuid', name: 'sprintId', nullable: true })
  sprintId!: string | null;

  @Column({ type: 'uuid', name: 'assigneeId', nullable: true })
  assigneeId!: string | null;

  @Column({ type: 'uuid', name: 'createdById', nullable: true })
  createdById!: string | null;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'todo' })
  status!: TaskStatus;

  @Column({ type: 'nvarchar', length: 16, name: 'priority', default: 'medium' })
  priority!: TaskPriority;

  @Column({ type: 'int', name: 'storyPoints', nullable: true })
  storyPoints!: number | null;

  @Column({ type: 'int', name: 'progress', default: 0 })
  progress!: number;

  @Column({ type: 'datetime2', name: 'dueDate', nullable: true })
  dueDate!: Date | null;

  /**
   * Optimistic-concurrency token (spec 25): every UPDATE carries
   * `WHERE version = <loaded>`; a losing concurrent writer surfaces as
   * OptimisticLockVersionMismatchError, mapped to 409 TASK_VERSION_CONFLICT.
   * SQL Server row locks inside transactions serialize transitions first;
   * the version predicate is the belt-and-suspenders guarantee.
   */
  @VersionColumn({ type: 'int', name: 'version' })
  version!: number;

  @Column({ type: 'datetime2', name: 'deletedAt', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
