import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Class membership (composite PK; FKs CASCADE to classes/users). */
@Entity({ name: 'class_members' })
export class ClassMember {
  @PrimaryColumn('uuid', { name: 'classId' })
  classId!: string;

  @PrimaryColumn('uuid', { name: 'userId' })
  userId!: string;

  @CreateDateColumn({ type: 'datetime2', name: 'joinedAt' })
  joinedAt!: Date;
}
