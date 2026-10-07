import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'task_comments' })
@Index('IX_task_comments_taskId_createdAt', ['taskId', 'createdAt'])
export class TaskComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'taskId' })
  taskId!: string;

  @Column({ type: 'uuid', name: 'authorId' })
  authorId!: string;

  /** Content is bounded (1..2000 chars, DTO-enforced) — Vietnamese-safe nvarchar. */
  @Column({ type: 'nvarchar', length: 2000, name: 'content' })
  content!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
