import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * KpiResult (Phase 5, spec 22/58) — a persisted historical SNAPSHOT for
 * one (period, user). Once written it explains the score from its own
 * component rows even if the underlying tasks/evaluations later change.
 * `finalScore` is null exactly when status = insufficient_data (spec 25).
 */
@Entity({ name: 'kpi_results' })
@Index('UX_kpi_results_period_user', ['periodId', 'userId'], { unique: true })
@Index('IX_kpi_results_user_period', ['userId', 'periodId'])
export class KpiResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'periodId' })
  periodId!: string;

  @Column('uuid', { name: 'userId' })
  userId!: string;

  @Column({ type: 'nvarchar', length: 32, name: 'ruleVersion' })
  ruleVersion!: string;

  @Column({ type: 'nvarchar', length: 24, name: 'status' })
  status!: 'calculated' | 'insufficient_data';

  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'finalScore', nullable: true })
  finalScore!: number | null;

  @Column({ type: 'datetime2', name: 'calculatedAt' })
  calculatedAt!: Date;

  /** null = computed by the system batch (no human actor). */
  @Column('uuid', { name: 'calculatedById', nullable: true })
  calculatedById!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
