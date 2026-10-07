import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'user_groups' })
@Index('UX_user_groups_code', ['code'], { unique: true })
export class UserGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'name' })
  name!: string;

  @Column({ type: 'nvarchar', length: 512, name: 'description', nullable: true })
  description!: string | null;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
