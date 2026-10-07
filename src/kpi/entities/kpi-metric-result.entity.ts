import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * KpiMetricResult (Phase 5, spec 26) — full provenance for ONE KPI
 * component: the raw source value, the configured weight, the EFFECTIVE
 * (renormalized) weight actually applied, and the weighted contribution.
 * sourceJson carries the deterministic source facts (counts, scope,
 * formulas) so the value is reproducible from the persisted row alone.
 */
@Entity({ name: 'kpi_metric_results' })
@Index('UX_kpi_metric_results_result_code', ['kpiResultId', 'metricCode'], { unique: true })
@Index('IX_kpi_metric_results_resultId', ['kpiResultId'])
export class KpiMetricResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'kpiResultId' })
  kpiResultId!: string;

  @Column({ type: 'nvarchar', length: 16, name: 'metricCode' })
  metricCode!: 'delivery' | 'quality' | 'timeliness';

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'configuredWeight' })
  configuredWeight!: number;

  /** weight / Σ(available weights) × 100 — null when this metric is unavailable. */
  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'effectiveWeight', nullable: true })
  effectiveWeight!: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 1, name: 'sourceValue', nullable: true })
  sourceValue!: number | null;

  /** value × effectiveWeight / 100 (4dp) — null when unavailable. */
  @Column({ type: 'decimal', precision: 9, scale: 4, name: 'weightedContribution', nullable: true })
  weightedContribution!: number | null;

  @Column({ type: 'nvarchar', name: 'sourceJson' })
  sourceJson!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
