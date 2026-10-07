import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TaskStatus } from '../task-status.machine';

/**
 * Append-only status history (spec 12). Every REAL status change writes one
 * row in the SAME transaction as the task update. Creation seeds a row with
 * fromStatus = null → 'todo'. Progress-only updates never create history.
 */
@Entity({ name: 'task_status_histories' })
@Index('IX_task_status_histories_taskId_createdAt', ['taskId', 'createdAt'])
export class TaskStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'taskId' })
  taskId!: string;

  @Column({ type: 'nvarchar', length: 16, name: 'fromStatus', nullable: true })
  fromStatus!: TaskStatus | null;

  @Column({ type: 'nvarchar', length: 16, name: 'toStatus' })
  toStatus!: TaskStatus;

  @Column({ type: 'uuid', name: 'changedById', nullable: true })
  changedById!: string | null;

  @Column({ type: 'nvarchar', length: 512, name: 'reason', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
