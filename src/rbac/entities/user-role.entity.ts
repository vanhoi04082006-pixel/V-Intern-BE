import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Direct user→role assignment (composite PK; FKs CASCADE to users/roles). */
@Entity({ name: 'user_roles' })
export class UserRole {
  @PrimaryColumn('uuid', { name: 'userId' })
  userId!: string;

  @PrimaryColumn('uuid', { name: 'roleId' })
  roleId!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'grantedAt' })
  grantedAt!: Date;
}
