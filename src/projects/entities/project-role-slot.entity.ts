import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Required member roles per project (redesign §7/§15).
 * A slot is a planning target: { projectId, roleCode, requiredCount }.
 * Assignment with a role enforces the cap (409 ROLE_SLOT_FULL);
 * assignments without a role stay open for backward compatibility.
 */
@Entity({ name: 'project_role_slots' })
export class ProjectRoleSlot {
  @PrimaryColumn('uuid', { name: 'projectId' })
  projectId!: string;

  @PrimaryColumn('nvarchar', { name: 'roleCode', length: 64 })
  roleCode!: string;

  @Column('int', { name: 'requiredCount' })
  requiredCount!: number;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
