import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EvaluationCycleStatus, EvaluationCycleType } from '../evaluation-status.machine';

/**
 * EvaluationCycle (Phase 5) — the instructor-owned evaluation container.
 * Explicit state machine (draft/open/closed/archived); submissions are
 * accepted ONLY while open.
 */
@Entity({ name: 'evaluation_cycles' })
@Index('UX_evaluation_cycles_code', ['code'], { unique: true })
@Index('IX_evaluation_cycles_status_dates', ['status', 'startDate', 'endDate'])
export class EvaluationCycle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 256, name: 'name' })
  name!: string;

  /** Optional scoping — when BOTH are null the cycle is admin-managed (documented). */
  @Column('uuid', { name: 'sessionId', nullable: true })
  sessionId!: string | null;

  @Column('uuid', { name: 'projectId', nullable: true })
  projectId!: string | null;

  @Column({ type: 'nvarchar', length: 24, name: 'type', default: 'sprint' })
  type!: EvaluationCycleType;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'draft' })
  status!: EvaluationCycleStatus;

  @Column({ type: 'datetime2', name: 'startDate' })
  startDate!: Date;

  /** Exclusive end (UTC) — CHECK endDate > startDate. */
  @Column({ type: 'datetime2', name: 'endDate' })
  endDate!: Date;

  @Column({ type: 'datetime2', name: 'dueDate', nullable: true })
  dueDate!: Date | null;

  @Column('uuid', { name: 'createdById', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
