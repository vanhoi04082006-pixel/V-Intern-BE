import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'roles' })
@Index('UX_roles_code', ['code'], { unique: true })
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'nvarchar', length: 64, name: 'code' })
  code!: string;

  @Column({ type: 'nvarchar', length: 128, name: 'name' })
  name!: string;

  @Column({ type: 'nvarchar', length: 512, name: 'description', nullable: true })
  description!: string | null;

  @Column({ type: 'bit', name: 'isSystem', default: false })
  isSystem!: boolean;

  @CreateDateColumn({ type: 'datetime2', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime2', name: 'updatedAt' })
  updatedAt!: Date;
}
