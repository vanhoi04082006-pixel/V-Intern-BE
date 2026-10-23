import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Append-only through the domain API; never exposed as an intern rubric. */
@Entity({ name: 'career_role_revisions' })
export class CareerRoleRevision {
  @PrimaryColumn({ type: 'nvarchar', length: 32 })
  roleCode!: string;

  @PrimaryColumn({ type: 'int' })
  version!: number;

  @Column({ type: 'nvarchar', length: 'max' })
  snapshotJson!: string;

  @Column({ type: 'uniqueidentifier', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ type: 'datetime2' })
  createdAt!: Date;
}
