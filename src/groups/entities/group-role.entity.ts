import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Group→role inheritance (composite PK; FKs CASCADE).
 * Members of a group inherit every role granted to that group —
 * effective roles = direct (user_roles) ∪ inherited (group_roles).
 */
@Entity({ name: 'group_roles' })
export class GroupRole {
  @PrimaryColumn('uuid', { name: 'groupId' })
  groupId!: string;

  @PrimaryColumn('uuid', { name: 'roleId' })
  roleId!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'grantedAt' })
  grantedAt!: Date;
}
