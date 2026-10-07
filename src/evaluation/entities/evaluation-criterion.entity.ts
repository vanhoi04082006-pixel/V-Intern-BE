import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { EvaluationCycle } from './evaluation-cycle.entity';

/**
 * EvaluationCriterion (Phase 5) — a cycle-scoped snapshot criterion with a
 * percentage weight (0 < w <= 100). The service requires the ACTIVE total
 * to equal exactly 100 at cycle open and finalization (DB CHECK bounds the
 * value; the service enforces the sum — never the frontend).
 */
@Entity({ name: 'evaluation_criteria' })
@Index('UX_evaluation_criteria_cycle_code', ['cycleId', 'code'], { unique: true })
@Index('IX_evaluation_criteria_cycleId', ['cycleId'])
export class EvaluationCriterion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'cycleId' })
  cycleId!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'name' })
  name!: string;

  @Column({ type: 'nvarchar', length: 512, name: 'description', nullable: true })
  description!: string | null;

  /** Percentage weight (2dp) — service validates the sum == 100. */
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'weight' })
  weight!: number;

  /** Max score for this criterion (default 100 — scores are 0..max). */
  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'maxScore', default: 100 })
  maxScore!: number;

  @Column({ type: 'int', name: 'sortOrder', default: 0 })
  sortOrder!: number;

  /** Required criteria MUST be scored before submit/finalize. */
  @Column({ type: 'bit', name: 'isRequired', default: true })
  isRequired!: boolean;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  cycle?: EvaluationCycle;
}
