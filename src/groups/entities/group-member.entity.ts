import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Group membership (composite PK; FKs CASCADE to user_groups/users). */
@Entity({ name: 'group_members' })
export class GroupMember {
  @PrimaryColumn('uuid', { name: 'groupId' })
  groupId!: string;

  @PrimaryColumn('uuid', { name: 'userId' })
  userId!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'joinedAt' })
  joinedAt!: Date;
}
