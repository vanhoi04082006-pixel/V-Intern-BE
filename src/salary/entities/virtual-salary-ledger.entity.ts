import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export const VIRTUAL_SALARY_LEDGER_TYPES = ['kpi_earning', 'bonus', 'penalty', 'adjustment', 'reversal'] as const;
export type VirtualSalaryLedgerType = (typeof VIRTUAL_SALARY_LEDGER_TYPES)[number];

export const VIRTUAL_SALARY_UNIT_DEFAULT = 'VND_VIRTUAL';

/**
 * VirtualSalaryLedger (Phase 5, spec 31/32) — the AUTHORITATIVE virtual
 * salary record. There is NO balance column anywhere: balance is ALWAYS
 * SUM(amount) over this append-only table. Historical rows are never
 * updated or deleted; corrections are new reversal/adjustment entries.
 * `idempotencyKey` is UNIQUE — double generation is impossible at the DB.
 */
@Entity({ name: 'virtual_salary_ledger' })
@Index('UX_virtual_salary_ledger_idempotencyKey', ['idempotencyKey'], { unique: true })
@Index('IX_virtual_salary_ledger_user_createdAt', ['userId', 'createdAt'])
@Index('IX_virtual_salary_ledger_kpiPeriodId', ['kpiPeriodId'])
export class VirtualSalaryLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'userId' })
  userId!: string;

  @Column('uuid', { name: 'kpiPeriodId', nullable: true })
  kpiPeriodId!: string | null;

  @Column({ type: 'nvarchar', length: 24, name: 'type' })
  type!: VirtualSalaryLedgerType;

  /** SIGNED amount — bonus > 0, penalty < 0. Zero is forbidden (DB CHECK). */
  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'amount' })
  amount!: number;

  /** Explicit virtual unit — never presented as real payroll (spec 33). */
  @Column({ type: 'nvarchar', length: 24, name: 'unit', default: VIRTUAL_SALARY_UNIT_DEFAULT })
  unit!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'sourceType' })
  sourceType!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'sourceId', nullable: true })
  sourceId!: string | null;

  @Column({ type: 'nvarchar', length: 512, name: 'description' })
  description!: string;

  @Column('uuid', { name: 'createdById', nullable: true })
  createdById!: string | null;

  @Column({ type: 'nvarchar', length: 200, name: 'idempotencyKey' })
  idempotencyKey!: string;

  @Column({ type: 'nvarchar', name: 'metadataJson', nullable: true })
  metadataJson!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;
}
