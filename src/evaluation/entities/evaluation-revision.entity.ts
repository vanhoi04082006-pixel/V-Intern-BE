import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * EvaluationRevision (Phase 5, spec 14) — the immutable audit snapshot of
 * every privileged correction applied to a FINALIZED evaluation. The
 * finalized evaluation itself keeps its status; revisions accumulate.
 */
@Entity({ name: 'evaluation_revisions' })
@Index('UX_evaluation_revisions_evaluation_revision', ['evaluationId', 'revisionNumber'], { unique: true })
@Index('IX_evaluation_revisions_evaluationId', ['evaluationId'])
export class EvaluationRevision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'evaluationId' })
  evaluationId!: string;

  @Column({ type: 'int', name: 'revisionNumber' })
  revisionNumber!: number;

  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'previousOverallScore', nullable: true })
  previousOverallScore!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'newOverallScore', nullable: true })
  newOverallScore!: number | null;

  @Column({ type: 'nvarchar', length: 1000, name: 'reason' })
  reason!: string;

  @Column('uuid', { name: 'changedById' })
  changedById!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
