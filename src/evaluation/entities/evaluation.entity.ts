import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EvaluationStatus } from '../evaluation-status.machine';
import { EvaluationCycle } from './evaluation-cycle.entity';

/**
 * Evaluation (Phase 5) — instructor-authored, human-authoritative.
 * Unique invariant (DB-enforced): ONE evaluation per (cycle, intern,
 * evaluator). The overall score is ALWAYS backend-computed from the
 * criterion scores and weights (spec 12) — no client-supplied overall
 * is ever accepted.
 */
@Entity({ name: 'evaluations' })
@Index('UX_evaluations_cycle_intern_evaluator', ['cycleId', 'internId', 'evaluatorId'], { unique: true })
@Index('IX_evaluations_intern_cycle_status', ['internId', 'cycleId', 'status'])
@Index('IX_evaluations_evaluator_status', ['evaluatorId', 'status'])
export class Evaluation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'cycleId' })
  cycleId!: string;

  @Column('uuid', { name: 'internId' })
  internId!: string;

  @Column('uuid', { name: 'evaluatorId' })
  evaluatorId!: string;

  /** Denormalized context from the cycle at creation time (plain columns). */
  @Column('uuid', { name: 'projectId', nullable: true })
  projectId!: string | null;

  @Column('uuid', { name: 'sessionId', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'draft' })
  status!: EvaluationStatus;

  /** Backend-computed weighted overall (null until first submit). */
  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'overallScore', nullable: true })
  overallScore!: number | null;

  @Column({ type: 'nvarchar', name: 'summary', nullable: true })
  summary!: string | null;

  @Column({ type: 'datetime2', name: 'submittedAt', nullable: true })
  submittedAt!: Date | null;

  @Column({ type: 'datetime2', name: 'finalizedAt', nullable: true })
  finalizedAt!: Date | null;

  /** Incremented by the privileged revision path (spec 14) — starts at 0. */
  @Column({ type: 'int', name: 'revisionNumber', default: 0 })
  revisionNumber!: number;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;

  cycle?: EvaluationCycle;
}
