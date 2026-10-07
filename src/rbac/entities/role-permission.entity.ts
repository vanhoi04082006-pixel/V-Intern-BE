import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Role→permission grant (composite PK; FKs CASCADE to roles/permissions). */
@Entity({ name: 'role_permissions' })
export class RolePermission {
  @PrimaryColumn('uuid', { name: 'roleId' })
  roleId!: string;

  @PrimaryColumn('uuid', { name: 'permissionId' })
  permissionId!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'grantedAt' })
  grantedAt!: Date;
}
