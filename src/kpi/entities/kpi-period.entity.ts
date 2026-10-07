import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { KpiPeriodStatus, KPI_RULE_VERSION_V1 } from '../kpi-status.machine';

/**
 * KpiPeriod (Phase 5, spec 23) — an explicit versioned KPI window.
 * `ruleVersion` is persisted per period AND per result: a future formula
 * change ships as kpi-v2, never a silent rewrite of kpi-v1 (spec 76).
 */
@Entity({ name: 'kpi_periods' })
@Index('UX_kpi_periods_code', ['code'], { unique: true })
@Index('IX_kpi_periods_status_dates', ['status', 'startDate', 'endDate'])
export class KpiPeriod {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 256, name: 'name' })
  name!: string;

  /** Inclusive start (UTC). */
  @Column({ type: 'datetime2', name: 'startDate' })
  startDate!: Date;

  /** Exclusive end (UTC) — CHECK endDate > startDate (spec 57). */
  @Column({ type: 'datetime2', name: 'endDate' })
  endDate!: Date;

  @Column({ type: 'nvarchar', length: 16, name: 'status', default: 'draft' })
  status!: KpiPeriodStatus;

  @Column({ type: 'nvarchar', length: 32, name: 'ruleVersion', default: KPI_RULE_VERSION_V1 })
  ruleVersion!: string;

  @Column('uuid', { name: 'createdById', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
