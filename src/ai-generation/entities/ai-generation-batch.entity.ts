import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Idempotency record for AI sprint/task generation confirms
 * (redesign §41/§42). One requestId per instructor creates at most one
 * batch; replays return the stored summary instead of duplicating sprints.
 */
@Entity({ name: 'ai_generation_batches' })
export class AiGenerationBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'requestId' })
  requestId!: string;

  @Column('uuid', { name: 'createdById' })
  createdById!: string;

  @Column('uuid', { name: 'projectId' })
  projectId!: string;

  @Column('uuid', { name: 'sessionId' })
  sessionId!: string;

  @Column({ type: 'nvarchar', length: 'max', name: 'summaryJson' })
  summaryJson!: string;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'ready' })
  status!: string;

  @Column({ type: 'nvarchar', length: 'max', name: 'draftJson', nullable: true })
  draftJson!: string | null;

  @Column({ type: 'nvarchar', length: 'max', name: 'errorJson', nullable: true })
  errorJson!: string | null;

  @Column({ type: 'int', name: 'templateVersion', nullable: true })
  templateVersion!: number | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
