import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EvaluationCriterion } from './evaluation-criterion.entity';

/** One score per (evaluation, criterion) — DB-enforced (spec 12). */
@Entity({ name: 'evaluation_scores' })
@Index('UX_evaluation_scores_evaluation_criterion', ['evaluationId', 'criterionId'], { unique: true })
@Index('IX_evaluation_scores_evaluationId', ['evaluationId'])
export class EvaluationScore {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'evaluationId' })
  evaluationId!: string;

  @Column('uuid', { name: 'criterionId' })
  criterionId!: string;

  /** 0..100 (DB CHECK; criterion.maxScore bounds the input validation). */
  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'score' })
  score!: number;

  @Column({ type: 'nvarchar', length: 1024, name: 'comment', nullable: true })
  comment!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;

  criterion?: EvaluationCriterion;
}
