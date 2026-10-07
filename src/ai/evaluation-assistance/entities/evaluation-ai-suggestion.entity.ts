import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * EvaluationAiSuggestion (Phase 6, spec 20-27) — APPEND-ONLY instructor
 * workspace data. Every generation inserts a NEW row; nothing is mutated
 * in place (spec 25). It has ZERO authority: nothing here ever writes
 * into evaluation_scores or changes an evaluation's status/score — the
 * Instructor stays the ONLY authority (Phase 5, spec 24). The structured
 * suggestion payload is validated against the evaluation cycle's real
 * criteria before persistence (unknown criterion code → reject).
 */
@Entity({ name: 'evaluation_ai_suggestions' })
@Index('IX_evaluation_ai_suggestions_evaluation_createdAt', ['evaluationId', 'createdAt'])
export class EvaluationAiSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'evaluationId' })
  evaluationId!: string;

  /** AIRun provenance (plain column — survives evaluation lifecycle). */
  @Column('uuid', { name: 'aiRunId', nullable: true })
  aiRunId!: string | null;

  /** Explicit prompt version, e.g. 'evaluation-assistance-v1' (spec 51). */
  @Column({ type: 'nvarchar', length: 64, name: 'promptVersion' })
  promptVersion!: string;

  /** generated | applied | discarded — 'applied' records explicit use. */
  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'generated' })
  status!: 'generated' | 'applied' | 'discarded';

  /** Validated structured suggestion JSON (bounded, spec 23). */
  @Column({ type: 'nvarchar', name: 'suggestionJson' })
  suggestionJson!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'generatedAt' })
  createdAt!: Date;

  @Column({ type: 'datetime2', name: 'acceptedAt', nullable: true })
  acceptedAt!: Date | null;

  @Column('uuid', { name: 'acceptedById', nullable: true })
  acceptedById!: string | null;
}
